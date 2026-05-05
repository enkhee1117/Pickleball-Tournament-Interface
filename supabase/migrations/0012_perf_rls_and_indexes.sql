-- Performance fixes flagged by the Supabase advisor + the slow paths the app
-- hits in real life:
--
--  * RLS policies re-evaluating auth.uid() per row → wrap in (select auth.uid()).
--  * Drop the duplicate permissive read policies on tournament_players and
--    matches that the manager-policy already covers.
--  * Add (tournament_id, completed_at) index for the "pending matches" filter
--    used by refreshTournamentStatus + the regenerate flow.
--  * Replace the 3-roundtrip refreshTournamentStatus with a single RPC.
--  * Add a bulk-rename RPC so the wizard doesn't fire N sequential RPC calls
--    when the organizer types player names.

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. RLS auth.uid() → (select auth.uid()) optimizations
-- ---------------------------------------------------------------------------

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users"
  on public.profiles for select
  using ((select auth.uid()) is not null);

drop policy if exists "messages readable by signed-in users" on public.messages;
create policy "messages readable by signed-in users"
  on public.messages for select
  using ((select auth.uid()) is not null);

drop policy if exists "users post their own messages" on public.messages;
create policy "users post their own messages"
  on public.messages for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "users delete their own messages" on public.messages;
create policy "users delete their own messages"
  on public.messages for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "staff can create invites" on public.invites;
create policy "staff can create invites"
  on public.invites for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'organizer')
    )
  );

drop policy if exists "owners update tournaments" on public.tournaments;
create policy "owners update tournaments"
  on public.tournaments for update
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "owners delete tournaments" on public.tournaments;
create policy "owners delete tournaments"
  on public.tournaments for delete
  using (owner_user_id = (select auth.uid()));

drop policy if exists "authenticated users create own tournaments" on public.tournaments;
create policy "authenticated users create own tournaments"
  on public.tournaments for insert
  with check ((select auth.uid()) is not null and owner_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Collapse duplicate permissive policies on tournament_players + matches.
-- The "managers can manage..." policies already grant SELECT to managers; the
-- "readable by tournament members" policies already grant SELECT to members.
-- The "users read their own" policy is redundant once the member policy exists,
-- so drop it.
-- ---------------------------------------------------------------------------

drop policy if exists "users read their own tournament_players" on public.tournament_players;

-- The "managers can manage matches" FOR ALL policy implies SELECT permission
-- on every match a manager can see. Members get SELECT via "matches readable
-- by tournament members". Splitting management into write-only avoids the
-- duplicate permissive SELECT.
drop policy if exists "managers can manage matches" on public.matches;
create policy "managers can insert matches"
  on public.matches for insert
  with check (public.is_tournament_manager(tournament_id));
create policy "managers can update matches"
  on public.matches for update
  using (public.is_tournament_manager(tournament_id))
  with check (public.is_tournament_manager(tournament_id));
create policy "managers can delete matches"
  on public.matches for delete
  using (public.is_tournament_manager(tournament_id));

drop policy if exists "managers can manage tournament players" on public.tournament_players;
create policy "managers can insert tournament players"
  on public.tournament_players for insert
  with check (public.is_tournament_manager(tournament_id));
create policy "managers can update tournament players"
  on public.tournament_players for update
  using (public.is_tournament_manager(tournament_id))
  with check (public.is_tournament_manager(tournament_id));
create policy "managers can delete tournament players"
  on public.tournament_players for delete
  using (public.is_tournament_manager(tournament_id));

-- ---------------------------------------------------------------------------
-- 3. Index for pending-match filter
-- ---------------------------------------------------------------------------

create index if not exists matches_tournament_completed_idx
  on public.matches(tournament_id, completed_at);

-- ---------------------------------------------------------------------------
-- 4. Single-roundtrip refresh_tournament_status RPC
-- ---------------------------------------------------------------------------
create or replace function public.app_refresh_tournament_status(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_pending int;
  v_next text;
  v_current text;
begin
  perform public.app_require_auth();

  select count(*) filter (where true),
         count(*) filter (where completed_at is null)
    into v_total, v_pending
    from public.matches
   where tournament_id = p_tournament_id;

  if v_total = 0 then v_next := 'draft';
  elsif v_pending = 0 then v_next := 'completed';
  else v_next := 'active';
  end if;

  select status into v_current from public.tournaments where id = p_tournament_id;
  if v_current is null or v_current = v_next then return; end if;

  update public.tournaments set status = v_next where id = p_tournament_id;
end;
$$;

revoke all on function public.app_refresh_tournament_status(uuid) from public;
grant execute on function public.app_refresh_tournament_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Bulk rename RPC so the wizard's "Type names now" path takes one round
-- trip instead of N. Accepts a JSON array of {id, display_name} objects.
-- ---------------------------------------------------------------------------
create or replace function public.app_bulk_rename_tournament_players(
  p_tournament_id uuid,
  p_renames jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  if jsonb_typeof(p_renames) is distinct from 'array' then
    raise exception 'renames must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_renames) > 200 then
    raise exception 'too many renames in one request (max 200)' using errcode = '22023';
  end if;

  with renames as (
    select
      (elem->>'id')::uuid as player_id,
      trim(coalesce(elem->>'display_name', '')) as display_name
    from jsonb_array_elements(p_renames) as elem
  )
  update public.tournament_players tp
     set display_name = r.display_name
    from renames r
   where tp.id = r.player_id
     and tp.tournament_id = p_tournament_id
     and length(r.display_name) between 2 and 120;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.app_bulk_rename_tournament_players(uuid, jsonb) from public;
grant execute on function public.app_bulk_rename_tournament_players(uuid, jsonb) to authenticated;
