-- The link RPC sets profile_id on a roster row but the existing
-- BEFORE-INSERT trigger that auto-creates tournament_members only fires
-- on INSERT. Linking via UPDATE leaves the picked user with a roster
-- slot but no tournament_members row, so the tournament doesn't show
-- up on their /tournaments dashboard.
--
-- Re-issue app_link_tournament_player_to_profile to also upsert into
-- tournament_members. Idempotent — ON CONFLICT DO NOTHING keeps
-- repeated calls cheap.

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

  -- Mirror the BEFORE-INSERT trigger so a linked user actually shows up
  -- on their dashboard. The (tournament_id, user_id) primary key on
  -- tournament_members makes this safely idempotent.
  insert into public.tournament_members (tournament_id, user_id, role)
  values (v_tournament_id, p_profile_id, 'player')
  on conflict (tournament_id, user_id) do nothing;
end;
$$;

revoke all on function public.app_link_tournament_player_to_profile(uuid, uuid) from public;
grant execute on function public.app_link_tournament_player_to_profile(uuid, uuid) to authenticated;
