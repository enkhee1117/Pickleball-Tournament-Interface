-- Remote DB smoke test for the Partner Mixer RPC lifecycle.
-- Run against a linked project:
--   supabase db query --linked --file supabase/tests/partner_mixer_smoke.sql
--
-- The test creates synthetic auth users and a temporary tournament, exercises
-- the real SECURITY DEFINER RPCs, asserts the expected state, and cleans up.

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_u1 uuid := gen_random_uuid();
  v_u2 uuid := gen_random_uuid();
  v_u3 uuid := gen_random_uuid();
  v_u4 uuid := gen_random_uuid();
  v_u5 uuid := gen_random_uuid();
  v_u6 uuid := gen_random_uuid();
  v_u7 uuid := gen_random_uuid();
  v_u8 uuid := gen_random_uuid();
  v_tournament uuid;
  v_round1 uuid;
  v_round2 uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_p3 uuid;
  v_p4 uuid;
  v_p5 uuid;
  v_p6 uuid;
  v_p7 uuid;
  v_p8 uuid;
  v_payment uuid;
  v_pairings int;
  v_court int;
  v_team_no int;
  v_token_count int;
  v_round_count int;
  v_snapshot_count int;
  v_payout int;
  v_winner uuid;
  v_pool text;
  v_lock_mode text;
  v_lock_seconds int;
  v_raffle_winner jsonb;
  v_round2_state text;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (v_owner, 'authenticated', 'authenticated', 'codex-owner-' || v_owner || '@example.invalid', 'smoke', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_u1, 'authenticated', 'authenticated', 'codex-player-' || v_u1 || '@example.invalid', 'smoke', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_u2, 'authenticated', 'authenticated', 'codex-player-' || v_u2 || '@example.invalid', 'smoke', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_u3, 'authenticated', 'authenticated', 'codex-player-' || v_u3 || '@example.invalid', 'smoke', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_u4, 'authenticated', 'authenticated', 'codex-player-' || v_u4 || '@example.invalid', 'smoke', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_u5, 'authenticated', 'authenticated', 'codex-player-' || v_u5 || '@example.invalid', 'smoke', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_u6, 'authenticated', 'authenticated', 'codex-player-' || v_u6 || '@example.invalid', 'smoke', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_u7, 'authenticated', 'authenticated', 'codex-player-' || v_u7 || '@example.invalid', 'smoke', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_u8, 'authenticated', 'authenticated', 'codex-player-' || v_u8 || '@example.invalid', 'smoke', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_tournament := public.app_create_tournament(
    'Codex Mixer Smoke ' || left(v_owner::text, 8),
    'partner_mixer',
    null,
    8,
    'mixed',
    'balanced'
  );
  perform public.app_ensure_mixer_event(v_tournament, 10, 100, 2, 2, 86400, 20, true, true, true);
  perform public.app_update_mixer_config(
    p_tournament_id => v_tournament,
    p_starting_tokens => 10,
    p_starting_chips => 100,
    p_rounds => 2,
    p_courts => 2,
    p_lock_mode => 'manual',
    p_lock_seconds => 90061,
    p_alpha => 1,
    p_beta => 2.5,
    p_gamma => 1,
    p_tau => 2,
    p_grief_floor => 4,
    p_repeat_decay => 0.2,
    p_entry_fee => 25,
    p_pay_to_play_enabled => true,
    p_boost_tokens => 5,
    p_boost_price => 25,
    p_boost_limit => 1,
    p_betting_enabled => true,
    p_raffle_enabled => true,
    p_downvotes_enabled => true,
    p_podium_markets => 3,
    p_betting_prize_winners => 3,
    p_betting_rake_pct => 0,
    p_prize_buckets => '{"tournament":0.5,"raffle":0.2,"betting":0.2,"reserve":0.1}'::jsonb,
    p_payment_methods => '{"zelle":{"on":true,"handle":"smoke@example.invalid"},"venmo":{"on":true,"handle":"smokepickle"},"cash":{"on":true,"handle":""}}'::jsonb,
    p_raffle_prize => 'Smoke paddle'
  );

  select lock_mode, lock_seconds into v_lock_mode, v_lock_seconds
  from public.event_config
  where tournament_id = v_tournament;
  if v_lock_mode <> 'manual' then
    raise exception 'expected lock mode to update to manual, got %', v_lock_mode;
  end if;
  if v_lock_seconds <> 90061 then
    raise exception 'expected lock duration over one hour to persist, got %', v_lock_seconds;
  end if;

  perform set_config('request.jwt.claim.sub', v_u1::text, true);
  v_p1 := public.app_mixer_bind_roster_entry(v_tournament, 'Al Smoke');
  perform set_config('request.jwt.claim.sub', v_u2::text, true);
  v_p2 := public.app_mixer_bind_roster_entry(v_tournament, 'Bo Smoke');
  perform set_config('request.jwt.claim.sub', v_u3::text, true);
  v_p3 := public.app_mixer_bind_roster_entry(v_tournament, 'Cy Smoke');
  perform set_config('request.jwt.claim.sub', v_u4::text, true);
  v_p4 := public.app_mixer_bind_roster_entry(v_tournament, 'Di Smoke');
  perform set_config('request.jwt.claim.sub', v_u5::text, true);
  v_p5 := public.app_mixer_bind_roster_entry(v_tournament, 'Ev Smoke');
  perform set_config('request.jwt.claim.sub', v_u6::text, true);
  v_p6 := public.app_mixer_bind_roster_entry(v_tournament, 'Fay Smoke');
  perform set_config('request.jwt.claim.sub', v_u7::text, true);
  v_p7 := public.app_mixer_bind_roster_entry(v_tournament, 'Gus Smoke');
  perform set_config('request.jwt.claim.sub', v_u8::text, true);
  v_p8 := public.app_mixer_bind_roster_entry(v_tournament, 'Hal Smoke');

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform public.app_mixer_update_player_pool(v_p1, 'a');
  perform public.app_mixer_update_player_pool(v_p2, 'b');
  perform public.app_mixer_update_player_pool(v_p3, 'a');
  perform public.app_mixer_update_player_pool(v_p4, 'b');
  perform public.app_mixer_update_player_pool(v_p5, 'a');
  perform public.app_mixer_update_player_pool(v_p6, 'b');
  perform public.app_mixer_update_player_pool(v_p7, 'a');
  perform public.app_mixer_update_player_pool(v_p8, 'b');

  select pairing_pool into v_pool
  from public.player_event_state
  where player_id = v_p2;
  if v_pool <> 'b' then
    raise exception 'expected p2 pool b, got %', v_pool;
  end if;

  select id into v_round1
  from public.mixer_rounds
  where tournament_id = v_tournament and round_no = 1;

  perform set_config('request.jwt.claim.sub', v_u1::text, true);
  perform public.app_mixer_set_vote(v_round1, v_p1, v_p2, 2, 0);
  perform public.app_mixer_set_vote(v_round1, v_p1, v_p4, 1, 0);

  -- Adversarial: per-target upvote cap from migration 0044. The default cap
  -- is 3; trying to put 4 on a single target must raise.
  begin
    perform public.app_mixer_set_vote(v_round1, v_p1, v_p6, 4, 0);
    raise exception 'expected upvote cap to reject 4 tokens on one target';
  exception
    when sqlstate '22023' then null; -- expected
  end;

  -- Adversarial: anonymity at the API. u2 should not see u1's votes through
  -- a direct table select; RLS restricts mixer_votes to the voter's own rows.
  perform set_config('request.jwt.claim.sub', v_u2::text, true);
  perform 1 from public.mixer_votes where voter_player_id = v_p1;
  if found then
    raise exception 'u2 must not be able to read u1 votes (anonymity guardrail)';
  end if;
  perform set_config('request.jwt.claim.sub', v_u1::text, true);

  select tokens_base_remaining into v_token_count
  from public.player_event_state
  where player_id = v_p1;
  if v_token_count <> 7 then
    raise exception 'expected p1 base tokens to be 7 after votes, got %', v_token_count;
  end if;

  v_payment := public.app_mixer_request_payment(v_p1, 'pay_to_play', 'zelle', 'smoke');
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform public.app_mixer_confirm_payment(v_payment, 'confirmed');

  select tokens_bought_remaining into v_token_count
  from public.player_event_state
  where player_id = v_p1;
  if v_token_count <> 5 then
    raise exception 'expected p1 bought tokens to be 5 after boost confirmation, got %', v_token_count;
  end if;

  perform public.app_mixer_set_round_state(v_round1, 'locked');

  -- Adversarial: betting cutoff from migration 0044. With rounds=2 and the
  -- default cutoff = last round, locking round 1 also locks round 2 (upfront
  -- ballot model), which closes betting. A bet attempted now must raise.
  perform set_config('request.jwt.claim.sub', v_u1::text, true);
  begin
    perform public.app_mixer_place_bet(v_tournament, v_p1, 1, v_p2, 5);
    raise exception 'expected bet cutoff to reject post-lock wager';
  exception
    when sqlstate '42501' then null; -- expected: "betting is closed"
  end;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  -- For the rest of the happy path we want to settle a real winning bet,
  -- which requires knowing the winner. Raise the cutoff past the final
  -- round so the historical assertion at the end of the test still holds.
  update public.event_config
     set bet_lock_round_no = 50
   where tournament_id = v_tournament;

  select id, state into v_round2, v_round2_state
  from public.mixer_rounds
  where tournament_id = v_tournament and round_no = 2;
  if v_round2 is null then
    raise exception 'round 2 was not created up front';
  end if;
  if v_round2_state <> 'locked' then
    raise exception 'expected round 2 to lock with the upfront ballot, got %', v_round2_state;
  end if;

  v_pairings := public.app_mixer_draw_round(v_round1);
  if v_pairings <> 4 then
    raise exception 'expected 4 pairings, got %', v_pairings;
  end if;

  for v_court in
    select distinct court_no
    from public.mixer_pairings
    where round_id = v_round1
    order by court_no
  loop
    v_team_no := null;
    with ordered as (
      select
        mp.*,
        row_number() over (partition by mp.round_id, mp.court_no order by mp.created_at, mp.id) as team_no
      from public.mixer_pairings mp
      where mp.round_id = v_round1
    )
    select team_no into v_team_no
    from ordered
    where court_no = v_court
      and (player_a_id = v_p1 or player_b_id = v_p1);

    if v_team_no = 1 then
      perform public.app_mixer_score_court(v_round1, v_court, 11, 0);
    elsif v_team_no = 2 then
      perform public.app_mixer_score_court(v_round1, v_court, 0, 11);
    else
      perform public.app_mixer_score_court(v_round1, v_court, 7, 11);
    end if;
  end loop;

  perform public.app_mixer_set_round_state(v_round1, 'done');

  v_pairings := public.app_mixer_draw_round(v_round2);
  if v_pairings <> 4 then
    raise exception 'expected 4 round 2 pairings, got %', v_pairings;
  end if;

  for v_court in
    select distinct court_no
    from public.mixer_pairings
    where round_id = v_round2
    order by court_no
  loop
    perform public.app_mixer_score_court(v_round2, v_court, 8, 11);
  end loop;

  perform public.app_mixer_set_round_state(v_round2, 'done');

  with ordered_pairings as (
    select
      mp.*,
      row_number() over (partition by mp.round_id, mp.court_no order by mp.created_at, mp.id) as team_no
    from public.mixer_pairings mp
    where mp.tournament_id = v_tournament
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
  )
  select tp.id into v_winner
  from public.tournament_players tp
  left join player_points pp on pp.player_id = tp.id
  where tp.tournament_id = v_tournament
  group by tp.id, tp.display_name
  order by coalesce(sum(pp.points), 0) desc, tp.display_name asc
  limit 1;

  perform set_config('request.jwt.claim.sub', v_u1::text, true);
  perform public.app_mixer_place_bet(v_tournament, v_p1, 1, v_winner, 10);

  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  select count(*) into v_round_count
  from public.mixer_rounds
  where tournament_id = v_tournament;
  if v_round_count <> 2 then
    raise exception 'expected two upfront rounds, got % rounds', v_round_count;
  end if;

  perform public.app_mixer_finalize_event(v_tournament);

  select count(*) into v_snapshot_count
  from public.mixer_final_snapshots
  where tournament_id = v_tournament
    and jsonb_array_length(standings) > 0
    and jsonb_array_length(raffle_tickets) > 0
    and raffle_winner <> '{}'::jsonb;
  if v_snapshot_count <> 1 then
    raise exception 'expected final snapshot with standings, raffle tickets, and raffle winner';
  end if;

  select raffle_winner into v_raffle_winner
  from public.mixer_final_snapshots
  where tournament_id = v_tournament;
  if v_raffle_winner->>'prize' <> 'Smoke paddle' then
    raise exception 'expected raffle prize to be Smoke paddle, got %', v_raffle_winner;
  end if;

  select payout into v_payout
  from public.bets
  where tournament_id = v_tournament and bettor_player_id = v_p1;
  if coalesce(v_payout, 0) <= 0 then
    raise exception 'expected p1 winning bet payout, got %', v_payout;
  end if;

  delete from public.tournaments where id = v_tournament;
  delete from auth.users where id in (v_owner, v_u1, v_u2, v_u3, v_u4, v_u5, v_u6, v_u7, v_u8);
exception
  when others then
    delete from public.tournaments where id = v_tournament;
    delete from auth.users where id in (v_owner, v_u1, v_u2, v_u3, v_u4, v_u5, v_u6, v_u7, v_u8);
    raise;
end;
$$;

select 'partner_mixer_remote_smoke_passed' as result;
