-- Self-unclaim: the user who's currently linked to a tournament_players
-- row can release that link. Useful when someone clicks "This is me" on
-- the wrong row by mistake — currently their only recovery is to find
-- another row to claim, which auto-shifts the link, but if they don't
-- know which row is theirs they're stuck.
--
-- Strict: only the user currently linked can unclaim themselves. Managers
-- can keep using the existing edit-then-clear workflow on tournament_players.
set search_path = public;

create or replace function public.app_unclaim_self_from_player(
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_existing uuid;
begin
  select profile_id into v_existing
    from public.tournament_players
   where id = p_player_id;
  if v_existing is null then
    raise exception 'no claim to release' using errcode = '02000';
  end if;
  if v_existing <> uid then
    raise exception 'not your claim to release' using errcode = '42501';
  end if;

  update public.tournament_players
     set profile_id = null
   where id = p_player_id
     and profile_id = uid;
end;
$$;

revoke all on function public.app_unclaim_self_from_player(uuid) from public;
grant execute on function public.app_unclaim_self_from_player(uuid) to authenticated;
