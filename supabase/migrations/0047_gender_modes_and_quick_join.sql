-- 0047 — Gender-aware partner mixer + quick-account cold join.
--
-- Product changes behind this migration:
--
--   1. The partner mixer now honors tournaments.gender_mode instead of
--      always assuming mixed doubles:
--        · mixed — every team is one player from pool a (men) and one from
--          pool b (women). This was the only behavior before.
--        · same  — teams are same-gender (M+M, F+F). Pools split each gender
--          cohort in half and the draw only pairs same-gender candidates.
--          Court re-grouping keeps M teams facing M teams where counts allow.
--        · open  — gender-blind. For league nights with skewed rosters
--          (e.g. 12 men, 2 women) where forcing gender rules would exclude
--          people. Pools just balance headcount.
--
--   2. profiles.gender — the cold-join quick profile now captures gender so
--      the mixer can seat people correctly, and it persists on the account
--      (survives an anonymous → permanent upgrade and future events).
--
--   3. app_mixer_join_with_profile gains p_gender and assigns pairing_pool
--      via the mode-aware helper rather than hardcoding f→b.
--
-- Function re-issues below preserve their latest bodies verbatim except for
-- the commented gender-mode changes: app_create_tournament (0038),
-- app_ensure_mixer_event (0043), app_mixer_bind_roster_entry (0038),
-- app_mixer_draw_round (0044), app_mixer_join_with_profile (0046).

set search_path = public;

-- ===========================================================================
-- 1. profiles.gender
-- ===========================================================================

alter table public.profiles
  add column if not exists gender text;

alter table public.profiles
  drop constraint if exists profiles_gender_chk;

alter table public.profiles
  add constraint profiles_gender_chk
  check (gender is null or gender in ('m', 'f', 'x'));

-- ===========================================================================
-- 2. Mode-aware pairing-pool assignment
-- ===========================================================================

