-- Partner Mixer: token voting, weighted draw, betting, raffle, and manual payments.
-- All mutable event state keys to tournament_players.id, not auth.users.id.

set search_path = public;

alter table public.tournaments
  drop constraint if exists tournaments_format_chk;

alter table public.tournaments
  add constraint tournaments_format_chk
  check (format in ('round_robin', 'fixed_partners', 'bracket', 'partner_mixer'));

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
    if v_gender_mode = 'mixed' or v_format = 'partner_mixer' then
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

create table public.event_config (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  starting_tokens int not null default 10 check (starting_tokens between 1 and 100),
  starting_chips int not null default 100 check (starting_chips >= 0),
  rounds int not null default 5 check (rounds between 1 and 50),
  courts int not null default 3 check (courts between 1 and 16),
  lock_mode text not null default 'timer' check (lock_mode in ('timer', 'manual')),
  lock_seconds int not null default 90 check (lock_seconds between 5 and 3600),
  alpha numeric not null default 1,
  beta numeric not null default 2.5,
  gamma numeric not null default 1,
  tau numeric not null default 2,
  grief_floor numeric not null default 4,
  repeat_decay numeric not null default 0.2,
  entry_fee numeric not null default 20,
  pay_to_play_enabled boolean not null default true,
  boost_tokens int not null default 5,
  boost_price numeric not null default 20,
  boost_limit int not null default 1,
  betting_enabled boolean not null default true,
  raffle_enabled boolean not null default true,
  downvotes_enabled boolean not null default true,
  podium_markets int not null default 3 check (podium_markets between 1 and 8),
  betting_prize_winners int not null default 3 check (betting_prize_winners between 1 and 20),
  betting_rake_pct numeric not null default 0 check (betting_rake_pct >= 0 and betting_rake_pct <= 1),
  prize_buckets jsonb not null default '{"tournament":0.5,"raffle":0.2,"betting":0.2,"reserve":0.1}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger event_config_touch
  before update on public.event_config
  for each row execute function public.touch_updated_at();

create table public.mixer_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_no int not null check (round_no > 0),
  state text not null default 'open' check (state in ('open', 'locked', 'drawing', 'revealed', 'playing', 'done')),
  lock_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, round_no)
);

create trigger mixer_rounds_touch
  before update on public.mixer_rounds
  for each row execute function public.touch_updated_at();

