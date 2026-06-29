-- Partner Mixer: all-round upfront ballots and stricter server-side round controls.

set search_path = public;

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
  v_rounds int := greatest(1, least(coalesce(p_rounds, 5), 50));
  v_lock_seconds int := greatest(5, least(coalesce(p_lock_seconds, 86400), 604800));
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
  v_requested_rounds int;
  v_min_rounds int;
  v_final_rounds int;
  v_lock_mode text;
  v_lock_seconds int;
  v_default_state text;
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

  select coalesce(max(mr.round_no), 0)
    into v_min_rounds
  from public.mixer_rounds mr
  where mr.tournament_id = p_tournament_id
    and (
      mr.state in ('drawing', 'revealed', 'playing', 'done')
      or exists (select 1 from public.mixer_pairings mp where mp.round_id = mr.id)
      or exists (select 1 from public.mixer_scores ms where ms.round_id = mr.id)
    );

  v_requested_rounds := case
    when p_rounds is null then null
    else greatest(1, least(p_rounds, 50))
  end;

  update public.event_config
     set starting_tokens = coalesce(greatest(1, least(p_starting_tokens, 100)), starting_tokens),
         starting_chips = coalesce(greatest(0, p_starting_chips), starting_chips),
         rounds = coalesce(greatest(coalesce(v_requested_rounds, rounds), v_min_rounds), rounds),
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
   where tournament_id = p_tournament_id
   returning rounds, lock_mode, lock_seconds into v_final_rounds, v_lock_mode, v_lock_seconds;

  if not found then
    raise exception 'mixer config not found' using errcode = '02000';
  end if;

  v_default_state := case
    when exists (
      select 1 from public.mixer_rounds
      where tournament_id = p_tournament_id
        and state in ('locked', 'drawing', 'revealed', 'playing', 'done')
    ) then 'locked'
    else 'open'
  end;

  insert into public.mixer_rounds (tournament_id, round_no, state, lock_at)
  select
    p_tournament_id,
    gs.round_no,
    v_default_state,
    case when v_lock_mode = 'timer' and v_default_state = 'open' then now() + make_interval(secs => v_lock_seconds) else null end
  from generate_series(1, v_final_rounds) as gs(round_no)
  on conflict (tournament_id, round_no) do nothing;

  delete from public.mixer_rounds mr
  where mr.tournament_id = p_tournament_id
    and mr.round_no > v_final_rounds
    and mr.state in ('open', 'locked')
    and not exists (select 1 from public.mixer_pairings mp where mp.round_id = mr.id)
    and not exists (select 1 from public.mixer_scores ms where ms.round_id = mr.id);

  update public.mixer_rounds
     set lock_at = case
       when state = 'open' and v_lock_mode = 'timer'
         then now() + make_interval(secs => v_lock_seconds)
       when v_lock_mode = 'manual'
         then null
       else lock_at
     end
   where tournament_id = p_tournament_id
     and state = 'open';
end;
$$;

revoke all on function public.app_update_mixer_config(uuid, int, int, int, int, text, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, int, numeric, int, boolean, boolean, boolean, int, int, numeric, jsonb, jsonb, text) from public;
grant execute on function public.app_update_mixer_config(uuid, int, int, int, int, text, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, int, numeric, int, boolean, boolean, boolean, int, int, numeric, jsonb, jsonb, text) to authenticated;

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
  v_cfg public.event_config%rowtype;
  v_voter_tournament_id uuid;
  v_target_tournament_id uuid;
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
  if v_round.state <> 'open' or (v_round.lock_at is not null and v_round.lock_at <= now()) then
    raise exception 'voting is locked' using errcode = '42501';
  end if;
  if not public.app_player_belongs_to_user(p_voter_player_id) then
    raise exception 'not your roster entry' using errcode = '42501';
  end if;
  if p_voter_player_id = p_target_player_id then
    raise exception 'cannot vote for yourself' using errcode = '22023';
  end if;

  select * into v_cfg
  from public.event_config
  where tournament_id = v_round.tournament_id;

  if coalesce(p_down_tokens, 0) > 0 and not coalesce(v_cfg.downvotes_enabled, true) then
    raise exception 'downvotes are disabled' using errcode = '22023';
  end if;

  select tournament_id into v_voter_tournament_id
  from public.tournament_players
  where id = p_voter_player_id;

  select tournament_id into v_target_tournament_id
  from public.tournament_players
  where id = p_target_player_id;

  if v_voter_tournament_id is distinct from v_round.tournament_id then
    raise exception 'voter is not in this tournament' using errcode = '22023';
  end if;
  if v_target_tournament_id is distinct from v_round.tournament_id then
    raise exception 'target is not in this tournament' using errcode = '22023';
  end if;

  select * into v_state
  from public.player_event_state
  where player_id = p_voter_player_id
  for update;

  if v_state.player_id is null then
    raise exception 'player event state not found' using errcode = '02000';
  end if;

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
  v_b_id uuid;
  v_available_b uuid[];
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
    from unnest(v_available_b) as b(player_id);

    if v_total <= 0 then
      exit;
    end if;

    v_cursor := random() * v_total;
    for v_b_id in select player_id from unnest(v_available_b) as b(player_id) order by random() loop
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
  v_round public.mixer_rounds%rowtype;
  v_rounds int;
  v_lock_seconds int;
  v_lock_mode text;
  v_pairing_courts int;
  v_scored_courts int;
