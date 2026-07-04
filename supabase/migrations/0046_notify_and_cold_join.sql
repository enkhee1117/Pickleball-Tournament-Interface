-- 0046 — Player-notify chain + cold-join persistence.
--
-- Completes the infra behind two handoff storyboards:
--
--   notify.html  · the escalating "you're up" chain. Two new tables back it:
--     * push_subscriptions — Web-Push/APNs endpoints, one row per browser
--       install, so the Next.js server can fan out a lock-screen push the
--       moment the draw seats a player ("You're on Court N"). The actual
--       send happens in the drawMixerRound server action (Postgres can't
--       make outbound HTTP); this table is the address book.
--     * mixer_check_ins — the real "I'm here" state. One row per roster
--       entry. checked_in_at marks a player present at the live event
--       (drives the present-between face-wall and gates push "quiet hours"
--       so nothing fires outside an event they're checked into).
--       acked_round_id records that they acknowledged the court-call banner
--       for a given round, which silences the escalation chain.
--
--   cold-join.html · the 15-second quick profile. app_mixer_join_with_profile
--     captures name + rough skill before the first vote and persists it on
--     the anonymous session — both on the roster entry AND on the profiles
--     row keyed to the anon auth uid, so it survives an in-place account
--     upgrade (Supabase anonymous -> permanent keeps the same uid).
--
-- Blind-vote guardrail is untouched: none of this reads or exposes votes.

set search_path = public;

-- ===========================================================================
-- 1. Push subscriptions (notify touchpoint 1)
-- ===========================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

create trigger push_subscriptions_touch
  before update on public.push_subscriptions
  for each row execute function public.touch_updated_at();

alter table public.push_subscriptions enable row level security;

-- Owners can see and remove their own endpoints. Writes go through the RPC
-- below (security definer) so a re-subscribe on a device that was previously
-- another account's can re-key cleanly on the unique endpoint.
create policy "own push subscriptions readable"
  on public.push_subscriptions for select
  using (user_id = (select auth.uid()));

create policy "own push subscriptions deletable"
  on public.push_subscriptions for delete
  using (user_id = (select auth.uid()));

create or replace function public.app_save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_endpoint text := nullif(trim(coalesce(p_endpoint, '')), '');
  v_p256dh text := nullif(trim(coalesce(p_p256dh, '')), '');
  v_auth text := nullif(trim(coalesce(p_auth, '')), '');
begin
  if v_endpoint is null or v_p256dh is null or v_auth is null then
    raise exception 'incomplete push subscription' using errcode = '22023';
  end if;
  if v_endpoint !~* '^https://' then
    raise exception 'push endpoint must be https' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, v_endpoint, v_p256dh, v_auth, nullif(trim(coalesce(p_user_agent, '')), ''))
  on conflict (endpoint) do update
     set user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         updated_at = now();
end;
$$;

revoke all on function public.app_save_push_subscription(text, text, text, text) from public;
grant execute on function public.app_save_push_subscription(text, text, text, text) to authenticated;

create or replace function public.app_delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
begin
  delete from public.push_subscriptions
   where endpoint = p_endpoint and user_id = uid;
end;
$$;

revoke all on function public.app_delete_push_subscription(text) from public;
grant execute on function public.app_delete_push_subscription(text) to authenticated;

-- ===========================================================================
-- 2. Mixer check-ins (notify touchpoint 2 + present-between face-wall)
-- ===========================================================================