create table public.player_event_state (
  player_id uuid primary key references public.tournament_players(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  pairing_pool text not null default 'a' check (pairing_pool in ('a', 'b')),
  tokens_base_remaining int not null default 10 check (tokens_base_remaining >= 0),
  tokens_bought_remaining int not null default 0 check (tokens_bought_remaining >= 0),
  boosts_used int not null default 0 check (boosts_used >= 0),
  chips_remaining int not null default 100 check (chips_remaining >= 0),
  sit_out_count int not null default 0 check (sit_out_count >= 0),
  sat_last_round boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger player_event_state_touch
  before update on public.player_event_state
  for each row execute function public.touch_updated_at();

create index player_event_state_tournament_idx on public.player_event_state(tournament_id);

create table public.mixer_votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.mixer_rounds(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  voter_player_id uuid not null references public.tournament_players(id) on delete cascade,
  target_player_id uuid not null references public.tournament_players(id) on delete cascade,
  up_tokens int not null default 0 check (up_tokens >= 0),
  down_tokens int not null default 0 check (down_tokens >= 0),
  base_tokens_spent int not null default 0 check (base_tokens_spent >= 0),
  bought_tokens_spent int not null default 0 check (bought_tokens_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, voter_player_id, target_player_id),
  check (voter_player_id <> target_player_id)
);

create trigger mixer_votes_touch
  before update on public.mixer_votes
  for each row execute function public.touch_updated_at();

create index mixer_votes_round_idx on public.mixer_votes(round_id);
create index mixer_votes_voter_idx on public.mixer_votes(voter_player_id);

create table public.mixer_pairings (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.mixer_rounds(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_a_id uuid not null references public.tournament_players(id) on delete cascade,
  player_b_id uuid not null references public.tournament_players(id) on delete cascade,
  court_no int not null default 1,
  weight numeric not null default 1,
  created_at timestamptz not null default now(),
  unique (round_id, player_a_id),
  unique (round_id, player_b_id)
);

create table public.mixer_sit_outs (
  round_id uuid not null references public.mixer_rounds(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.tournament_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

create table public.mixer_scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.mixer_rounds(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  court_no int not null,
  team_a_score int not null default 0 check (team_a_score >= 0),
  team_b_score int not null default 0 check (team_b_score >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, court_no)
);

create trigger mixer_scores_touch
  before update on public.mixer_scores
  for each row execute function public.touch_updated_at();

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  market_place int not null check (market_place > 0),
  bettor_player_id uuid not null references public.tournament_players(id) on delete cascade,
  pick_player_id uuid not null references public.tournament_players(id) on delete cascade,
  chips int not null check (chips > 0),
  settled_at timestamptz,
  payout int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, market_place, bettor_player_id)
);

create trigger bets_touch
  before update on public.bets
  for each row execute function public.touch_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.tournament_players(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  type text not null check (type in ('entry', 'pay_to_play')),
  method text not null default 'zelle',
  amount numeric not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'refunded')),
  reference text,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger payments_touch
  before update on public.payments
  for each row execute function public.touch_updated_at();

create table public.mixer_final_snapshots (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  standings jsonb not null default '[]'::jsonb,
  raffle_tickets jsonb not null default '[]'::jsonb,
  bet_settlements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.app_player_belongs_to_user(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_players tp
    where tp.id = p_player_id
      and tp.profile_id = auth.uid()
  );
$$;

revoke all on function public.app_player_belongs_to_user(uuid) from public;
grant execute on function public.app_player_belongs_to_user(uuid) to authenticated;

create or replace function public.app_ensure_mixer_event(
  p_tournament_id uuid,
  p_starting_tokens int default 10,
  p_starting_chips int default 100,
  p_rounds int default 5,
  p_courts int default 3,
  p_lock_seconds int default 90,
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
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  select format into v_format from public.tournaments where id = p_tournament_id;
  if v_format <> 'partner_mixer' then
    raise exception 'tournament is not a partner mixer' using errcode = '22023';
  end if;

  insert into public.event_config (
    tournament_id, starting_tokens, starting_chips, rounds, courts, lock_seconds,
    entry_fee, betting_enabled, raffle_enabled, downvotes_enabled
  )
  values (
    p_tournament_id,
    greatest(1, least(coalesce(p_starting_tokens, 10), 100)),
    greatest(0, coalesce(p_starting_chips, 100)),
    greatest(1, least(coalesce(p_rounds, 5), 50)),
    greatest(1, least(coalesce(p_courts, 3), 16)),
    greatest(5, least(coalesce(p_lock_seconds, 90), 3600)),
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
  values (
    p_tournament_id,
    1,
    'open',
    now() + make_interval(secs => greatest(5, least(coalesce(p_lock_seconds, 90), 3600)))
  )
  on conflict (tournament_id, round_no) do nothing;

  insert into public.player_event_state (
    player_id, tournament_id, pairing_pool, tokens_base_remaining, chips_remaining
  )
  select
    tp.id,
    tp.tournament_id,
    case when tp.gender = 'f' then 'b' else 'a' end,
    ec.starting_tokens,
    ec.starting_chips
  from public.tournament_players tp
  join public.event_config ec on ec.tournament_id = tp.tournament_id
  where tp.tournament_id = p_tournament_id
  on conflict (player_id) do nothing;

  update public.tournaments
     set status = 'active'
   where id = p_tournament_id and status = 'draft';
end;
$$;

revoke all on function public.app_ensure_mixer_event(uuid, int, int, int, int, int, numeric, boolean, boolean, boolean) from public;
grant execute on function public.app_ensure_mixer_event(uuid, int, int, int, int, int, numeric, boolean, boolean, boolean) to authenticated;

create or replace function public.app_mixer_set_round_state(
  p_round_id uuid,
  p_state text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_round_no int;
  v_rounds int;
  v_lock_seconds int;
begin
  select tournament_id, round_no into v_tournament_id, v_round_no from public.mixer_rounds where id = p_round_id;
  if v_tournament_id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_tournament_id);
  if p_state not in ('open', 'locked', 'drawing', 'revealed', 'playing', 'done') then
    raise exception 'unknown round state' using errcode = '22023';
  end if;

  update public.mixer_rounds
     set state = p_state,
         lock_at = case when p_state = 'open' then now() + make_interval(secs => (select lock_seconds from public.event_config where tournament_id = v_tournament_id)) else lock_at end
   where id = p_round_id;

  if p_state = 'done' then
    select rounds, lock_seconds into v_rounds, v_lock_seconds
    from public.event_config
    where tournament_id = v_tournament_id;

    if v_round_no < coalesce(v_rounds, v_round_no) then
      insert into public.mixer_rounds (tournament_id, round_no, state, lock_at)
      values (v_tournament_id, v_round_no + 1, 'open', now() + make_interval(secs => coalesce(v_lock_seconds, 90)))
      on conflict (tournament_id, round_no) do nothing;
    else
      update public.tournaments
         set status = 'completed'
       where id = v_tournament_id;
    end if;
  end if;
end;
$$;

revoke all on function public.app_mixer_set_round_state(uuid, text) from public;
grant execute on function public.app_mixer_set_round_state(uuid, text) to authenticated;

create or replace function public.app_mixer_set_vote(
  p_round_id uuid,
  p_voter_player_id uuid,
  p_target_player_id uuid,
  p_up_tokens int,
  p_down_tokens int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.mixer_rounds%rowtype;
  v_tournament_id uuid;
  v_state public.player_event_state%rowtype;
  v_existing public.mixer_votes%rowtype;
  v_new_total int;
  v_old_total int;
  v_delta int;
  v_consume_base int;
  v_consume_bought int;
  v_refund_bought int;
  v_refund_base int;
  v_new_base_spent int;
  v_new_bought_spent int;
begin
  select * into v_round from public.mixer_rounds where id = p_round_id;
  if v_round.id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  if v_round.state <> 'open' then
    raise exception 'voting is locked' using errcode = '42501';
  end if;
  if not public.app_player_belongs_to_user(p_voter_player_id) then
    raise exception 'not your roster entry' using errcode = '42501';
  end if;
  if p_voter_player_id = p_target_player_id then
    raise exception 'cannot vote for yourself' using errcode = '22023';
  end if;

  select tournament_id into v_tournament_id
  from public.tournament_players
  where id = p_target_player_id;
  if v_tournament_id is distinct from v_round.tournament_id then
    raise exception 'target is not in this tournament' using errcode = '22023';
  end if;

  select * into v_state
  from public.player_event_state
  where player_id = p_voter_player_id
  for update;

  select * into v_existing
  from public.mixer_votes
  where round_id = p_round_id
    and voter_player_id = p_voter_player_id
    and target_player_id = p_target_player_id
  for update;

  v_new_total := greatest(0, p_up_tokens) + greatest(0, p_down_tokens);
  v_old_total := coalesce(v_existing.base_tokens_spent, 0) + coalesce(v_existing.bought_tokens_spent, 0);
  v_delta := v_new_total - v_old_total;
  v_new_base_spent := coalesce(v_existing.base_tokens_spent, 0);
  v_new_bought_spent := coalesce(v_existing.bought_tokens_spent, 0);

  if v_delta > coalesce(v_state.tokens_base_remaining, 0) + coalesce(v_state.tokens_bought_remaining, 0) then
    raise exception 'not enough tokens' using errcode = '22023';
  end if;

  if v_delta > 0 then
    v_consume_base := least(v_delta, coalesce(v_state.tokens_base_remaining, 0));
    v_consume_bought := v_delta - v_consume_base;
    v_new_base_spent := v_new_base_spent + v_consume_base;
    v_new_bought_spent := v_new_bought_spent + v_consume_bought;

    update public.player_event_state
       set tokens_base_remaining = tokens_base_remaining - v_consume_base,
           tokens_bought_remaining = tokens_bought_remaining - v_consume_bought
     where player_id = p_voter_player_id;
  elsif v_delta < 0 then
    v_refund_bought := least(abs(v_delta), v_new_bought_spent);
    v_refund_base := abs(v_delta) - v_refund_bought;
    v_new_bought_spent := v_new_bought_spent - v_refund_bought;
    v_new_base_spent := v_new_base_spent - v_refund_base;

    update public.player_event_state
       set tokens_base_remaining = tokens_base_remaining + v_refund_base,
           tokens_bought_remaining = tokens_bought_remaining + v_refund_bought
     where player_id = p_voter_player_id;
  end if;

  insert into public.mixer_votes (
    round_id, tournament_id, voter_player_id, target_player_id, up_tokens, down_tokens,
    base_tokens_spent, bought_tokens_spent
  )
  values (
    p_round_id, v_round.tournament_id, p_voter_player_id, p_target_player_id,
    greatest(0, p_up_tokens), greatest(0, p_down_tokens),
    greatest(0, v_new_base_spent), greatest(0, v_new_bought_spent)
  )
  on conflict (round_id, voter_player_id, target_player_id) do update
     set up_tokens = excluded.up_tokens,
         down_tokens = excluded.down_tokens,
         base_tokens_spent = excluded.base_tokens_spent,
         bought_tokens_spent = excluded.bought_tokens_spent;
end;
$$;

revoke all on function public.app_mixer_set_vote(uuid, uuid, uuid, int, int) from public;
grant execute on function public.app_mixer_set_vote(uuid, uuid, uuid, int, int) to authenticated;

create or replace function public.app_mixer_draw_round(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.mixer_rounds%rowtype;
  v_cfg public.event_config%rowtype;
  v_pairs int := 0;
  v_a record;
  v_b record;
  v_total numeric;
  v_cursor numeric;
  v_weight numeric;
  v_sit_needed_a int;
  v_sit_needed_b int;
begin
  select * into v_round from public.mixer_rounds where id = p_round_id;
  if v_round.id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_round.tournament_id);
  select * into v_cfg from public.event_config where tournament_id = v_round.tournament_id;

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

  create temporary table if not exists pg_temp.available_b(player_id uuid primary key) on commit drop;
  truncate table pg_temp.available_b;
  insert into pg_temp.available_b(player_id)
  select pes.player_id
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id
    and pes.pairing_pool = 'b'
    and tp.withdrawn_at is null
    and not exists (select 1 from public.mixer_sit_outs so where so.round_id = p_round_id and so.player_id = pes.player_id);

  for v_a in
    select pes.player_id
    from public.player_event_state pes
    join public.tournament_players tp on tp.id = pes.player_id
    where pes.tournament_id = v_round.tournament_id
      and pes.pairing_pool = 'a'
      and tp.withdrawn_at is null
      and not exists (select 1 from public.mixer_sit_outs so where so.round_id = p_round_id and so.player_id = pes.player_id)
    order by random()
  loop
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
    from pg_temp.available_b b;

    if v_total <= 0 then
      exit;
    end if;

    v_cursor := random() * v_total;
    v_b := null;
    for v_b in select player_id from pg_temp.available_b order by random() loop
      v_weight :=
        exp((
          greatest(
            (
              v_cfg.alpha * (
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = v_b.player_id), 0) +
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_b.player_id and target_player_id = v_a.player_id), 0)
              ) +
              v_cfg.beta * sqrt(
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = v_b.player_id), 0) *
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_b.player_id and target_player_id = v_a.player_id), 0)
              ) -
      v_cfg.gamma * (
                coalesce((select down_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = v_b.player_id), 0) +
                coalesce((select down_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_b.player_id and target_player_id = v_a.player_id), 0)
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
            and ((mp.player_a_id = v_a.player_id and mp.player_b_id = v_b.player_id)
              or (mp.player_a_id = v_b.player_id and mp.player_b_id = v_a.player_id))
        ), 0));
      v_cursor := v_cursor - v_weight;
      if v_cursor <= 0 then
        insert into public.mixer_pairings (round_id, tournament_id, player_a_id, player_b_id, court_no, weight)
        values (p_round_id, v_round.tournament_id, v_a.player_id, v_b.player_id, ((v_pairs / 2) % greatest(1, v_cfg.courts)) + 1, v_weight);
        delete from pg_temp.available_b where player_id = v_b.player_id;
        v_pairs := v_pairs + 1;
        exit;
      end if;
    end loop;
  end loop;

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

