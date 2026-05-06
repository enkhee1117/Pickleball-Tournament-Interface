-- Audit follow-ups.
--
-- 1. Concurrent claim race: two users hitting "I'm <name>" simultaneously
--    could both pass the profile_id NULL check and both UPDATE; last writer
--    wins silently. Added SELECT ... FOR UPDATE so the second caller blocks
--    until the first commits, then sees the new profile_id and bails.
-- 2. Bulk rename collisions: two players in one batch (or one rename + an
--    existing roster row) ending up with the same display_name produced
--    "Bob & Bob" labels. Added a post-rename uniqueness check.
-- 3. app_refresh_tournament_status: previously only required auth, so any
--    signed-in user could trigger a status update for any tournament.
--    Now silently no-ops for non-members so the parallel page-load call
--    keeps working for members and managers without leaking timing info to
--    strangers.
-- 4. Profile read leak: anyone signed in could read every profile (full
--    name, dupr_id, role, bio). Restricted to the caller's own profile
--    plus profiles that share a tournament_members entry with the caller.

set search_path = public;

-- 1a. app_claim_tournament_player with row lock.
create or replace function public.app_claim_tournament_player(
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_tournament_id uuid;
  v_existing_profile_id uuid;
begin
  -- FOR UPDATE serializes concurrent claims of the same slot.
  select tp.tournament_id, tp.profile_id
    into v_tournament_id, v_existing_profile_id
    from public.tournament_players tp
   where tp.id = p_player_id
   for update;
  if v_tournament_id is null then
    raise exception 'player not found' using errcode = '02000';
  end if;
  if v_existing_profile_id is not null and v_existing_profile_id <> uid then
    raise exception 'that player is already linked to another account' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = v_tournament_id and tm.user_id = uid
  ) then
    raise exception 'join the tournament first' using errcode = '42501';
  end if;

  update public.tournament_players
     set profile_id = null
   where tournament_id = v_tournament_id
     and profile_id = uid
     and id <> p_player_id;

  update public.tournament_players
     set profile_id = uid
   where id = p_player_id;
  return p_player_id;
end;
$$;

revoke all on function public.app_claim_tournament_player(uuid) from public;
grant execute on function public.app_claim_tournament_player(uuid) to authenticated;

-- 1b. app_claim_tournament_player_with_name with row lock + uniqueness check.
create or replace function public.app_claim_tournament_player_with_name(
  p_player_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_tournament_id uuid;
  v_existing_profile_id uuid;
  v_old_name text;
  v_new_name text := trim(coalesce(p_display_name, ''));
  v_dup_count int;
begin
  if length(v_new_name) < 2 or length(v_new_name) > 120 then
    raise exception 'display name must be 2-120 characters' using errcode = '22023';
  end if;

  -- FOR UPDATE serializes concurrent claims of the same slot.
  select tp.tournament_id, tp.profile_id, tp.display_name
    into v_tournament_id, v_existing_profile_id, v_old_name
    from public.tournament_players tp
   where tp.id = p_player_id
   for update;
  if v_tournament_id is null then
    raise exception 'player not found' using errcode = '02000';
  end if;
  if v_existing_profile_id is not null and v_existing_profile_id <> uid then
    raise exception 'that player is already linked to another account' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = v_tournament_id and tm.user_id = uid
  ) then
    raise exception 'join the tournament first' using errcode = '42501';
  end if;

  update public.tournament_players
     set profile_id = null
   where tournament_id = v_tournament_id
     and profile_id = uid
     and id <> p_player_id;

  update public.tournament_players
     set profile_id = uid,
         display_name = v_new_name
   where id = p_player_id;

  if v_old_name is distinct from v_new_name then
    update public.matches m
       set team_a_label = public.relabel_team(m.team_a_label, v_old_name, v_new_name),
           team_b_label = public.relabel_team(m.team_b_label, v_old_name, v_new_name)
     where m.tournament_id = v_tournament_id
       and (m.team_a_label like '%' || v_old_name || '%'
         or m.team_b_label like '%' || v_old_name || '%');
  end if;

  -- If the user's profile name collides with another roster row, bail.
  select count(*) into v_dup_count
    from public.tournament_players
   where tournament_id = v_tournament_id
     and display_name = v_new_name;
  if v_dup_count > 1 then
    raise exception 'another player on this roster is already named %', v_new_name
      using errcode = '23505';
  end if;

  return p_player_id;