begin
  select * into v_round from public.mixer_rounds where id = p_round_id;
  if v_round.id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_round.tournament_id);
  if p_state not in ('open', 'locked', 'drawing', 'revealed', 'playing', 'done') then
    raise exception 'unknown round state' using errcode = '22023';
  end if;
  if p_state in ('drawing', 'revealed') then
    raise exception 'use draw to reveal pairings' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.mixer_rounds mr
    where mr.tournament_id = v_round.tournament_id
      and mr.round_no < v_round.round_no
      and mr.state <> 'done'
  ) then
    raise exception 'finish earlier rounds before changing this round' using errcode = '42501';
  end if;

  select rounds, lock_seconds, lock_mode into v_rounds, v_lock_seconds, v_lock_mode
  from public.event_config
  where tournament_id = v_round.tournament_id;

  if p_state = 'open' then
    if exists (
      select 1
      from public.mixer_rounds mr
      where mr.tournament_id = v_round.tournament_id
        and mr.state in ('drawing', 'revealed', 'playing', 'done')
    ) then
      raise exception 'cannot reopen ballots after the draw starts' using errcode = '42501';
    end if;

    update public.mixer_rounds
       set state = 'open',
           lock_at = case when coalesce(v_lock_mode, 'timer') = 'timer' then now() + make_interval(secs => coalesce(v_lock_seconds, 86400)) else null end
     where tournament_id = v_round.tournament_id
       and state = 'locked';
    return;
  end if;

  if p_state = 'locked' then
    if v_round.state not in ('open', 'locked') then
      raise exception 'only open ballots can be locked' using errcode = '42501';
    end if;

    update public.mixer_rounds
       set state = 'locked',
           lock_at = null
     where tournament_id = v_round.tournament_id
       and state = 'open';
    return;
  end if;

  if p_state = 'playing' then
    if v_round.state <> 'revealed' then
      raise exception 'reveal pairings before starting play' using errcode = '42501';
    end if;

    update public.mixer_rounds
       set state = 'playing'
     where id = p_round_id;
    return;
  end if;

  if p_state = 'done' then
    if v_round.state not in ('playing', 'revealed') then
      raise exception 'round must be revealed or playing before marking done' using errcode = '42501';
    end if;

    select count(distinct court_no) into v_pairing_courts
    from public.mixer_pairings
    where round_id = p_round_id;

    select count(*) into v_scored_courts
    from public.mixer_scores
    where round_id = p_round_id
      and completed_at is not null;

    if coalesce(v_pairing_courts, 0) > 0 and coalesce(v_scored_courts, 0) < coalesce(v_pairing_courts, 0) then
      raise exception 'score every court before marking the round done' using errcode = '42501';
    end if;

    update public.mixer_rounds
       set state = 'done'
     where id = p_round_id;

    if not exists (
      select 1
      from public.mixer_rounds
      where tournament_id = v_round.tournament_id
        and round_no <= coalesce(v_rounds, v_round.round_no)
        and state <> 'done'
    ) then
      update public.tournaments
         set status = 'completed'
       where id = v_round.tournament_id;
    end if;
    return;
  end if;
end;
$$;

revoke all on function public.app_mixer_set_round_state(uuid, text) from public;
grant execute on function public.app_mixer_set_round_state(uuid, text) to authenticated;

-- Backfill all configured rounds for existing Partner Mixer events.
insert into public.mixer_rounds (tournament_id, round_no, state, lock_at)
select
  ec.tournament_id,
  gs.round_no,
  case
    when exists (
      select 1
      from public.mixer_rounds existing
      where existing.tournament_id = ec.tournament_id
        and existing.state in ('locked', 'drawing', 'revealed', 'playing', 'done')
    ) then 'locked'
    else 'open'
  end,
  case
    when ec.lock_mode = 'timer'
      and not exists (
        select 1
        from public.mixer_rounds existing
        where existing.tournament_id = ec.tournament_id
          and existing.state in ('locked', 'drawing', 'revealed', 'playing', 'done')
      )
      then now() + make_interval(secs => ec.lock_seconds)
    else null
  end
from public.event_config ec
join public.tournaments t on t.id = ec.tournament_id and t.format = 'partner_mixer'
cross join lateral generate_series(1, ec.rounds) as gs(round_no)
on conflict (tournament_id, round_no) do nothing;