create or replace function public.app_mixer_place_bet(
  p_tournament_id uuid,
  p_bettor_player_id uuid,
  p_market_place int,
  p_pick_player_id uuid,
  p_chips int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing int := 0;
  v_balance int;
begin
  if not public.app_player_belongs_to_user(p_bettor_player_id) then
    raise exception 'not your roster entry' using errcode = '42501';
  end if;

  select coalesce(chips, 0) into v_existing
  from public.bets
  where tournament_id = p_tournament_id
    and market_place = p_market_place
    and bettor_player_id = p_bettor_player_id;

  select chips_remaining into v_balance
  from public.player_event_state
  where player_id = p_bettor_player_id;

  if coalesce(v_balance, 0) + coalesce(v_existing, 0) < p_chips then
    raise exception 'not enough chips' using errcode = '22023';
  end if;

  insert into public.bets (tournament_id, market_place, bettor_player_id, pick_player_id, chips)
  values (p_tournament_id, p_market_place, p_bettor_player_id, p_pick_player_id, p_chips)
  on conflict (tournament_id, market_place, bettor_player_id) do update
     set pick_player_id = excluded.pick_player_id,
         chips = excluded.chips;

  update public.player_event_state
     set chips_remaining = v_balance + coalesce(v_existing, 0) - p_chips
   where player_id = p_bettor_player_id;
end;
$$;

revoke all on function public.app_mixer_place_bet(uuid, uuid, int, uuid, int) from public;
grant execute on function public.app_mixer_place_bet(uuid, uuid, int, uuid, int) to authenticated;

create or replace function public.app_mixer_score_court(
  p_round_id uuid,
  p_court_no int,
  p_team_a_score int,
  p_team_b_score int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
begin
  select tournament_id into v_tournament_id from public.mixer_rounds where id = p_round_id;
  if v_tournament_id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_tournament_id);

  insert into public.mixer_scores (
    round_id, tournament_id, court_no, team_a_score, team_b_score, completed_at
  )
  values (
    p_round_id, v_tournament_id, greatest(1, p_court_no), greatest(0, p_team_a_score), greatest(0, p_team_b_score), now()
  )
  on conflict (round_id, court_no) do update
     set team_a_score = excluded.team_a_score,
         team_b_score = excluded.team_b_score,
         completed_at = excluded.completed_at;
end;
$$;

revoke all on function public.app_mixer_score_court(uuid, int, int, int) from public;
grant execute on function public.app_mixer_score_court(uuid, int, int, int) to authenticated;

create or replace function public.app_mixer_confirm_payment(
  p_payment_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_cfg public.event_config%rowtype;
  v_boosts_used int;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'payment not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_payment.tournament_id);
  if p_status not in ('confirmed', 'refunded') then
    raise exception 'unknown payment status' using errcode = '22023';
  end if;

  if p_status = 'confirmed' and v_payment.status <> 'confirmed' and v_payment.type = 'pay_to_play' then
    select * into v_cfg from public.event_config where tournament_id = v_payment.tournament_id;
    if not coalesce(v_cfg.pay_to_play_enabled, true) then
      raise exception 'pay-to-play is disabled' using errcode = '22023';
    end if;

    select boosts_used into v_boosts_used
    from public.player_event_state
    where player_id = v_payment.player_id
    for update;

    if coalesce(v_boosts_used, 0) >= coalesce(v_cfg.boost_limit, 1) then
      raise exception 'token boost already used' using errcode = '22023';
    end if;

    update public.player_event_state
       set tokens_bought_remaining = tokens_bought_remaining + coalesce(v_cfg.boost_tokens, 5),
           boosts_used = boosts_used + 1
     where player_id = v_payment.player_id;
  end if;

  update public.payments
     set status = p_status,
         confirmed_by = auth.uid(),
         confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end
   where id = p_payment_id;
end;
$$;

revoke all on function public.app_mixer_confirm_payment(uuid, text) from public;
grant execute on function public.app_mixer_confirm_payment(uuid, text) to authenticated;

create or replace function public.app_mixer_request_payment(
  p_player_id uuid,
  p_type text,
  p_method text default 'zelle',
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_cfg public.event_config%rowtype;
  v_payment_id uuid;
  v_type text := lower(trim(coalesce(p_type, '')));
  v_method text := lower(trim(coalesce(p_method, 'zelle')));
  v_boosts_used int;
begin
  if not public.app_player_belongs_to_user(p_player_id) then
    raise exception 'not your roster entry' using errcode = '42501';
  end if;

  select tournament_id into v_tournament_id
  from public.tournament_players
  where id = p_player_id;

  select * into v_cfg from public.event_config where tournament_id = v_tournament_id;
  if v_cfg.tournament_id is null then
    raise exception 'mixer config not found' using errcode = '02000';
  end if;

  if v_type not in ('entry', 'pay_to_play') then
    raise exception 'unknown payment type' using errcode = '22023';
  end if;

  if v_type = 'pay_to_play' then
    select boosts_used into v_boosts_used
    from public.player_event_state
    where player_id = p_player_id;

    if coalesce(v_boosts_used, 0) >= coalesce(v_cfg.boost_limit, 1) then
      raise exception 'token boost already used' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.payments
      where player_id = p_player_id
        and type = 'pay_to_play'
        and status in ('pending', 'confirmed')
    ) then
      raise exception 'token boost payment already exists' using errcode = '22023';
    end if;
  end if;

  if v_type = 'entry' and exists (
    select 1
    from public.payments
    where player_id = p_player_id
      and type = 'entry'
      and status in ('pending', 'confirmed')
  ) then
    raise exception 'entry payment already exists' using errcode = '22023';
  end if;

  insert into public.payments (player_id, tournament_id, type, method, amount, reference)
  values (
    p_player_id,
    v_tournament_id,
    v_type,
    coalesce(nullif(v_method, ''), 'zelle'),
    case when v_type = 'pay_to_play' then coalesce(v_cfg.boost_price, 20) else coalesce(v_cfg.entry_fee, 20) end,
    nullif(trim(coalesce(p_reference, '')), '')
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

revoke all on function public.app_mixer_request_payment(uuid, text, text, text) from public;
grant execute on function public.app_mixer_request_payment(uuid, text, text, text) to authenticated;

create or replace function public.app_mixer_finalize_event(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.event_config%rowtype;
  v_standings jsonb := '[]'::jsonb;
  v_raffle jsonb := '[]'::jsonb;
  v_settlements jsonb := '[]'::jsonb;
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  select * into v_cfg
  from public.event_config
  where tournament_id = p_tournament_id;
  if v_cfg.tournament_id is null then
    raise exception 'mixer config not found' using errcode = '02000';
  end if;

  create temporary table if not exists pg_temp.mixer_final_standings_tmp(
    rank_no int,
    player_id uuid,
    display_name text,
    points int
  ) on commit drop;
  truncate table pg_temp.mixer_final_standings_tmp;

  insert into pg_temp.mixer_final_standings_tmp(rank_no, player_id, display_name, points)
  with ordered_pairings as (
    select
      mp.*,
      row_number() over (partition by mp.round_id, mp.court_no order by mp.created_at, mp.id) as team_no
    from public.mixer_pairings mp
    where mp.tournament_id = p_tournament_id
  ),
  team_points as (
    select
      op.player_a_id,
      op.player_b_id,
      case when op.team_no = 1 then ms.team_a_score else ms.team_b_score end as points
    from ordered_pairings op
    join public.mixer_scores ms on ms.round_id = op.round_id and ms.court_no = op.court_no
    where ms.completed_at is not null
  ),
  player_points as (
    select player_a_id as player_id, points from team_points
    union all
    select player_b_id as player_id, points from team_points
  ),
  totals as (
    select
      tp.id as player_id,
      tp.display_name,
      coalesce(sum(pp.points), 0)::int as points
    from public.tournament_players tp
    left join player_points pp on pp.player_id = tp.id
    where tp.tournament_id = p_tournament_id
      and tp.withdrawn_at is null
    group by tp.id, tp.display_name
  )
  select
    row_number() over (order by points desc, display_name asc)::int,
    player_id,
    display_name,
    points
  from totals;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'rank', rank_no,
      'playerId', player_id,
      'displayName', display_name,
      'points', points
    )
    order by rank_no
  ), '[]'::jsonb)
  into v_standings
  from pg_temp.mixer_final_standings_tmp;

  with received as (
    select
      target_player_id as player_id,
      sum(least(up_tokens, 3))::numeric as popularity_tickets
    from public.mixer_votes
    where tournament_id = p_tournament_id
    group by target_player_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'playerId', pes.player_id,
      'displayName', tp.display_name,
      'popularityTickets', coalesce(received.popularity_tickets, 0),
      'frugalityTickets', greatest(0, pes.tokens_base_remaining)::numeric * 0.5,
      'tickets', coalesce(received.popularity_tickets, 0) + greatest(0, pes.tokens_base_remaining)::numeric * 0.5
    )
    order by (coalesce(received.popularity_tickets, 0) + greatest(0, pes.tokens_base_remaining)::numeric * 0.5) desc, tp.display_name asc
  ), '[]'::jsonb)
  into v_raffle
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  left join received on received.player_id = pes.player_id
  where pes.tournament_id = p_tournament_id
    and tp.withdrawn_at is null;

  create temporary table if not exists pg_temp.mixer_bet_settlements_tmp(
    bet_id uuid,
    bettor_player_id uuid,
    market_place int,
    payout int
  ) on commit drop;
  truncate table pg_temp.mixer_bet_settlements_tmp;

  insert into pg_temp.mixer_bet_settlements_tmp(bet_id, bettor_player_id, market_place, payout)
  with winners as (
    select rank_no as market_place, player_id
    from pg_temp.mixer_final_standings_tmp
    where rank_no <= coalesce(v_cfg.podium_markets, 3)
  ),
  market_pots as (
    select market_place, sum(chips)::numeric * (1 - coalesce(v_cfg.betting_rake_pct, 0)) as pot
    from public.bets
    where tournament_id = p_tournament_id
    group by market_place
  ),
  correct_stakes as (
    select b.market_place, sum(b.chips)::numeric as chips
    from public.bets b
    join winners w on w.market_place = b.market_place and w.player_id = b.pick_player_id
    where b.tournament_id = p_tournament_id
    group by b.market_place
  )
  select
    b.id,
    b.bettor_player_id,
    b.market_place,
    floor((b.chips::numeric / nullif(cs.chips, 0)) * mp.pot)::int as payout
  from public.bets b
  join winners w on w.market_place = b.market_place and w.player_id = b.pick_player_id
  join market_pots mp on mp.market_place = b.market_place
  join correct_stakes cs on cs.market_place = b.market_place
  where b.tournament_id = p_tournament_id;

  with updated as (
    update public.bets b
       set payout = s.payout,
           settled_at = now()
      from pg_temp.mixer_bet_settlements_tmp s
     where b.id = s.bet_id
       and b.settled_at is null
    returning b.bettor_player_id, b.payout
  ),
  payouts as (
    select bettor_player_id, sum(payout)::int as payout
    from updated
    group by bettor_player_id
  )
  update public.player_event_state pes
     set chips_remaining = chips_remaining + payouts.payout
    from payouts
   where pes.player_id = payouts.bettor_player_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'bettorPlayerId', s.bettor_player_id,
      'marketPlace', s.market_place,
      'payout', coalesce(b.payout, s.payout)
    )
    order by s.market_place, s.payout desc
  ), '[]'::jsonb)
  into v_settlements
  from pg_temp.mixer_bet_settlements_tmp s
  join public.bets b on b.id = s.bet_id;

  insert into public.mixer_final_snapshots (tournament_id, standings, raffle_tickets, bet_settlements)
  values (p_tournament_id, v_standings, v_raffle, v_settlements)
  on conflict (tournament_id) do update
     set standings = excluded.standings,
         raffle_tickets = excluded.raffle_tickets,
         bet_settlements = excluded.bet_settlements,
         created_at = now();

  update public.tournaments
     set status = 'completed'
   where id = p_tournament_id;
