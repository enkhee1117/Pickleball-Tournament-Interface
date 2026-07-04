-- 0048 — Organizer recovery controls: reopen a drawn round, wipe & refund a
-- round's ballots, or reset the whole event and rerun from Round 1.
--
-- Real mixer nights go sideways: a draw fires before everyone arrived, a
-- test ballot pollutes round 1, the organizer wants a clean rerun. Before
-- this migration the only escape hatch was manual SQL. All three RPCs are
-- manager-gated and keep the roster + payment history intact.

set search_path = public;

-- ---------------------------------------------------------------------------
-- Reopen a round that was locked/drawn: clears its pairings and sit-outs
-- (undoing the sit-out bookkeeping), re-arms the lock timer, and puts the
-- round back to 'open' so ballots can change and the draw can rerun.
-- ---------------------------------------------------------------------------
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
  delete from public.mixer_scores where round_id = p_round_id and completed_at is null;

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

-- ---------------------------------------------------------------------------
-- Wipe one round's ballots and refund every token spent on them, so players
-- can vote again from a clean slate. Does not touch pairings — combine with
-- app_mixer_reopen_round for a full rerun of the round.
-- ---------------------------------------------------------------------------
create or replace function public.app_mixer_reset_round_votes(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.mixer_rounds%rowtype;
  v_count int;
begin
  select * into v_round from public.mixer_rounds where id = p_round_id for update;
  if v_round.id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_round.tournament_id);

  with refunds as (
    select voter_player_id,
           sum(base_tokens_spent)::int as base_back,
           sum(bought_tokens_spent)::int as bought_back
    from public.mixer_votes
    where round_id = p_round_id
    group by voter_player_id
  )
  update public.player_event_state pes
     set tokens_base_remaining = tokens_base_remaining + refunds.base_back,
         tokens_bought_remaining = tokens_bought_remaining + refunds.bought_back
    from refunds
   where pes.player_id = refunds.voter_player_id;

  delete from public.mixer_votes where round_id = p_round_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.app_mixer_reset_round_votes(uuid) from public;
grant execute on function public.app_mixer_reset_round_votes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Full event reset: wipe votes, pairings, sit-outs, scores, bets, check-in
-- acks, and the final snapshot; restore every player's tokens and chips
-- (base from config; bought re-granted from confirmed boost purchases);
-- reopen every round with a fresh timer. Roster and payments are preserved.
-- ---------------------------------------------------------------------------
create or replace function public.app_mixer_reset_event(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.event_config%rowtype;
begin
  perform public.app_require_tournament_manager(p_tournament_id);
  select * into v_cfg from public.event_config where tournament_id = p_tournament_id;
  if v_cfg.tournament_id is null then
    raise exception 'mixer config not found' using errcode = '02000';
  end if;

  delete from public.mixer_votes where tournament_id = p_tournament_id;
  delete from public.mixer_pairings where tournament_id = p_tournament_id;
  delete from public.mixer_sit_outs where tournament_id = p_tournament_id;
  delete from public.mixer_scores where tournament_id = p_tournament_id;
  delete from public.bets where tournament_id = p_tournament_id;
  delete from public.mixer_final_snapshots where tournament_id = p_tournament_id;

  -- Presence survives a reset; the per-round court-call ack does not.
  update public.mixer_check_ins
     set acked_round_id = null
   where tournament_id = p_tournament_id;

  update public.player_event_state pes
     set tokens_base_remaining = v_cfg.starting_tokens,
         tokens_bought_remaining = coalesce(v_cfg.boost_tokens, 5) * pes.boosts_used,
         chips_remaining = v_cfg.starting_chips,
         sit_out_count = 0,
         sat_last_round = false
   where pes.tournament_id = p_tournament_id;

  update public.mixer_rounds
     set state = 'open',
         lock_at = now() + make_interval(secs => coalesce(v_cfg.lock_seconds, 86400))
   where tournament_id = p_tournament_id;

  update public.tournaments
     set status = 'active'
   where id = p_tournament_id and status = 'completed';
end;
$$;

revoke all on function public.app_mixer_reset_event(uuid) from public;
grant execute on function public.app_mixer_reset_event(uuid) to authenticated;
