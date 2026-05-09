-- Manager-driven profile linking for tournament_players.
--
-- When the AddPlayerForm or new-tournament wizard's typeahead picks a
-- registered profile, the app already knows the profile_id. The existing
-- app_add_tournament_player / app_update_tournament_player functions only
-- resolve profile_id by phone match — so picking a profile that has no
-- phone (or whose phone normalization differs) leaves the row unlinked,
-- and the UI keeps showing PENDING / PLACEHOLDER even though the manager
-- explicitly chose a real user.
--
-- This migration adds a small dedicated RPC that lets a tournament manager
-- stamp a roster row with an explicit profile_id, after the regular add/
-- update has run. The (tournament_id, profile_id) partial unique index
-- still prevents the same profile from being linked twice.

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

  update public.tournament_players
     set profile_id = p_profile_id
   where id = p_player_id;
end;
$$;

revoke all on function public.app_link_tournament_player_to_profile(uuid, uuid) from public;
grant execute on function public.app_link_tournament_player_to_profile(uuid, uuid) to authenticated;
