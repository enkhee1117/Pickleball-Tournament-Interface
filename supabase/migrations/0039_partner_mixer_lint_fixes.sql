-- Partner Mixer lint fixes: avoid temp-table references inside PL/pgSQL
-- functions so remote schema lint can validate function bodies statically.

set search_path = public;

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