end;
$$;

revoke all on function public.app_mixer_finalize_event(uuid) from public;
grant execute on function public.app_mixer_finalize_event(uuid) to authenticated;

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
    case when tp.gender = 'f' then 'b' else 'a' end,
    ec.starting_tokens,
    ec.starting_chips
  from public.tournament_players tp
  join public.event_config ec on ec.tournament_id = tp.tournament_id
  where tp.id = v_player_id
  on conflict (player_id) do nothing;

  return v_player_id;
end;
$$;

revoke all on function public.app_mixer_bind_roster_entry(uuid, text) from public;
grant execute on function public.app_mixer_bind_roster_entry(uuid, text) to authenticated;

alter table public.event_config enable row level security;
alter table public.mixer_rounds enable row level security;
alter table public.player_event_state enable row level security;
alter table public.mixer_votes enable row level security;
alter table public.mixer_pairings enable row level security;
alter table public.mixer_sit_outs enable row level security;
alter table public.mixer_scores enable row level security;
alter table public.bets enable row level security;
alter table public.payments enable row level security;
alter table public.mixer_final_snapshots enable row level security;

create policy "event config readable by members"
  on public.event_config for select
  using (public.is_tournament_member(tournament_id));

create policy "rounds readable by members"
  on public.mixer_rounds for select
  using (public.is_tournament_member(tournament_id));

