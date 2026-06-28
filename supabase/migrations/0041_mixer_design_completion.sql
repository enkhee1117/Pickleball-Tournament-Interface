alter table public.event_config
  add column if not exists payment_methods jsonb not null default '{"zelle":{"on":true,"handle":""},"venmo":{"on":false,"handle":""},"cash":{"on":true,"handle":""}}'::jsonb,
  add column if not exists raffle_prize text not null default 'Raffle prize';

alter table public.mixer_final_snapshots
  add column if not exists raffle_winner jsonb not null default '{}'::jsonb;

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
         lock_seconds = coalesce(greatest(5, least(p_lock_seconds, 3600)), lock_seconds),
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

create or replace function public.app_mixer_update_player_pool(
  p_player_id uuid,
  p_pairing_pool text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
begin
  if p_pairing_pool not in ('a', 'b') then
    raise exception 'invalid pairing pool' using errcode = '22023';
  end if;

  select tournament_id into v_tournament_id
  from public.tournament_players
  where id = p_player_id;

  if v_tournament_id is null then
    raise exception 'player not found' using errcode = '02000';
  end if;

  perform public.app_require_tournament_manager(v_tournament_id);

  update public.player_event_state
     set pairing_pool = p_pairing_pool
   where player_id = p_player_id;

  if not found then
    insert into public.player_event_state (player_id, tournament_id, pairing_pool)
    values (p_player_id, v_tournament_id, p_pairing_pool);
  end if;
end;
$$;

revoke all on function public.app_mixer_update_player_pool(uuid, text) from public;
grant execute on function public.app_mixer_update_player_pool(uuid, text) to authenticated;

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
  v_raffle_winner jsonb := '{}'::jsonb;
  v_settlements jsonb := '[]'::jsonb;
  v_total_tickets numeric := 0;
  v_pick numeric := 0;
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  select * into v_cfg
  from public.event_config
  where tournament_id = p_tournament_id;
  if v_cfg.tournament_id is null then
    raise exception 'mixer config not found' using errcode = '02000';
  end if;

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
  ),
  ranked as (
    select
      row_number() over (order by points desc, display_name asc)::int as rank_no,
      player_id,
      display_name,
      points
    from totals
  )
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
  from ranked;

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

  select coalesce(sum((value->>'tickets')::numeric), 0)
  into v_total_tickets
  from jsonb_array_elements(v_raffle);

  if v_total_tickets > 0 then
    v_pick := random() * v_total_tickets;
    with entries as (
      select
        value,
        sum((value->>'tickets')::numeric) over (order by ordinality) as cumulative
      from jsonb_array_elements(v_raffle) with ordinality
    )
    select value || jsonb_build_object('prize', coalesce(v_cfg.raffle_prize, 'Raffle prize'))
    into v_raffle_winner
    from entries
    where cumulative >= v_pick
    order by cumulative
    limit 1;
  end if;

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
  ),
  winners as (
    select
      row_number() over (order by points desc, display_name asc)::int as market_place,
      player_id
    from totals
    order by points desc, display_name asc
    limit coalesce(v_cfg.podium_markets, 3)
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
  ),
  settlements as (
    select
      b.id as bet_id,
      b.bettor_player_id,
      b.market_place,
      floor((b.chips::numeric / nullif(cs.chips, 0)) * mp.pot)::int as payout
    from public.bets b
    join winners w on w.market_place = b.market_place and w.player_id = b.pick_player_id
    join market_pots mp on mp.market_place = b.market_place
    join correct_stakes cs on cs.market_place = b.market_place
    where b.tournament_id = p_tournament_id
  ),
  updated_bets as (
    update public.bets b
       set payout = s.payout,
           settled_at = now()
      from settlements s
     where b.id = s.bet_id
       and b.settled_at is null
    returning b.bettor_player_id, b.market_place, b.payout
  ),
  payouts as (
    select bettor_player_id, sum(payout)::int as payout
    from updated_bets
    group by bettor_player_id
  ),
  updated_states as (
    update public.player_event_state pes
       set chips_remaining = chips_remaining + payouts.payout
      from payouts
     where pes.player_id = payouts.bettor_player_id
    returning pes.player_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'bettorPlayerId', bettor_player_id,
      'marketPlace', market_place,
      'payout', payout
    )
    order by market_place, payout desc
  ), '[]'::jsonb)
  into v_settlements
  from updated_bets;

  insert into public.mixer_final_snapshots (tournament_id, standings, raffle_tickets, raffle_winner, bet_settlements)
  values (p_tournament_id, v_standings, v_raffle, coalesce(v_raffle_winner, '{}'::jsonb), v_settlements)
  on conflict (tournament_id) do update
     set standings = excluded.standings,
         raffle_tickets = excluded.raffle_tickets,
         raffle_winner = excluded.raffle_winner,
         bet_settlements = excluded.bet_settlements,
         created_at = now();

  update public.tournaments
     set status = 'completed'
   where id = p_tournament_id;
end;
$$;

revoke all on function public.app_mixer_finalize_event(uuid) from public;
grant execute on function public.app_mixer_finalize_event(uuid) to authenticated;
