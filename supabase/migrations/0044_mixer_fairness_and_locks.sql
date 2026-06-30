-- 0044_mixer_fairness_and_locks.sql
--
-- Hardening pass on the Partner Mixer after the audit:
--   0038 — full schema (47 KB)
--   0039 — lint fixes
--   0040 — vote/bet/payment writes moved behind SECURITY DEFINER RPCs
--   0041 — payment methods, raffle winner pick, design completion
--   0042 — lock duration knobs
--   0043 — upfront rounds + stricter state machine
--   0044 — THIS migration: draw-round row lock, betting cutoff, upvote-per-target
--           cap at vote time (not just finalization), target-side vote index,
--           and a server-side bets summary RPC so admin pages can stop selecting
--           raw bet rows for an aggregate.
--
-- Migrations are additive — no schema drops, no data backfills.

------------------------------------------------------------------------
-- 1. event_config: new configurable knobs
------------------------------------------------------------------------

alter table public.event_config
  add column if not exists upvote_cap_per_target int not null default 3
    check (upvote_cap_per_target between 1 and 99);

-- bet_lock_round_no: betting markets close once the round whose round_no
-- equals this value starts (state moves out of 'open'). Default null means
-- "the final round" (resolved at place-bet time using event_config.rounds).
alter table public.event_config
  add column if not exists bet_lock_round_no int
    check (bet_lock_round_no is null or bet_lock_round_no between 1 and 50);

------------------------------------------------------------------------
-- 2. mixer_votes: index the target side. The draw procedure already does
--    target-side lookups per candidate pair; the existing voter index
--    does not help that direction. Critical once rosters pass ~30 players.
------------------------------------------------------------------------

create index if not exists mixer_votes_target_idx
  on public.mixer_votes(target_player_id);

------------------------------------------------------------------------
-- 3. app_mixer_set_vote: enforce the per-target upvote cap from
--    event_config.upvote_cap_per_target. Raffle finalization already caps
--    via `least(up_tokens, 3)` (mig 0038:1026), but the votes table itself
--    accepted >cap allocations, so the audit trail was misleading and the
--    cap was bypassable at the formula level (β·sqrt benefits from large
--    raw upvotes). Now it is enforced at write time.
------------------------------------------------------------------------

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
  v_upvote_cap int;
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

  v_upvote_cap := coalesce(v_cfg.upvote_cap_per_target, 3);
  if greatest(0, p_up_tokens) > v_upvote_cap then
    raise exception 'upvote cap exceeded' using errcode = '22023';
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

------------------------------------------------------------------------
-- 4. app_mixer_draw_round: take an exclusive row lock on the round so two
--    admins (or admin + auto-trigger) cannot race the draw and silently
--    discard one of the inserted pairing sets. The unique constraints on
--    mixer_pairings (round_id, player_a_id) and (round_id, player_b_id)
--    kept the data consistent, but the loser saw partial work — bad UX
--    and impossible to debug after the fact.
------------------------------------------------------------------------

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

------------------------------------------------------------------------
-- 5. app_mixer_place_bet: respect the bet cutoff. Markets close once the
--    cutoff round leaves the 'open' state. Default cutoff is the last
--    round (event_config.rounds) — set event_config.bet_lock_round_no to
--    override. Prior behavior accepted bets all the way until settlement,
--    which let savvy players wager once results were essentially decided.
------------------------------------------------------------------------

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
  v_cfg public.event_config%rowtype;
  v_existing int := 0;
  v_balance int;
  v_bettor_tournament_id uuid;
  v_pick_tournament_id uuid;
  v_cutoff_round int;
  v_cutoff_locked boolean;
begin
  if not public.app_player_belongs_to_user(p_bettor_player_id) then
    raise exception 'not your roster entry' using errcode = '42501';
  end if;

  select * into v_cfg
  from public.event_config
  where tournament_id = p_tournament_id;
  if v_cfg.tournament_id is null then
    raise exception 'mixer config not found' using errcode = '02000';
  end if;
  if not coalesce(v_cfg.betting_enabled, true) then
    raise exception 'betting is disabled' using errcode = '22023';
  end if;
  if p_market_place < 1 or p_market_place > coalesce(v_cfg.podium_markets, 3) then
    raise exception 'unknown betting market' using errcode = '22023';
  end if;

  v_cutoff_round := coalesce(v_cfg.bet_lock_round_no, v_cfg.rounds);
  select exists (
    select 1
    from public.mixer_rounds mr
    where mr.tournament_id = p_tournament_id
      and mr.round_no >= v_cutoff_round
      and mr.state <> 'open'
  ) into v_cutoff_locked;

  if v_cutoff_locked then
    raise exception 'betting is closed' using errcode = '42501';
  end if;

  select tournament_id into v_bettor_tournament_id
  from public.tournament_players
  where id = p_bettor_player_id;

  select tournament_id into v_pick_tournament_id
  from public.tournament_players
  where id = p_pick_player_id;

  if v_bettor_tournament_id is distinct from p_tournament_id then
    raise exception 'bettor is not in this tournament' using errcode = '22023';
  end if;
  if v_pick_tournament_id is distinct from p_tournament_id then
    raise exception 'pick is not in this tournament' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.bets
    where tournament_id = p_tournament_id
      and bettor_player_id = p_bettor_player_id
      and settled_at is not null
  ) then
    raise exception 'betting is settled' using errcode = '42501';
  end if;

  select coalesce(chips, 0) into v_existing
  from public.bets
  where tournament_id = p_tournament_id
    and market_place = p_market_place
    and bettor_player_id = p_bettor_player_id;

  select chips_remaining into v_balance
  from public.player_event_state
  where player_id = p_bettor_player_id
  for update;

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

------------------------------------------------------------------------
-- 6. app_mixer_bets_summary: aggregate per-market liquidity for admin
--    surfaces without returning individual bet rows. The admin page only
--    needs (market_place, total_chips, bet_count) — not who staked what.
------------------------------------------------------------------------

create or replace function public.app_mixer_bets_summary(p_tournament_id uuid)
returns table(market_place int, total_chips int, bet_count int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.app_require_tournament_manager(p_tournament_id);
  return query
    select b.market_place,
           coalesce(sum(b.chips), 0)::int as total_chips,
           count(*)::int as bet_count
    from public.bets b
    where b.tournament_id = p_tournament_id
    group by b.market_place
    order by b.market_place;
end;
$$;

revoke all on function public.app_mixer_bets_summary(uuid) from public;
grant execute on function public.app_mixer_bets_summary(uuid) to authenticated;
