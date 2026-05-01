-- app_replace_pending_matches now scopes wipe + insert to a division.
-- Pre-existing matches with division_id is null still work: passing
-- p_division_id = null operates on the implicit "Open" division.

drop function if exists public.app_replace_pending_matches(uuid, jsonb);

create or replace function public.app_replace_pending_matches(
  p_tournament_id uuid,
  p_division_id uuid,
  p_matches jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  v_count int := 0;
  v_div_tournament uuid;
begin
  uid := public.app_require_auth();
  perform public.app_require_tournament_manager(p_tournament_id);

  if p_division_id is not null then
    select tournament_id into v_div_tournament from public.divisions where id = p_division_id;
    if v_div_tournament is null or v_div_tournament <> p_tournament_id then
      raise exception 'division does not belong to that tournament' using errcode='22023';
    end if;
  end if;

  if jsonb_typeof(p_matches) is distinct from 'array' then
    raise exception 'matches must be a JSON array' using errcode='22023';
  end if;
  if jsonb_array_length(p_matches) = 0 then
    raise exception 'no matches to insert' using errcode='22023';
  end if;
  if jsonb_array_length(p_matches) > 500 then
    raise exception 'too many matches in one request (max 500)' using errcode='22023';
  end if;

  delete from public.matches m
   where m.tournament_id = p_tournament_id
     and m.division_id is not distinct from p_division_id
     and m.team_a_score is null
     and m.team_b_score is null;

  insert into public.matches (
    tournament_id, division_id, round_label, court_label,
    team_a_label, team_b_label, created_by_user_id
  )
  select
    p_tournament_id,
    p_division_id,
    coalesce(nullif(trim(elem->>'round_label'),''), 'Round'),
    coalesce(nullif(trim(elem->>'court_label'),''), 'Court'),
    nullif(trim(elem->>'team_a_label'),''),
    nullif(trim(elem->>'team_b_label'),''),
    uid
  from jsonb_array_elements(p_matches) as elem
  where nullif(trim(elem->>'team_a_label'),'') is not null
    and nullif(trim(elem->>'team_b_label'),'') is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.app_replace_pending_matches(uuid, uuid, jsonb) from public;
grant execute on function public.app_replace_pending_matches(uuid, uuid, jsonb) to authenticated;