end;
$$;

revoke all on function public.app_claim_tournament_player_with_name(uuid, text) from public;
grant execute on function public.app_claim_tournament_player_with_name(uuid, text) to authenticated;

-- 2. Bulk rename: catch collisions (within batch or against existing roster).
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
  rec record;
  v_old_name text;
  v_dup_count int;
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  if jsonb_typeof(p_renames) is distinct from 'array' then
    raise exception 'renames must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_renames) > 200 then
    raise exception 'too many renames in one request (max 200)' using errcode = '22023';
  end if;

  for rec in
    select
      (elem->>'id')::uuid as player_id,
      trim(coalesce(elem->>'display_name', '')) as new_name
    from jsonb_array_elements(p_renames) as elem
  loop
    if length(rec.new_name) between 2 and 120 then
      select display_name into v_old_name
        from public.tournament_players
       where id = rec.player_id and tournament_id = p_tournament_id
       for update;
      if v_old_name is null then continue; end if;

      update public.tournament_players
         set display_name = rec.new_name
       where id = rec.player_id
         and tournament_id = p_tournament_id;

      if v_old_name is distinct from rec.new_name then
        update public.matches m
           set team_a_label = public.relabel_team(m.team_a_label, v_old_name, rec.new_name),
               team_b_label = public.relabel_team(m.team_b_label, v_old_name, rec.new_name)
         where m.tournament_id = p_tournament_id
           and (m.team_a_label like '%' || v_old_name || '%'
             or m.team_b_label like '%' || v_old_name || '%');
      end if;
      v_count := v_count + 1;
    end if;
  end loop;

  -- Post-flight collision check: if any display_name now appears twice in
  -- the roster, the renames are ambiguous and match-label propagation
  -- would have produced "Bob & Bob" lines. Roll back.
  select count(*) into v_dup_count
    from (
      select display_name
        from public.tournament_players
       where tournament_id = p_tournament_id
       group by display_name
      having count(*) > 1
    ) dups;
  if v_dup_count > 0 then
    raise exception 'rename produced duplicate display names; pick unique names'
      using errcode = '23505';
  end if;

  return v_count;
end;
$$;

revoke all on function public.app_bulk_rename_tournament_players(uuid, jsonb) from public;
grant execute on function public.app_bulk_rename_tournament_players(uuid, jsonb) to authenticated;

-- 3. app_refresh_tournament_status: silently no-op for non-members so the
-- tournament-detail page's parallel refresh call doesn't error for
-- visitors who don't belong to the tournament.
create or replace function public.app_refresh_tournament_status(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_total int;
  v_pending int;
  v_next text;
  v_current text;
  v_is_member boolean;
begin
  select exists (
    select 1
      from public.tournaments t
     where t.id = p_tournament_id
       and t.owner_user_id = uid
  ) or exists (
    select 1
      from public.tournament_members tm
     where tm.tournament_id = p_tournament_id and tm.user_id = uid
  ) into v_is_member;
  if not v_is_member then
    return;
  end if;

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

-- 4. Profile RLS: only readable to self or to users sharing a
-- tournament_members entry with the profile owner.
drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable to self or shared tournament"
  on public.profiles for select
  using (
    id = (select auth.uid())
    or exists (
      select 1
        from public.tournament_members me
        join public.tournament_members them
          on me.tournament_id = them.tournament_id
       where me.user_id = (select auth.uid())
         and them.user_id = profiles.id
    )
  );
