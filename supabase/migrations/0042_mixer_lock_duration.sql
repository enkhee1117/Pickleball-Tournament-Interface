alter table public.event_config
  alter column lock_seconds set default 86400,
  drop constraint if exists event_config_lock_seconds_check,
  add constraint event_config_lock_seconds_check check (lock_seconds between 5 and 604800);

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
    greatest(5, least(coalesce(p_lock_seconds, 86400), 604800)),
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
    now() + make_interval(secs => greatest(5, least(coalesce(p_lock_seconds, 86400), 604800)))
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
    and tp.withdrawn_at is null
  on conflict (player_id) do nothing;

  update public.tournaments
     set status = 'active'
   where id = p_tournament_id and status = 'draft';
end;
$$;

revoke all on function public.app_ensure_mixer_event(uuid, int, int, int, int, int, numeric, boolean, boolean, boolean) from public;
grant execute on function public.app_ensure_mixer_event(uuid, int, int, int, int, int, numeric, boolean, boolean, boolean) to authenticated;

create or replace function public.app_update_mixer_config(
  p_tournament_id uuid,
  p_starting_tokens int default null,
  p_starting_chips int default null,
  p_rounds int default null,
  p_courts int default null,
  p_lock_mode text default null,
  p_lock_seconds int default null,
  p_alpha numeric default null,
  p_beta numeric default null,
  p_gamma numeric default null,
  p_tau numeric default null,
  p_grief_floor numeric default null,
  p_repeat_decay numeric default null,
  p_entry_fee numeric default null,
  p_pay_to_play_enabled boolean default null,
  p_boost_tokens int default null,
  p_boost_price numeric default null,
  p_boost_limit int default null,
  p_betting_enabled boolean default null,
  p_raffle_enabled boolean default null,
  p_downvotes_enabled boolean default null,
  p_podium_markets int default null,
  p_betting_prize_winners int default null,
  p_betting_rake_pct numeric default null,
  p_prize_buckets jsonb default null,
  p_payment_methods jsonb default null,
  p_raffle_prize text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_format text;
  v_prize_total numeric;
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  select format into v_format from public.tournaments where id = p_tournament_id;
  if v_format <> 'partner_mixer' then
    raise exception 'tournament is not a partner mixer' using errcode = '22023';
  end if;

  if p_lock_mode is not null and p_lock_mode not in ('timer', 'manual') then
    raise exception 'invalid lock mode' using errcode = '22023';
  end if;

  if p_prize_buckets is not null then
    v_prize_total :=
      coalesce((p_prize_buckets->>'tournament')::numeric, 0) +
      coalesce((p_prize_buckets->>'raffle')::numeric, 0) +
      coalesce((p_prize_buckets->>'betting')::numeric, 0) +
      coalesce((p_prize_buckets->>'reserve')::numeric, 0);

    if abs(v_prize_total - 1) > 0.001 then
      raise exception 'prize buckets must total 100%%' using errcode = '22023';
    end if;
  end if;

  update public.event_config
     set starting_tokens = coalesce(greatest(1, least(p_starting_tokens, 100)), starting_tokens),
         starting_chips = coalesce(greatest(0, p_starting_chips), starting_chips),
         rounds = coalesce(greatest(1, least(p_rounds, 50)), rounds),
         courts = coalesce(greatest(1, least(p_courts, 16)), courts),
         lock_mode = coalesce(p_lock_mode, lock_mode),
         lock_seconds = coalesce(greatest(5, least(p_lock_seconds, 604800)), lock_seconds),
         alpha = coalesce(greatest(0, p_alpha), alpha),
         beta = coalesce(greatest(0, p_beta), beta),
         gamma = coalesce(greatest(0, p_gamma), gamma),
         tau = coalesce(greatest(0.01, p_tau), tau),
         grief_floor = coalesce(greatest(0, p_grief_floor), grief_floor),
         repeat_decay = coalesce(greatest(0, least(p_repeat_decay, 1)), repeat_decay),
         entry_fee = coalesce(greatest(0, p_entry_fee), entry_fee),
         pay_to_play_enabled = coalesce(p_pay_to_play_enabled, pay_to_play_enabled),
         boost_tokens = coalesce(greatest(0, least(p_boost_tokens, 100)), boost_tokens),
         boost_price = coalesce(greatest(0, p_boost_price), boost_price),
         boost_limit = coalesce(greatest(0, least(p_boost_limit, 10)), boost_limit),
         betting_enabled = coalesce(p_betting_enabled, betting_enabled),
         raffle_enabled = coalesce(p_raffle_enabled, raffle_enabled),
         downvotes_enabled = coalesce(p_downvotes_enabled, downvotes_enabled),
         podium_markets = coalesce(greatest(1, least(p_podium_markets, 8)), podium_markets),
         betting_prize_winners = coalesce(greatest(1, least(p_betting_prize_winners, 20)), betting_prize_winners),
         betting_rake_pct = coalesce(greatest(0, least(p_betting_rake_pct, 1)), betting_rake_pct),
         prize_buckets = coalesce(p_prize_buckets, prize_buckets),
         payment_methods = coalesce(p_payment_methods, payment_methods),
         raffle_prize = coalesce(nullif(trim(p_raffle_prize), ''), raffle_prize)
   where tournament_id = p_tournament_id;

  if not found then
    raise exception 'mixer config not found' using errcode = '02000';
  end if;

  update public.mixer_rounds
     set lock_at = case
       when state = 'open' and coalesce(p_lock_mode, (select lock_mode from public.event_config where tournament_id = p_tournament_id)) = 'timer'
         then now() + make_interval(secs => (select lock_seconds from public.event_config where tournament_id = p_tournament_id))
       when coalesce(p_lock_mode, (select lock_mode from public.event_config where tournament_id = p_tournament_id)) = 'manual'
         then null
       else lock_at
     end
   where tournament_id = p_tournament_id
     and state = 'open';
end;
$$;

revoke all on function public.app_update_mixer_config(uuid, int, int, int, int, text, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, int, numeric, int, boolean, boolean, boolean, int, int, numeric, jsonb, jsonb, text) from public;
grant execute on function public.app_update_mixer_config(uuid, int, int, int, int, text, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, int, numeric, int, boolean, boolean, boolean, int, int, numeric, jsonb, jsonb, text) to authenticated;

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
      values (v_tournament_id, v_round_no + 1, 'open', now() + make_interval(secs => coalesce(v_lock_seconds, 86400)))
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