-- Which pool should a (new) mixer participant land in?
--   mixed: men → a, women → b (unknown/x → a, matching prior behavior)
--   same:  balance within the player's own gender cohort so the draw can
--          form same-gender teams (each cohort splits across a and b)
--   open:  balance overall headcount, gender-blind
create or replace function public.app_mixer_pool_assign(
  p_tournament_id uuid,
  p_gender text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_a int;
  v_b int;
begin
  select gender_mode into v_mode from public.tournaments where id = p_tournament_id;
  v_mode := coalesce(v_mode, 'open');

  if v_mode = 'mixed' then
    return case when p_gender = 'f' then 'b' else 'a' end;
  end if;

  if v_mode = 'same' then
    select count(*) filter (where pes.pairing_pool = 'a'),
           count(*) filter (where pes.pairing_pool = 'b')
      into v_a, v_b
      from public.player_event_state pes
      join public.tournament_players tp on tp.id = pes.player_id
     where pes.tournament_id = p_tournament_id
       and tp.withdrawn_at is null
       and coalesce(tp.gender, 'x') = coalesce(p_gender, 'x');
  else
    select count(*) filter (where pes.pairing_pool = 'a'),
           count(*) filter (where pes.pairing_pool = 'b')
      into v_a, v_b
      from public.player_event_state pes
      join public.tournament_players tp on tp.id = pes.player_id
     where pes.tournament_id = p_tournament_id
       and tp.withdrawn_at is null;
  end if;

  return case when coalesce(v_a, 0) <= coalesce(v_b, 0) then 'a' else 'b' end;
end;
$$;

revoke all on function public.app_mixer_pool_assign(uuid, text) from public;
grant execute on function public.app_mixer_pool_assign(uuid, text) to authenticated;

-- ===========================================================================
-- 3. app_create_tournament — placeholder seeding follows gender_mode even
--    for partner mixers ('open' mixers get neutral "Player N" placeholders
--    instead of forced Male/Female alternation).
-- ===========================================================================

drop function if exists public.app_create_tournament(text, text, text, int, text, text);
create or replace function public.app_create_tournament(
  p_name text,
  p_format text,
  p_whatsapp_group_url text,
  p_player_count int,
  p_gender_mode text default 'open',
  p_pairing_mode text default 'random'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := public.app_require_auth();
  v_name    text := trim(coalesce(p_name, ''));
  v_format  text := coalesce(nullif(trim(p_format), ''), 'round_robin');
  v_url     text := nullif(trim(coalesce(p_whatsapp_group_url, '')), '');
  v_count   int  := greatest(0, least(coalesce(p_player_count, 0), 64));
  v_gender_mode text := lower(trim(coalesce(p_gender_mode, 'open')));
  v_pairing text := lower(trim(coalesce(p_pairing_mode, 'random')));
  new_id    uuid;
  v_male_cap int;
begin
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'tournament name must be 3-120 characters' using errcode = '22023';
  end if;
  if v_format not in ('round_robin', 'fixed_partners', 'bracket', 'partner_mixer') then
    raise exception 'unknown format %', v_format using errcode = '22023';
  end if;
  if v_url is not null and v_url not like 'https://chat.whatsapp.com/%' then
    raise exception 'invalid WhatsApp group URL' using errcode = '22023';
  end if;
  if v_gender_mode not in ('open', 'mixed', 'same') then
    raise exception 'unknown gender_mode' using errcode = '22023';
  end if;
  if v_pairing not in ('random', 'balanced', 'snake') then
    raise exception 'unknown pairing_mode' using errcode = '22023';
  end if;

  insert into public.tournaments (owner_user_id, name, format, whatsapp_group_url, gender_mode, pairing_mode)
  values (uid, v_name, v_format, v_url, v_gender_mode, v_pairing)
  returning id into new_id;

  if v_count > 0 then
    -- 0047: placeholder gender now keys off gender_mode alone. Previously
    -- `or v_format = 'partner_mixer'` forced M/F alternation onto every
    -- mixer, which is wrong for gender-blind ('open') mixers.
    if v_gender_mode = 'mixed' then
      insert into public.tournament_players (tournament_id, display_name, gender, dupr)
      select
        new_id,
        case when (gs.n % 2) = 1
          then 'Male ' || ((gs.n + 1) / 2)::text
          else 'Female ' || (gs.n / 2)::text
        end,
        case when (gs.n % 2) = 1 then 'm' else 'f' end,
        3.200
      from generate_series(1, v_count) as gs(n);
    elsif v_gender_mode = 'same' then
      v_male_cap := (v_count + 1) / 2;
      insert into public.tournament_players (tournament_id, display_name, gender, dupr)
      select
        new_id,
        case when gs.n <= v_male_cap
          then 'Male ' || gs.n::text
          else 'Female ' || (gs.n - v_male_cap)::text
        end,
        case when gs.n <= v_male_cap then 'm' else 'f' end,
        3.200
      from generate_series(1, v_count) as gs(n);
    else
      insert into public.tournament_players (tournament_id, display_name, dupr)
      select new_id, 'Player ' || gs.n::text, 3.200
      from generate_series(1, v_count) as gs(n);
    end if;
  end if;

  return new_id;
end;
$$;

revoke all on function public.app_create_tournament(text, text, text, int, text, text) from public;
grant execute on function public.app_create_tournament(text, text, text, int, text, text) to authenticated;

-- ===========================================================================
-- 4. app_ensure_mixer_event — bulk pool seeding follows gender_mode.
--    Body otherwise identical to 0043.
-- ===========================================================================

create or replace function public.app_ensure_mixer_event(
  p_tournament_id uuid,
  p_starting_tokens int default 10,
  p_starting_chips int default 100,
  p_rounds int default 5,
  p_courts int default 3,
  p_lock_seconds int default 86400,
  p_entry_fee numeric default 20,
  p_betting_enabled boolean default true,
  p_raffle_enabled boolean default true,
  p_downvotes_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_format text;
  v_gender_mode text;
  v_rounds int := greatest(1, least(coalesce(p_rounds, 5), 50));
  v_lock_seconds int := greatest(5, least(coalesce(p_lock_seconds, 86400), 604800));
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  select format, gender_mode into v_format, v_gender_mode
  from public.tournaments where id = p_tournament_id;
  if v_format <> 'partner_mixer' then
    raise exception 'tournament is not a partner mixer' using errcode = '22023';
  end if;
  v_gender_mode := coalesce(v_gender_mode, 'open');

  insert into public.event_config (
    tournament_id, starting_tokens, starting_chips, rounds, courts, lock_seconds,
    entry_fee, betting_enabled, raffle_enabled, downvotes_enabled
  )
  values (
    p_tournament_id,
    greatest(1, least(coalesce(p_starting_tokens, 10), 100)),
    greatest(0, coalesce(p_starting_chips, 100)),
    v_rounds,
    greatest(1, least(coalesce(p_courts, 3), 16)),
    v_lock_seconds,
    greatest(0, coalesce(p_entry_fee, 20)),
    coalesce(p_betting_enabled, true),
    coalesce(p_raffle_enabled, true),
    coalesce(p_downvotes_enabled, true)
  )
  on conflict (tournament_id) do update
     set starting_tokens = excluded.starting_tokens,
         starting_chips = excluded.starting_chips,
         rounds = excluded.rounds,
         courts = excluded.courts,
         lock_seconds = excluded.lock_seconds,
         entry_fee = excluded.entry_fee,
         betting_enabled = excluded.betting_enabled,
         raffle_enabled = excluded.raffle_enabled,
         downvotes_enabled = excluded.downvotes_enabled;

  insert into public.mixer_rounds (tournament_id, round_no, state, lock_at)
  select
    p_tournament_id,
    gs.round_no,
    'open',
    now() + make_interval(secs => v_lock_seconds)
  from generate_series(1, v_rounds) as gs(round_no)
  on conflict (tournament_id, round_no) do nothing;

  -- 0047: pool assignment per gender_mode —
  --   mixed: men → a, women → b (prior behavior)
  --   same:  alternate within each gender cohort so cohorts split across pools
  --   open:  alternate across the whole roster, gender-blind
  insert into public.player_event_state (
    player_id, tournament_id, pairing_pool, tokens_base_remaining, chips_remaining
  )
  select
    ranked.id,
    ranked.tournament_id,
    case
      when v_gender_mode = 'mixed' then (case when ranked.gender = 'f' then 'b' else 'a' end)
      when v_gender_mode = 'same' then (case when (ranked.cohort_rank % 2) = 1 then 'a' else 'b' end)
      else (case when (ranked.roster_rank % 2) = 1 then 'a' else 'b' end)
    end,
    ec.starting_tokens,
    ec.starting_chips
  from (
    select
      tp.id,
      tp.tournament_id,
      tp.gender,
      row_number() over (partition by coalesce(tp.gender, 'x') order by tp.created_at, tp.id) as cohort_rank,
      row_number() over (order by tp.created_at, tp.id) as roster_rank
    from public.tournament_players tp
    where tp.tournament_id = p_tournament_id
      and tp.withdrawn_at is null
  ) ranked
  join public.event_config ec on ec.tournament_id = ranked.tournament_id
  on conflict (player_id) do nothing;

  update public.tournaments
     set status = 'active'
   where id = p_tournament_id and status = 'draft';
end;
$$;

-- ===========================================================================
-- 5. app_mixer_bind_roster_entry — pool via helper. Body otherwise 0038.
-- ===========================================================================

create or replace function public.app_mixer_bind_roster_entry(
  p_tournament_id uuid,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_player_id uuid;
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
begin
  select id into v_player_id
  from public.tournament_players
  where tournament_id = p_tournament_id and profile_id = uid
  limit 1;
  if v_player_id is not null then
    return v_player_id;
  end if;

  select id into v_player_id
  from public.tournament_players
  where tournament_id = p_tournament_id and profile_id is null
  order by created_at
  limit 1;

  if v_player_id is null then
    insert into public.tournament_players (tournament_id, display_name, profile_id)
    values (p_tournament_id, coalesce(v_name, 'Guest player'), uid)
    returning id into v_player_id;
  else
    update public.tournament_players
       set profile_id = uid,
           display_name = coalesce(v_name, display_name)
     where id = v_player_id;
  end if;

  insert into public.tournament_members (tournament_id, user_id, role)
  values (p_tournament_id, uid, 'player')
  on conflict (tournament_id, user_id) do nothing;

  insert into public.player_event_state (
    player_id, tournament_id, pairing_pool, tokens_base_remaining, chips_remaining
  )
  select
    tp.id,
    tp.tournament_id,
    public.app_mixer_pool_assign(tp.tournament_id, tp.gender),
    ec.starting_tokens,
    ec.starting_chips
  from public.tournament_players tp
  join public.event_config ec on ec.tournament_id = tp.tournament_id
  where tp.id = v_player_id
  on conflict (player_id) do nothing;

  return v_player_id;
end;
$$;

-- ===========================================================================
-- 6. app_mixer_join_with_profile v2 — adds p_gender; pool via helper;
--    persists gender + skill on both the roster entry and the profile.
-- ===========================================================================

drop function if exists public.app_mixer_join_with_profile(uuid, text, numeric);

create or replace function public.app_mixer_join_with_profile(
  p_tournament_id uuid,
  p_display_name text default null,
  p_dupr numeric default null,
  p_gender text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_player_id uuid;
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_gender text := case when p_gender in ('m', 'f', 'x') then p_gender else null end;
  v_dupr numeric(3,2) := case
    when p_dupr is null then null
    else greatest(2, least(8, p_dupr))::numeric(3,2)
  end;
begin
  select id into v_player_id
  from public.tournament_players
  where tournament_id = p_tournament_id and profile_id = uid
  limit 1;

  if v_player_id is null then
    select id into v_player_id
    from public.tournament_players
    where tournament_id = p_tournament_id and profile_id is null
    order by created_at
    limit 1;
  end if;

  if v_player_id is null then
    insert into public.tournament_players (tournament_id, display_name, profile_id, dupr, gender)
    values (p_tournament_id, coalesce(v_name, 'Guest player'), uid, v_dupr, v_gender)
    returning id into v_player_id;
  else
    update public.tournament_players
       set profile_id = uid,
           display_name = coalesce(v_name, display_name),
           dupr = coalesce(v_dupr, dupr),
           gender = coalesce(v_gender, gender)
     where id = v_player_id;
  end if;

  insert into public.tournament_members (tournament_id, user_id, role)
  values (p_tournament_id, uid, 'player')
  on conflict (tournament_id, user_id) do nothing;

  insert into public.player_event_state (
    player_id, tournament_id, pairing_pool, tokens_base_remaining, chips_remaining
  )
  select
    tp.id,
    tp.tournament_id,
    public.app_mixer_pool_assign(tp.tournament_id, tp.gender),
    ec.starting_tokens,
    ec.starting_chips
  from public.tournament_players tp
  join public.event_config ec on ec.tournament_id = tp.tournament_id
  where tp.id = v_player_id
  on conflict (player_id) do nothing;

  -- Quick profile persists on the account so it outlives this event and an
  -- in-place account upgrade (same auth uid).
  update public.profiles
     set display_name = coalesce(v_name, display_name),
         dupr_doubles = coalesce(v_dupr::numeric(4,3), dupr_doubles),
         gender = coalesce(v_gender, gender)
   where id = uid;

  return v_player_id;
end;
$$;

revoke all on function public.app_mixer_join_with_profile(uuid, text, numeric, text) from public;
grant execute on function public.app_mixer_join_with_profile(uuid, text, numeric, text) to authenticated;

-- ===========================================================================
-- 7. app_mixer_draw_round — gender-mode aware. Body otherwise 0044.
--    · same: candidates restricted to v_a's gender; courts re-grouped by
--      gender after the draw so M teams face M teams where counts allow.
--    · exit → continue when a candidate set is empty for one player (other
--      cohorts may still have pairs to form).
-- ===========================================================================

create or replace function public.app_mixer_draw_round(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.mixer_rounds%rowtype;
  v_cfg public.event_config%rowtype;
  v_gender_mode text;
  v_a_gender text;
  v_pairs int := 0;
  v_a record;
  v_b_id uuid;
  v_available_b uuid[];
  v_candidates uuid[];
  v_total numeric;
  v_cursor numeric;
  v_weight numeric;
  v_sit_needed_a int;
  v_sit_needed_b int;
begin
  -- Exclusive row lock: serializes two concurrent draws on the same round.
  select * into v_round from public.mixer_rounds where id = p_round_id for update;
  if v_round.id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_round.tournament_id);
  if v_round.state <> 'locked' then
    raise exception 'lock the ballot before drawing' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.mixer_rounds mr
    where mr.tournament_id = v_round.tournament_id
      and mr.round_no < v_round.round_no
      and mr.state <> 'done'
  ) then
    raise exception 'finish earlier rounds before drawing this round' using errcode = '42501';
  end if;

  select * into v_cfg from public.event_config where tournament_id = v_round.tournament_id;
  select coalesce(gender_mode, 'open') into v_gender_mode
  from public.tournaments where id = v_round.tournament_id;

  update public.mixer_rounds set state = 'drawing' where id = p_round_id;
  delete from public.mixer_pairings where round_id = p_round_id;
  delete from public.mixer_sit_outs where round_id = p_round_id;

  select greatest(0,
    count(*) filter (where pairing_pool = 'a') - count(*) filter (where pairing_pool = 'b')
  ) into v_sit_needed_a
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id and tp.withdrawn_at is null;

  select greatest(0,
    count(*) filter (where pairing_pool = 'b') - count(*) filter (where pairing_pool = 'a')
  ) into v_sit_needed_b
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id and tp.withdrawn_at is null;

  insert into public.mixer_sit_outs (round_id, tournament_id, player_id)
  select p_round_id, v_round.tournament_id, pes.player_id
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id
    and pes.pairing_pool = 'a'
    and tp.withdrawn_at is null
  order by pes.sit_out_count asc, pes.sat_last_round asc, random()
  limit v_sit_needed_a;

  insert into public.mixer_sit_outs (round_id, tournament_id, player_id)
  select p_round_id, v_round.tournament_id, pes.player_id
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id
    and pes.pairing_pool = 'b'
    and tp.withdrawn_at is null
  order by pes.sit_out_count asc, pes.sat_last_round asc, random()
  limit v_sit_needed_b;

  select array_agg(pes.player_id order by random())
    into v_available_b
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id
    and pes.pairing_pool = 'b'
    and tp.withdrawn_at is null
    and not exists (
      select 1
      from public.mixer_sit_outs so
      where so.round_id = p_round_id and so.player_id = pes.player_id
    );

  v_available_b := coalesce(v_available_b, array[]::uuid[]);

  for v_a in
    select pes.player_id
    from public.player_event_state pes
    join public.tournament_players tp on tp.id = pes.player_id
    where pes.tournament_id = v_round.tournament_id
      and pes.pairing_pool = 'a'
      and tp.withdrawn_at is null
      and not exists (
        select 1
        from public.mixer_sit_outs so
        where so.round_id = p_round_id and so.player_id = pes.player_id
      )
    order by random()
  loop
    -- 0047: in 'same' mode only same-gender candidates are eligible.
    if v_gender_mode = 'same' then
      select coalesce(tp.gender, 'x') into v_a_gender
      from public.tournament_players tp where tp.id = v_a.player_id;

      select coalesce(array_agg(b.player_id), array[]::uuid[])
        into v_candidates
      from unnest(v_available_b) as b(player_id)
      join public.tournament_players tpb on tpb.id = b.player_id
      where coalesce(tpb.gender, 'x') = v_a_gender;
    else
      v_candidates := v_available_b;
    end if;

    select coalesce(sum(
      exp((
        greatest(
          (
            v_cfg.alpha * (
              coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = b.player_id), 0) +
              coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = b.player_id and target_player_id = v_a.player_id), 0)
            ) +
            v_cfg.beta * sqrt(
              coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = b.player_id), 0) *
              coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = b.player_id and target_player_id = v_a.player_id), 0)
            ) -
            v_cfg.gamma * (
              coalesce((select down_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = b.player_id), 0) +
              coalesce((select down_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = b.player_id and target_player_id = v_a.player_id), 0)
            )
          ),
          -v_cfg.grief_floor
        )
      ) / v_cfg.tau) *
      power(v_cfg.repeat_decay, coalesce((
        select count(*)
        from public.mixer_pairings mp
        join public.mixer_rounds mr on mr.id = mp.round_id
        where mr.tournament_id = v_round.tournament_id
          and ((mp.player_a_id = v_a.player_id and mp.player_b_id = b.player_id)
            or (mp.player_a_id = b.player_id and mp.player_b_id = v_a.player_id))
      ), 0))
    ), 0)
    into v_total
    from unnest(v_candidates) as b(player_id);

    if v_total <= 0 then
      -- 0047: no eligible candidate for THIS player (e.g. gender cohort
      -- exhausted in 'same' mode) — move on, others may still pair.
      continue;
    end if;

    v_cursor := random() * v_total;
    for v_b_id in select player_id from unnest(v_candidates) as b(player_id) order by random() loop
      v_weight :=
        exp((
          greatest(
            (
              v_cfg.alpha * (
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = v_b_id), 0) +
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_b_id and target_player_id = v_a.player_id), 0)
              ) +
              v_cfg.beta * sqrt(
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = v_b_id), 0) *
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_b_id and target_player_id = v_a.player_id), 0)
              ) -
              v_cfg.gamma * (
                coalesce((select down_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = v_b_id), 0) +
                coalesce((select down_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_b_id and target_player_id = v_a.player_id), 0)
              )
            ),
            -v_cfg.grief_floor
          )
        ) / v_cfg.tau) *
        power(v_cfg.repeat_decay, coalesce((
          select count(*)
          from public.mixer_pairings mp
          join public.mixer_rounds mr on mr.id = mp.round_id
          where mr.tournament_id = v_round.tournament_id
            and ((mp.player_a_id = v_a.player_id and mp.player_b_id = v_b_id)
              or (mp.player_a_id = v_b_id and mp.player_b_id = v_a.player_id))
        ), 0));
      v_cursor := v_cursor - v_weight;
      if v_cursor <= 0 then
        insert into public.mixer_pairings (round_id, tournament_id, player_a_id, player_b_id, court_no, weight)
        values (p_round_id, v_round.tournament_id, v_a.player_id, v_b_id, ((v_pairs / 2) % greatest(1, v_cfg.courts)) + 1, v_weight);
        v_available_b := array_remove(v_available_b, v_b_id);
        v_pairs := v_pairs + 1;
        exit;
      end if;
    end loop;
  end loop;

  -- 0047: in 'same' mode, re-group courts by team gender so same-gender
  -- teams face each other where counts allow (an odd cohort still produces
  -- one cross-gender court at the boundary — organizer reality).
  if v_gender_mode = 'same' then
    with ordered as (
      select
        mp.id,
        row_number() over (
          order by coalesce(tpa.gender, 'x'), mp.created_at, mp.id
        ) - 1 as rn
      from public.mixer_pairings mp
      join public.tournament_players tpa on tpa.id = mp.player_a_id
      where mp.round_id = p_round_id
    )
    update public.mixer_pairings mp
       set court_no = ((o.rn / 2) % greatest(1, v_cfg.courts)) + 1
      from ordered o
     where o.id = mp.id;
  end if;

  update public.player_event_state
     set sat_last_round = false
   where tournament_id = v_round.tournament_id;

  update public.player_event_state pes
     set sit_out_count = sit_out_count + 1,
         sat_last_round = true
    from public.mixer_sit_outs so
   where so.round_id = p_round_id
     and so.player_id = pes.player_id;

  update public.mixer_rounds set state = 'revealed' where id = p_round_id;
  return v_pairs;
end;
$$;

revoke all on function public.app_mixer_draw_round(uuid) from public;
grant execute on function public.app_mixer_draw_round(uuid) to authenticated;
