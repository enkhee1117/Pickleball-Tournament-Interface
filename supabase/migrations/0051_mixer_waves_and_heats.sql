-- 0051 — Waves / heats: correct play & scoring when games outnumber courts.
--
-- The bug this fixes (the "many players, few courts" case):
--   A round seats EVERY eligible player (0049), so with N players and M courts
--   there can be more games than courts. court_no was a rotating label
--   (((pair_index/2) % courts) + 1), so a court number could carry TWO games in
--   one round. But everything downstream keyed a game by (round_id, court_no):
--     * mixer_scores had unique (round_id, court_no) — only ONE of the two games
--       on a court could ever be scored;
--     * app_mixer_finalize_event / buildCourtResults grouped teams by
--       (round_id, court_no) — the 2nd game's teams were invisible and their
--       points were mis-attributed (row_number 3/4 collapsed into team B).
--   So at 16 players on 3 courts (8 teams → 4 games) one whole game vanished.
--
-- The fix models what actually happens on the floor: when games outnumber
-- courts they run in WAVES (heats). Game g plays on court (g % courts)+1 during
-- wave (g / courts)+1. (court_no, wave_no) now uniquely identifies a game, and
-- the two teams of a game share the same (court_no, wave_no). Wave 1 plays now;
-- wave 2 waits for the court. For events where games ≤ courts nothing changes:
-- every game is wave 1 (the new columns default to 1).
--
-- Backward-compatible: existing pairings/scores get wave_no = 1, so the new
-- unique (round_id, court_no, wave_no) is satisfied exactly where the old
-- (round_id, court_no) was.

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Schema: wave_no on pairings + scores
-- ---------------------------------------------------------------------------
alter table public.mixer_pairings
  add column if not exists wave_no int not null default 1 check (wave_no >= 1);

alter table public.mixer_scores
  add column if not exists wave_no int not null default 1 check (wave_no >= 1);

-- Re-key scores by the game slot (court + wave), not just the court.
alter table public.mixer_scores
  drop constraint if exists mixer_scores_round_id_court_no_key;
alter table public.mixer_scores
  add constraint mixer_scores_round_court_wave_key
  unique (round_id, court_no, wave_no);

-- ---------------------------------------------------------------------------
-- 2. app_mixer_draw_round — assign wave_no alongside court_no
-- ---------------------------------------------------------------------------
-- Body identical to 0050 (draw precondition errors) except the two places that
-- stamp court_no now also stamp wave_no:
--   court_no = ((game_index) % courts) + 1
--   wave_no  = ((game_index) / courts) + 1     where game_index = pair_index / 2
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
  if v_round.state in ('drawing', 'revealed', 'playing', 'done') then
    raise exception 'This round has already been drawn.' using errcode = '55000';
  elsif v_round.state <> 'locked' then
    raise exception 'Lock the ballot before drawing.' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.mixer_rounds mr
    where mr.tournament_id = v_round.tournament_id
      and mr.round_no < v_round.round_no
      and mr.state <> 'done'
  ) then
    raise exception 'Finish earlier rounds before drawing this round.' using errcode = '55000';
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
        insert into public.mixer_pairings (round_id, tournament_id, player_a_id, player_b_id, court_no, wave_no, weight)
        values (
          p_round_id, v_round.tournament_id, v_a.player_id, v_b_id,
          ((v_pairs / 2) % greatest(1, v_cfg.courts)) + 1,
          ((v_pairs / 2) / greatest(1, v_cfg.courts)) + 1,
          v_weight
        );
        v_available_b := array_remove(v_available_b, v_b_id);
        v_pairs := v_pairs + 1;
        exit;
      end if;
    end loop;
  end loop;

  -- 'same' mode: re-group so same-gender teams face each other, then re-derive
  -- BOTH court_no and wave_no from the regrouped order.
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
       set court_no = ((o.rn / 2) % greatest(1, v_cfg.courts)) + 1,
           wave_no  = ((o.rn / 2) / greatest(1, v_cfg.courts)) + 1
      from ordered o
     where o.id = mp.id;
  end if;

  insert into public.mixer_sit_outs (round_id, tournament_id, player_id)
  select p_round_id, v_round.tournament_id, pes.player_id
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id
    and tp.withdrawn_at is null
    and not exists (
      select 1 from public.mixer_pairings mp
      where mp.round_id = p_round_id
        and (mp.player_a_id = pes.player_id or mp.player_b_id = pes.player_id)
    )
  on conflict (round_id, player_id) do nothing;

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

-- ---------------------------------------------------------------------------
-- 3. app_mixer_score_court — score a game slot (court + wave)
-- ---------------------------------------------------------------------------
-- Signature change: adds p_wave_no. Drop the old 4-arg form so PostgREST never
-- resolves an ambiguous overload. p_wave_no defaults to 1 so any legacy caller
-- (games ≤ courts, all wave 1) keeps working unchanged.
drop function if exists public.app_mixer_score_court(uuid, int, int, int);

create or replace function public.app_mixer_score_court(
  p_round_id uuid,
  p_court_no int,
  p_team_a_score int,
  p_team_b_score int,
  p_wave_no int default 1
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
    round_id, tournament_id, court_no, wave_no, team_a_score, team_b_score, completed_at
  )
  values (
    p_round_id, v_tournament_id, greatest(1, p_court_no), greatest(1, p_wave_no),
    greatest(0, p_team_a_score), greatest(0, p_team_b_score), now()
  )
  on conflict (round_id, court_no, wave_no) do update
     set team_a_score = excluded.team_a_score,
         team_b_score = excluded.team_b_score,
         completed_at = excluded.completed_at;
end;
$$;

revoke all on function public.app_mixer_score_court(uuid, int, int, int, int) from public;
grant execute on function public.app_mixer_score_court(uuid, int, int, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. app_mixer_finalize_event — attribute points per game slot (court + wave)
-- ---------------------------------------------------------------------------
-- Body identical to 0041 except both standings/winners CTE blocks now partition
-- pairings by (round_id, court_no, wave_no) and join scores on the same triple,
-- so the second game on a court is scored and counted correctly.
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
      row_number() over (partition by mp.round_id, mp.court_no, mp.wave_no order by mp.created_at, mp.id) as team_no
    from public.mixer_pairings mp
    where mp.tournament_id = p_tournament_id
  ),
  team_points as (
    select
      op.player_a_id,
      op.player_b_id,
      case when op.team_no = 1 then ms.team_a_score else ms.team_b_score end as points
    from ordered_pairings op
    join public.mixer_scores ms
      on ms.round_id = op.round_id and ms.court_no = op.court_no and ms.wave_no = op.wave_no
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
      row_number() over (partition by mp.round_id, mp.court_no, mp.wave_no order by mp.created_at, mp.id) as team_no
    from public.mixer_pairings mp
    where mp.tournament_id = p_tournament_id
  ),
  team_points as (
    select
      op.player_a_id,
      op.player_b_id,
      case when op.team_no = 1 then ms.team_a_score else ms.team_b_score end as points
    from ordered_pairings op
    join public.mixer_scores ms
      on ms.round_id = op.round_id and ms.court_no = op.court_no and ms.wave_no = op.wave_no
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
