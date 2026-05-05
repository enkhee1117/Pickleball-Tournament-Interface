-- Claim-and-rename in one transaction.
--
-- Reported behavior: when a player claims a roster slot from the invite page
-- or the match-screen, their profile display name should immediately replace
-- the placeholder ("Player 1") on every match label across the tournament.
-- The previous app_claim_tournament_player only set profile_id; renaming
-- still required a separate RPC call by the client.
--
-- This wraps both into a single SECURITY DEFINER call so the claim is atomic
-- and the match labels stay in sync for everyone watching.

set search_path = public;

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

  return p_player_id;
end;
$$;

revoke all on function public.app_claim_tournament_player_with_name(uuid, text) from public;
grant execute on function public.app_claim_tournament_player_with_name(uuid, text) to authenticated;
