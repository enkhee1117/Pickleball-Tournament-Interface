-- 0051 — Keep a joiner's pairing_pool in sync with their real gender, add an
-- organizer "re-pool the roster" control, and make Reopen a clean re-run.
--
-- Three fixes shipped together:
--
--   1. Stale-pool gender bug. A mixer seeded with placeholder players
--      ("Male 1", "Female 1", …) also seeds their player_event_state.pairing_pool
--      up front. When a real player CLAIMS a leftover slot, the join RPCs
--      updated the roster row's gender but the state insert is
--      `on conflict (player_id) do nothing`, so the seeded pool stuck. A man
--      who claimed a "Female" seat kept pairing_pool='b' and — in a mixed draw
--      where the ballot mirrors the pool — was shown only OTHER MEN as partner
--      options (and would have been drawn as a woman). We now recompute the
--      joiner's pool from their gender on claim, for mixed events.
--
--   2. app_mixer_repool_roster — a manager RPC that recomputes EVERY player's
--      pool from the current roster + gender_mode. The escape hatch for events
--      already knocked out of sync, and the "the roster/config changed, redraw
--      cleanly" button. Mirrors app_ensure_mixer_event's seeding rules.
--
--   3. Reopen a round now wipes the round's COMPLETED scores too, not just the
--      unfinished ones — reopening is a clean re-run ("erase the games that
--      already happened"), matching the organizer's mental model.
--
-- Function re-issues preserve their 0047/0048 bodies verbatim except for the
-- commented additions.

set search_path = public;

-- ===========================================================================
-- 1. app_mixer_repool_roster — recompute all pools from roster + gender_mode.
--    Manager-gated. Pools follow the same rules as app_ensure_mixer_event:
--      mixed: men/x → a, women → b
--      same:  split each gender cohort across a/b so cohorts can pair internally
--      open:  split the whole roster across a/b, gender-blind
--    Only touches player_event_state.pairing_pool — wallets, sit-out counts,
--    votes, and pairings are untouched. Use before a redraw when the roster or
--    configuration changed.
-- ===========================================================================
create or replace function public.app_mixer_repool_roster(p_tournament_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_count int;
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  select coalesce(gender_mode, 'open') into v_mode
  from public.tournaments where id = p_tournament_id;
  if v_mode is null then
    raise exception 'tournament not found' using errcode = '02000';
  end if;

  update public.player_event_state pes
     set pairing_pool = ranked.pool
  from (
    select
      tp.id,
      case
        when v_mode = 'mixed' then (case when tp.gender = 'f' then 'b' else 'a' end)
        when v_mode = 'same'  then (case when (row_number() over (partition by coalesce(tp.gender, 'x') order by tp.created_at, tp.id) % 2) = 1 then 'a' else 'b' end)
        else (case when (row_number() over (order by tp.created_at, tp.id) % 2) = 1 then 'a' else 'b' end)
      end as pool
    from public.tournament_players tp
    where tp.tournament_id = p_tournament_id
      and tp.withdrawn_at is null
  ) ranked
  where pes.player_id = ranked.id
    and pes.tournament_id = p_tournament_id
    and pes.pairing_pool is distinct from ranked.pool;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.app_mixer_repool_roster(uuid) from public;
grant execute on function public.app_mixer_repool_roster(uuid) to authenticated;

-- ===========================================================================
-- 2. app_mixer_join_with_profile v3 — same as 0047 plus a claim-time re-pool
--    of the joiner (mixed events only). Signature/grants unchanged.
-- ===========================================================================
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

  -- 0051: claiming a pre-seeded slot leaves the placeholder's pool in place
  -- (insert above is do-nothing on an existing row). For a mixed event the
  -- pool must follow the joiner's real gender, or their ballot and the draw
  -- put them on the wrong side. Re-pool just this player, mixed events only.
  update public.player_event_state pes
     set pairing_pool = case when tp.gender = 'f' then 'b' else 'a' end
    from public.tournament_players tp
   where pes.player_id = v_player_id
     and tp.id = pes.player_id
     and coalesce((select gender_mode from public.tournaments where id = pes.tournament_id), 'open') = 'mixed';

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
-- 3. app_mixer_bind_roster_entry — same as 0047 plus the same claim-time
--    re-pool (mixed only). This path doesn't capture gender, so it only helps
--    when the claimed slot's gender is already correct, but it keeps the pool
--    consistent with that gender rather than the seeded default.
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

  -- 0051: keep the claimed slot's pool aligned with its gender (mixed only).
  update public.player_event_state pes
     set pairing_pool = case when tp.gender = 'f' then 'b' else 'a' end
    from public.tournament_players tp
   where pes.player_id = v_player_id
     and tp.id = pes.player_id
     and coalesce((select gender_mode from public.tournaments where id = pes.tournament_id), 'open') = 'mixed';

  return v_player_id;
end;
$$;

-- ===========================================================================
-- 4. app_mixer_reopen_round — same as 0048 but wipes ALL of the round's scores,
--    completed included, so a reopen is a clean re-run of the round.
-- ===========================================================================
create or replace function public.app_mixer_reopen_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.mixer_rounds%rowtype;
  v_lock_seconds int;
begin
  select * into v_round from public.mixer_rounds where id = p_round_id for update;
  if v_round.id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_round.tournament_id);
  if v_round.state = 'done' then
    raise exception 'round is already finished — reset the event to rerun it' using errcode = '42501';
  end if;

  -- Undo the sit-out accounting the draw applied for this round.
  update public.player_event_state pes
     set sit_out_count = greatest(0, sit_out_count - 1),
         sat_last_round = false
    from public.mixer_sit_outs so
   where so.round_id = p_round_id
     and so.player_id = pes.player_id;

  delete from public.mixer_pairings where round_id = p_round_id;
  delete from public.mixer_sit_outs where round_id = p_round_id;
  -- 0051: a reopen is a clean re-run — erase every game played this round, not
  -- just the unfinished ones (0048 kept completed scores).
  delete from public.mixer_scores where round_id = p_round_id;

  select lock_seconds into v_lock_seconds
  from public.event_config where tournament_id = v_round.tournament_id;

  update public.mixer_rounds
     set state = 'open',
         lock_at = now() + make_interval(secs => coalesce(v_lock_seconds, 86400))
   where id = p_round_id;
end;
$$;

revoke all on function public.app_mixer_reopen_round(uuid) from public;
grant execute on function public.app_mixer_reopen_round(uuid) to authenticated;
