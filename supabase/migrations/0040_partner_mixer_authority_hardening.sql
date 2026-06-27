-- Partner Mixer authority hardening.
-- Keep vote/bet/payment mutations behind SECURITY DEFINER RPCs and validate
-- tournament boundaries inside those RPCs.

set search_path = public;

drop policy if exists "own votes writable" on public.mixer_votes;
drop policy if exists "own votes updatable" on public.mixer_votes;
drop policy if exists "own bets writable" on public.bets;
drop policy if exists "own bets updatable" on public.bets;
drop policy if exists "own payments insertable" on public.payments;

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
  if v_round.state <> 'open' then
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
