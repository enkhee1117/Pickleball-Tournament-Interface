-- 0050 — Batch ballot writes, per-round confirmation, and token re-grant.
--
-- Why:
--   * The player ballot wrote one vote per token tap (app_mixer_set_vote),
--     each tap a round-trip + full-page revalidate. This adds a single
--     atomic "set the whole ballot for this round" RPC so the client can
--     track tokens locally and flush the entire round in one call.
--   * There was no way for a player to signal "I'm done" — mixer_round_ballots
--     records a per-round confirmation so the flow has closure (and organizers
--     can later see readiness).
--   * Bug: raising event_config.starting_tokens never re-granted tokens to
--     existing players, so player_event_state.tokens_base_remaining lagged the
--     config. The UI then showed a budget the DB refused to honor. Prior
--     migrations only recompute per-write, never top up on a config change.
--     app_mixer_regrant_base_tokens reconciles the invariant
--     (tokens_base_remaining = starting_tokens − base tokens already spent).

-- ---------------------------------------------------------------------------
-- 1. Per-round ballot confirmation
-- ---------------------------------------------------------------------------
create table if not exists public.mixer_round_ballots (
  round_id uuid not null references public.mixer_rounds(id) on delete cascade,
  player_id uuid not null references public.tournament_players(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

create index if not exists mixer_round_ballots_tournament_idx
  on public.mixer_round_ballots(tournament_id);

drop trigger if exists mixer_round_ballots_touch on public.mixer_round_ballots;
create trigger mixer_round_ballots_touch
  before update on public.mixer_round_ballots
  for each row execute function public.touch_updated_at();

alter table public.mixer_round_ballots enable row level security;

-- Readable by members (organizers see who has locked in; a player's own row
-- drives their "ballot locked" UI). Confirmation is a readiness signal, never
-- the picks themselves, so this leaks nothing about the blind vote. Writes are
-- RPC-only, so no write policy is granted.
drop policy if exists "round ballots readable by members" on public.mixer_round_ballots;
create policy "round ballots readable by members"
  on public.mixer_round_ballots for select
  using (public.is_tournament_member(tournament_id));

-- ---------------------------------------------------------------------------
-- 2. app_mixer_set_ballot — atomic "set my whole ballot for this round"
-- ---------------------------------------------------------------------------
-- Replaces N per-target app_mixer_set_vote calls with one. Reconciles the
-- round from scratch: refunds everything this voter previously reserved in the
-- round, validates + re-spends the new ballot (base tokens first, then bought),
-- and rewrites the round's vote rows. Idempotent — safe to call on every
-- debounced auto-save. p_confirmed: true locks the ballot in, false reopens it,
-- null leaves the confirmation state untouched (a plain auto-save).
create or replace function public.app_mixer_set_ballot(
  p_round_id uuid,
  p_voter_player_id uuid,
  p_ballot jsonb,
  p_confirmed boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.mixer_rounds%rowtype;
  v_cfg public.event_config%rowtype;
  v_upvote_cap int;
  v_base_remaining int;
  v_bought_remaining int;
  v_prev_base int;
  v_prev_bought int;
  v_available int;
  v_new_total int := 0;
  v_item jsonb;
  v_target uuid;
  v_up int;
  v_down int;
  v_consume_base int;
  v_consume_bought int;
  v_vote_total int;
  v_take_base int;
  v_take_bought int;
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

  select * into v_cfg from public.event_config where tournament_id = v_round.tournament_id;
  v_upvote_cap := coalesce(v_cfg.upvote_cap_per_target, 3);

  perform 1 from public.tournament_players
   where id = p_voter_player_id and tournament_id = v_round.tournament_id;
  if not found then
    raise exception 'voter is not in this tournament' using errcode = '22023';
  end if;

  select tokens_base_remaining, tokens_bought_remaining
    into v_base_remaining, v_bought_remaining
  from public.player_event_state
  where player_id = p_voter_player_id
  for update;
  if not found then
    raise exception 'player event state not found' using errcode = '02000';
  end if;

  -- What this voter has already reserved in THIS round (to refund first).
  select coalesce(sum(base_tokens_spent), 0), coalesce(sum(bought_tokens_spent), 0)
    into v_prev_base, v_prev_bought
  from public.mixer_votes
  where round_id = p_round_id and voter_player_id = p_voter_player_id;

  -- Budget available for this round = wallet + what this round already holds.
  v_available := v_base_remaining + v_bought_remaining + v_prev_base + v_prev_bought;

  -- Validate every ballot item and tally the new round total.
  for v_item in select * from jsonb_array_elements(coalesce(p_ballot, '[]'::jsonb))
  loop
    v_target := nullif(v_item->>'target_player_id', '')::uuid;
    v_up := greatest(0, coalesce((v_item->>'up_tokens')::int, 0));
    v_down := greatest(0, coalesce((v_item->>'down_tokens')::int, 0));
    if v_target is null or (v_up = 0 and v_down = 0) then
      continue;
    end if;
    if v_target = p_voter_player_id then
      raise exception 'cannot vote for yourself' using errcode = '22023';
    end if;
    if v_up > 0 and v_down > 0 then
      raise exception 'a vote is either up or down, not both' using errcode = '22023';
    end if;
    if v_down > 0 and not coalesce(v_cfg.downvotes_enabled, true) then
      raise exception 'downvotes are disabled' using errcode = '22023';
    end if;
    if v_up > v_upvote_cap then
      raise exception 'upvote cap exceeded' using errcode = '22023';
    end if;
    perform 1 from public.tournament_players
     where id = v_target and tournament_id = v_round.tournament_id;
    if not found then
      raise exception 'target is not in this tournament' using errcode = '22023';
    end if;
    v_new_total := v_new_total + v_up + v_down;
  end loop;

  if v_new_total > v_available then
    raise exception 'not enough tokens' using errcode = '22023';
  end if;

  -- Refund this round's prior reservation back to the wallet, then re-spend the
  -- new total base-first. Net effect on the wallet is a single consistent move.
  v_base_remaining := v_base_remaining + v_prev_base;
  v_bought_remaining := v_bought_remaining + v_prev_bought;
  v_consume_base := least(v_new_total, v_base_remaining);
  v_consume_bought := v_new_total - v_consume_base;

  update public.player_event_state
     set tokens_base_remaining = v_base_remaining - v_consume_base,
         tokens_bought_remaining = v_bought_remaining - v_consume_bought
   where player_id = p_voter_player_id;

  -- Rewrite the round's votes from the ballot. The per-vote base/bought split
  -- only feeds refund accounting (app_mixer_reset_round_votes sums it), so a
  -- greedy base-first allocation across votes is faithful.
  delete from public.mixer_votes
   where round_id = p_round_id and voter_player_id = p_voter_player_id;

  v_take_base := v_consume_base;   -- base tokens left to hand out across votes
  v_take_bought := v_consume_bought;
  for v_item in select * from jsonb_array_elements(coalesce(p_ballot, '[]'::jsonb))
  loop
    v_target := nullif(v_item->>'target_player_id', '')::uuid;
    v_up := greatest(0, coalesce((v_item->>'up_tokens')::int, 0));
    v_down := greatest(0, coalesce((v_item->>'down_tokens')::int, 0));
    if v_target is null or (v_up = 0 and v_down = 0) then
      continue;
    end if;
    v_vote_total := v_up + v_down;
    v_consume_base := least(v_vote_total, v_take_base);
    v_consume_bought := v_vote_total - v_consume_base;
    v_take_base := v_take_base - v_consume_base;
    v_take_bought := v_take_bought - v_consume_bought;

    insert into public.mixer_votes (
      round_id, tournament_id, voter_player_id, target_player_id, up_tokens, down_tokens,
      base_tokens_spent, bought_tokens_spent
    )
    values (
      p_round_id, v_round.tournament_id, p_voter_player_id, v_target, v_up, v_down,
      v_consume_base, v_consume_bought
    );
  end loop;

  -- Confirmation is a separate signal from the votes themselves.
  if p_confirmed is not null then
    insert into public.mixer_round_ballots (round_id, player_id, tournament_id, confirmed_at)
    values (
      p_round_id, p_voter_player_id, v_round.tournament_id,
      case when p_confirmed then now() else null end
    )
    on conflict (round_id, player_id) do update
       set confirmed_at = case when p_confirmed then now() else null end,
           updated_at = now();
  end if;
end;
$$;

revoke all on function public.app_mixer_set_ballot(uuid, uuid, jsonb, boolean) from public;
grant execute on function public.app_mixer_set_ballot(uuid, uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. app_mixer_regrant_base_tokens — reconcile the token invariant
-- ---------------------------------------------------------------------------
-- Sets every player's tokens_base_remaining to (starting_tokens − base tokens
-- already spent), clamped at 0. Fixes events where starting_tokens was raised
-- after players were seeded (the config said 100, the wallet still said 10).
-- Idempotent: with unchanged config + votes it recomputes the same value.
-- Bought (boost) tokens are a separate ledger and left untouched.
create or replace function public.app_mixer_regrant_base_tokens(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starting int;
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  select starting_tokens into v_starting
  from public.event_config
  where tournament_id = p_tournament_id;
  if v_starting is null then
    raise exception 'mixer config not found' using errcode = '02000';
  end if;

  update public.player_event_state pes
     set tokens_base_remaining = greatest(
           0,
           v_starting - coalesce((
             select sum(mv.base_tokens_spent)
             from public.mixer_votes mv
             where mv.voter_player_id = pes.player_id
           ), 0)
         )
   where pes.tournament_id = p_tournament_id;
end;
$$;

revoke all on function public.app_mixer_regrant_base_tokens(uuid) from public;
grant execute on function public.app_mixer_regrant_base_tokens(uuid) to authenticated;

-- Surface confirmation readiness live (organizer view can subscribe later).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mixer_round_ballots'
  ) then
    alter publication supabase_realtime add table public.mixer_round_ballots;
  end if;
end;
$$;