create policy "own player event state readable"
  on public.player_event_state for select
  using (public.app_player_belongs_to_user(player_id) or public.is_tournament_manager(tournament_id));

create policy "own votes readable"
  on public.mixer_votes for select
  using (public.app_player_belongs_to_user(voter_player_id));

create policy "own votes writable"
  on public.mixer_votes for insert
  with check (public.app_player_belongs_to_user(voter_player_id));

create policy "own votes updatable"
  on public.mixer_votes for update
  using (public.app_player_belongs_to_user(voter_player_id))
  with check (public.app_player_belongs_to_user(voter_player_id));

create policy "pairings readable by members"
  on public.mixer_pairings for select
  using (public.is_tournament_member(tournament_id));

create policy "sit outs readable by members"
  on public.mixer_sit_outs for select
  using (public.is_tournament_member(tournament_id));

create policy "mixer scores readable by members"
  on public.mixer_scores for select
  using (public.is_tournament_member(tournament_id));

create policy "own bets readable"
  on public.bets for select
  using (public.app_player_belongs_to_user(bettor_player_id));

create policy "own bets writable"
  on public.bets for insert
  with check (public.app_player_belongs_to_user(bettor_player_id));

create policy "own bets updatable"
  on public.bets for update
  using (public.app_player_belongs_to_user(bettor_player_id))
  with check (public.app_player_belongs_to_user(bettor_player_id));

create policy "own payments readable"
  on public.payments for select
  using (public.app_player_belongs_to_user(player_id) or public.is_tournament_manager(tournament_id));

create policy "own payments insertable"
  on public.payments for insert
  with check (public.app_player_belongs_to_user(player_id));

create policy "snapshots readable by members"
  on public.mixer_final_snapshots for select
  using (public.is_tournament_member(tournament_id));
