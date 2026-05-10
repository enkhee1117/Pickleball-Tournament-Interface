-- The link RPC stamped profile_id but never copied other useful columns
-- from the profile. So a typeahead pick of a registered user with
-- profile.gender = 'f' produced a roster row with gender = null — and
-- mixed-doubles generation refused to start until the manager re-tagged
-- every linked player by hand.
--
-- Re-issue app_link_tournament_player_to_profile to also fill gender
-- (and DUPR, when the row doesn't already have one). Existing rows that
-- already have a gender / dupr are left alone — manager-set values win.
--
-- Also re-issue handle_new_user / app_claim_tournament_player_with_name
-- to do the same fill-from-profile when a user claims their slot, so
-- self-claim doesn't leave the row ungendered either.

set search_path = public;

create or replace function public.app_link_tournament_player_to_profile(
  p_player_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
begin
  if p_profile_id is null then
    raise exception 'profile_id required' using errcode = '22023';
  end if;

  select tp.tournament_id into v_tournament_id
    from public.tournament_players tp
   where tp.id = p_player_id;
  if v_tournament_id is null then
    raise exception 'player not found' using errcode = '02000';
  end if;

  perform public.app_require_tournament_manager(v_tournament_id);

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'profile not found' using errcode = '02000';
  end if;

  -- Stamp profile_id, plus fill gender / dupr from the profile when the
  -- row doesn't already have them. We never overwrite a value the manager
  -- explicitly set on the roster row.
  update public.tournament_players tp
     set profile_id = p_profile_id,
         gender = case
           when tp.gender is null then p.gender
           else tp.gender
         end,
         dupr = case
           when tp.dupr is null then coalesce(p.dupr_doubles, p.dupr_singles)
           else tp.dupr
         end
    from public.profiles p
   where tp.id = p_player_id
     and p.id = p_profile_id;

  -- Mirror the BEFORE-INSERT trigger so a linked user actually shows up
  -- on their dashboard.
  insert into public.tournament_members (tournament_id, user_id, role)
  values (v_tournament_id, p_profile_id, 'player')
  on conflict (tournament_id, user_id) do nothing;
end;
$$;

revoke all on function public.app_link_tournament_player_to_profile(uuid, uuid) from public;
grant execute on function public.app_link_tournament_player_to_profile(uuid, uuid) to authenticated;

-- Same fill-from-profile pass for self-claim so "This is me" doesn't
-- leave the row ungendered either.
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
begin
  if length(v_new_name) < 2 or length(v_new_name) > 120 then
    raise exception 'display name must be 2-120 characters' using errcode = '22023';
  end if;

  select tp.tournament_id, tp.profile_id, tp.display_name
    into v_tournament_id, v_existing_profile_id, v_old_name
    from public.tournament_players tp
   where tp.id = p_player_id;
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

  -- One claim per user per tournament: detach any prior claim.
  update public.tournament_players
     set profile_id = null
   where tournament_id = v_tournament_id
     and profile_id = uid
     and id <> p_player_id;

  update public.tournament_players tp
     set profile_id = uid,
         display_name = v_new_name,
         gender = case when tp.gender is null then p.gender else tp.gender end,
         dupr = case
           when tp.dupr is null then coalesce(p.dupr_doubles, p.dupr_singles)
           else tp.dupr
         end
    from public.profiles p
   where tp.id = p_player_id
     and p.id = uid;

  if v_old_name is distinct from v_new_name then
    update public.matches m
       set team_a_label = public.relabel_team(m.team_a_label, v_old_name, v_new_name),
           team_b_label = public.relabel_team(m.team_b_label, v_old_name, v_new_name)
     where m.tournament_id = v_tournament_id
       and (m.team_a_label like '%' || v_old_name || '%'
         or m.team_b_label like '%' || v_old_name || '%');
  end if;

  return p_player_id;
end;
$$;

revoke all on function public.app_claim_tournament_player_with_name(uuid, text) from public;
grant execute on function public.app_claim_tournament_player_with_name(uuid, text) to authenticated;
