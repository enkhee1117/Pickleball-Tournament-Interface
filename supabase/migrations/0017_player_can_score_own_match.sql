-- Allow a player linked to a match to score it themselves.
--
-- Previously app_score_match_v2 required app_require_tournament_manager,
-- so an invited player who tapped End hit "You don't have permission to do
-- that." even though the keypad UI suggested they could. Loosen the score
-- gate to: manager OR a tournament_player whose display_name appears in
-- this match's team labels and whose profile_id matches the caller.

set search_path = public;

create or replace function public.app_require_match_scorer(p_match_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_tournament_id uuid;
  v_team_a text;
  v_team_b text;
  v_my_name text;
begin
  select tournament_id, team_a_label, team_b_label
    into v_tournament_id, v_team_a, v_team_b
    from public.matches where id = p_match_id;
  if v_tournament_id is null then
    raise exception 'match not found' using errcode = '02000';
  end if;

  -- Manager fast-path.
  if public.is_tournament_manager(v_tournament_id) then
    return v_tournament_id;
  end if;

  -- Linked player whose name appears in either team label.
  select tp.display_name into v_my_name
    from public.tournament_players tp
   where tp.tournament_id = v_tournament_id
     and tp.profile_id = uid
   limit 1;
  if v_my_name is not null then
    if v_my_name = any(regexp_split_to_array(v_team_a, '\s*&\s*|\s*/\s*'))
       or v_my_name = any(regexp_split_to_array(v_team_b, '\s*&\s*|\s*/\s*')) then
      return v_tournament_id;
    end if;
  end if;

  raise exception 'only the organizer or a player in this match can score it'
    using errcode = '42501';
end;
$$;

revoke all on function public.app_require_match_scorer(uuid) from public;
grant execute on function public.app_require_match_scorer(uuid) to authenticated;

-- Recreate app_score_match_v2 to use the new scorer check. Body is otherwise
-- identical to the version in 0007.
create or replace function public.app_score_match_v2(
  p_match_id uuid,
  p_games jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_division_id uuid;
  v_target int := 11;
  v_win_by int := 2;
  v_best_of int := 1;
  v_count int := 0;
  v_games_a int := 0;
  v_games_b int := 0;
  v_total_a int := 0;
  v_total_b int := 0;
  v_winner text := null;
  v_completed timestamptz := null;
  i int;
  game_elem jsonb;
  a int;
  b int;
begin
  v_tournament_id := public.app_require_match_scorer(p_match_id);

  select m.division_id into v_division_id from public.matches m where m.id = p_match_id;

  if v_division_id is not null then
    select target_score, win_by, best_of
      into v_target, v_win_by, v_best_of
      from public.divisions where id = v_division_id;
  end if;

  if jsonb_typeof(p_games) is distinct from 'array' then
    raise exception 'games must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_games) > 5 then
    raise exception 'too many games' using errcode = '22023';
  end if;

  delete from public.match_games where match_id = p_match_id;

  for i in 0..(jsonb_array_length(p_games) - 1) loop
    game_elem := p_games -> i;
    if jsonb_typeof(game_elem) is distinct from 'array'
       or jsonb_array_length(game_elem) <> 2 then
      raise exception 'each game must be [a, b]' using errcode = '22023';
    end if;
    a := (game_elem ->> 0)::int;
    b := (game_elem ->> 1)::int;
    if a < 0 or b < 0 or a > 99 or b > 99 then
      raise exception 'score out of range' using errcode = '22023';
    end if;
    insert into public.match_games(match_id, game_no, team_a_score, team_b_score)
      values (p_match_id, i + 1, a, b);
    v_count := v_count + 1;
    v_total_a := v_total_a + a;
    v_total_b := v_total_b + b;
    if (a >= v_target or b >= v_target) and abs(a - b) >= v_win_by then
      if a > b then v_games_a := v_games_a + 1; else v_games_b := v_games_b + 1; end if;
    end if;
  end loop;

  if v_games_a > v_games_b and v_games_a >= (v_best_of / 2) + 1 then
    v_winner := 'a';
    v_completed := now();
  elsif v_games_b > v_games_a and v_games_b >= (v_best_of / 2) + 1 then
    v_winner := 'b';
    v_completed := now();
  end if;

  update public.matches
     set team_a_score = v_total_a,
         team_b_score = v_total_b,
         winner_side = v_winner,
         completed_at = v_completed
   where id = p_match_id;
end;
$$;

revoke all on function public.app_score_match_v2(uuid, jsonb) from public;
grant execute on function public.app_score_match_v2(uuid, jsonb) to authenticated;
