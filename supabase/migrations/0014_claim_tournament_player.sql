-- Let a signed-in tournament member claim a placeholder player slot so
-- their match history can be aggregated on the stats page.
--
-- The trigger that auto-links by email only fires when an existing invite
-- email matches a fresh signup; rosters seeded via the wizard land as
-- placeholders with no email. This RPC lets the user say "that's me" for
-- one of those rows.

set search_path = public;

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
  select tp.tournament_id, tp.profile_id
    into v_tournament_id, v_existing_profile_id
    from public.tournament_players tp
   where tp.id = p_player_id;
  if v_tournament_id is null then
    raise exception 'player not found' using errcode = '02000';
  end if;
  if v_existing_profile_id is not null and v_existing_profile_id <> uid then
    raise exception 'that player is already linked to another account' using errcode = '42501';
  end if;

  -- Caller must be a member of this tournament. Owners/organizers/players
  -- can all claim a slot for themselves.
  if not exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = v_tournament_id and tm.user_id = uid
  ) then
    raise exception 'join the tournament first' using errcode = '42501';
  end if;

  -- A user can only claim one player per tournament. Detach any prior claim.
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