create table if not exists public.mixer_check_ins (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.tournament_players(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  acked_round_id uuid references public.mixer_rounds(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

create index if not exists mixer_check_ins_tournament_idx
  on public.mixer_check_ins(tournament_id);

create trigger mixer_check_ins_touch
  before update on public.mixer_check_ins
  for each row execute function public.touch_updated_at();

alter table public.mixer_check_ins enable row level security;

-- Members can read every check-in in the event (the face-wall needs the full
-- roster's presence). Writes are RPC-only, so no write policy is granted.
create policy "check-ins readable by members"
  on public.mixer_check_ins for select
  using (public.is_tournament_member(tournament_id));

-- Records the caller present at the event and, when a round is supplied,
-- acknowledges that round's court call (silences the escalation chain).
-- checked_in_at is only set on first arrival; re-acking later rounds keeps
-- the original presence timestamp.
create or replace function public.app_mixer_check_in(
  p_tournament_id uuid,
  p_round_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_player_id uuid;
begin
  select id into v_player_id
  from public.tournament_players
  where tournament_id = p_tournament_id and profile_id = uid
  limit 1;

  if v_player_id is null then
    raise exception 'not your roster entry' using errcode = '42501';
  end if;

  if p_round_id is not null then
    perform 1 from public.mixer_rounds
     where id = p_round_id and tournament_id = p_tournament_id;
    if not found then
      raise exception 'round not in this tournament' using errcode = '22023';
    end if;
  end if;

  insert into public.mixer_check_ins (tournament_id, player_id, checked_in_at, acked_round_id)
  values (p_tournament_id, v_player_id, now(), p_round_id)
  on conflict (tournament_id, player_id) do update
     set acked_round_id = coalesce(p_round_id, public.mixer_check_ins.acked_round_id),
         updated_at = now();
end;
$$;

revoke all on function public.app_mixer_check_in(uuid, uuid) from public;
grant execute on function public.app_mixer_check_in(uuid, uuid) to authenticated;

-- ===========================================================================
-- 3. Cold-join quick profile (cold-join step 3)
-- ===========================================================================

-- Same binding as app_mixer_bind_roster_entry, plus it captures the rough
-- skill (as a DUPR value) and persists name + skill onto the profiles row so
-- the 15-second profile survives an anonymous -> permanent account upgrade.
create or replace function public.app_mixer_join_with_profile(
  p_tournament_id uuid,
  p_display_name text default null,
  p_dupr numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_player_id uuid;
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_dupr numeric(3,2) := case
    when p_dupr is null then null
    else greatest(2, least(8, p_dupr))::numeric(3,2)
  end;
begin
  -- Bind (or reuse) a roster entry for this session, exactly like
  -- app_mixer_bind_roster_entry, then stamp the captured skill.
  select id into v_player_id
  from public.tournament_players
  where tournament_id = p_tournament_id and profile_id = uid
  limit 1;

  if v_player_id is null then
    select id into v_player_id
    from public.tournament_players
    where tournament_id = p_tournament_id and profile_id is null
    order by created_at
    limit 1;
  end if;

  if v_player_id is null then
    insert into public.tournament_players (tournament_id, display_name, profile_id, dupr)
    values (p_tournament_id, coalesce(v_name, 'Guest player'), uid, v_dupr)
    returning id into v_player_id;
  else
    update public.tournament_players
       set profile_id = uid,
           display_name = coalesce(v_name, display_name),
           dupr = coalesce(v_dupr, dupr)
     where id = v_player_id;
  end if;

  insert into public.tournament_members (tournament_id, user_id, role)
  values (p_tournament_id, uid, 'player')
  on conflict (tournament_id, user_id) do nothing;

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
  where tp.id = v_player_id
  on conflict (player_id) do nothing;

  -- Persist the quick profile onto the account (profiles) so it outlives the
  -- roster entry and survives an in-place account upgrade. handle_new_user
  -- already created a profiles row for the anonymous auth user.
  update public.profiles
     set display_name = coalesce(v_name, display_name),
         dupr_doubles = coalesce(v_dupr::numeric(4,3), dupr_doubles)
   where id = uid;

  return v_player_id;
end;
$$;

revoke all on function public.app_mixer_join_with_profile(uuid, text, numeric) from public;
grant execute on function public.app_mixer_join_with_profile(uuid, text, numeric) to authenticated;

-- ===========================================================================
-- 4. Realtime — the face-wall and court-call banner refresh on check-in.
-- ===========================================================================

alter publication supabase_realtime add table public.mixer_check_ins;
