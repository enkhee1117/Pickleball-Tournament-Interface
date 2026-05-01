-- Divisions per tournament + per-game scoring.
--
-- Existing tournaments keep working: division_id is nullable on
-- tournament_players and matches; null is treated as the implicit "Open"
-- division everywhere in the app.

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  format text not null default 'doubles' check (format in ('singles','doubles')),
  gender_constraint text check (gender_constraint in ('m','f','mixed','open')),
  skill_min numeric(4,2) check (skill_min is null or (skill_min between 0 and 8)),
  skill_max numeric(4,2) check (skill_max is null or (skill_max between 0 and 8)),
  age_min int check (age_min is null or (age_min between 0 and 120)),
  age_max int check (age_max is null or (age_max between 0 and 120)),
  best_of int not null default 1 check (best_of in (1,3,5)),
  target_score int not null default 11 check (target_score in (11,15,21)),
  win_by int not null default 2 check (win_by in (1,2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists divisions_tournament_id_idx on public.divisions(tournament_id);

drop trigger if exists divisions_touch on public.divisions;
create trigger divisions_touch
before update on public.divisions
for each row execute function public.touch_updated_at();

alter table public.divisions enable row level security;

drop policy if exists divisions_read on public.divisions;
create policy divisions_read on public.divisions
  for select using (public.is_tournament_member(tournament_id));

alter table public.tournament_players
  add column if not exists division_id uuid references public.divisions(id) on delete set null;

alter table public.matches
  add column if not exists division_id uuid references public.divisions(id) on delete set null;

create index if not exists tournament_players_division_idx on public.tournament_players(division_id);
create index if not exists matches_division_idx on public.matches(division_id);

create table if not exists public.match_games (
  match_id uuid not null references public.matches(id) on delete cascade,
  game_no int not null check (game_no between 1 and 5),
  team_a_score int not null check (team_a_score >= 0 and team_a_score <= 99),
  team_b_score int not null check (team_b_score >= 0 and team_b_score <= 99),
  primary key (match_id, game_no)
);

alter table public.match_games enable row level security;

drop policy if exists match_games_read on public.match_games;
create policy match_games_read on public.match_games
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and public.is_tournament_member(m.tournament_id)
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.app_create_division(
  p_tournament_id uuid,
  p_name text,
  p_format text,
  p_gender text,
  p_skill_min numeric,
  p_skill_max numeric,
  p_age_min int,
  p_age_max int,
  p_best_of int,
  p_target_score int,
  p_win_by int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_name text := trim(coalesce(p_name, ''));
  v_format text := coalesce(nullif(p_format,''), 'doubles');
  v_gender text := nullif(p_gender, '');
  v_best_of int := coalesce(p_best_of, 1);
  v_target int := coalesce(p_target_score, 11);
  v_win_by int := coalesce(p_win_by, 2);
  new_id uuid;
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  if length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'division name must be 1-80 characters' using errcode='22023';
  end if;
  if v_format not in ('singles','doubles') then
    raise exception 'format must be singles or doubles' using errcode='22023';
  end if;
  if v_gender is not null and v_gender not in ('m','f','mixed','open') then
    raise exception 'invalid gender constraint' using errcode='22023';
  end if;
  if v_best_of not in (1,3,5) then
    raise exception 'best_of must be 1, 3, or 5' using errcode='22023';
  end if;
  if v_target not in (11,15,21) then
    raise exception 'target_score must be 11, 15, or 21' using errcode='22023';
  end if;
  if v_win_by not in (1,2) then
    raise exception 'win_by must be 1 or 2' using errcode='22023';
  end if;
  if p_skill_min is not null and p_skill_max is not null and p_skill_min > p_skill_max then
    raise exception 'skill_min cannot exceed skill_max' using errcode='22023';
  end if;
  if p_age_min is not null and p_age_max is not null and p_age_min > p_age_max then
    raise exception 'age_min cannot exceed age_max' using errcode='22023';
  end if;

  insert into public.divisions (
    tournament_id, name, format, gender_constraint,
    skill_min, skill_max, age_min, age_max,
    best_of, target_score, win_by
  )
  values (
    p_tournament_id, v_name, v_format, v_gender,
    p_skill_min, p_skill_max, p_age_min, p_age_max,
    v_best_of, v_target, v_win_by
  )
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.app_delete_division(p_division_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
begin
  select tournament_id into v_tournament_id from public.divisions where id = p_division_id;
  if v_tournament_id is null then
    raise exception 'division not found' using errcode='02000';
  end if;
  perform public.app_require_tournament_manager(v_tournament_id);
  delete from public.divisions where id = p_division_id;
end;
$$;

create or replace function public.app_assign_player_division(
  p_player_id uuid,
  p_division_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_div_tournament uuid;
begin
  select tournament_id into v_tournament_id from public.tournament_players where id = p_player_id;
  if v_tournament_id is null then
    raise exception 'player not found' using errcode='02000';
  end if;
  perform public.app_require_tournament_manager(v_tournament_id);

  if p_division_id is not null then
    select tournament_id into v_div_tournament from public.divisions where id = p_division_id;
    if v_div_tournament is null or v_div_tournament <> v_tournament_id then
      raise exception 'division does not belong to that tournament' using errcode='22023';
    end if;
  end if;

  update public.tournament_players
     set division_id = p_division_id
   where id = p_player_id;
end;
$$;

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
  select m.tournament_id, m.division_id
    into v_tournament_id, v_division_id
    from public.matches m where m.id = p_match_id;
  if v_tournament_id is null then
    raise exception 'match not found' using errcode='02000';
  end if;
  perform public.app_require_tournament_manager(v_tournament_id);

  if v_division_id is not null then
    select target_score, win_by, best_of
      into v_target, v_win_by, v_best_of
      from public.divisions where id = v_division_id;
  end if;

  delete from public.match_games where match_id = p_match_id;

  if p_games is null or jsonb_typeof(p_games) is distinct from 'array' or jsonb_array_length(p_games) = 0 then
    update public.matches
       set team_a_score = null,
           team_b_score = null,
           winner_side  = null,
           completed_at = null
     where id = p_match_id;
    return;
  end if;

  v_count := jsonb_array_length(p_games);
  if v_count > 5 then
    raise exception 'too many games (max 5)' using errcode='22023';
  end if;

  for i in 0 .. v_count - 1 loop
    game_elem := p_games -> i;
    if jsonb_typeof(game_elem) <> 'array' or jsonb_array_length(game_elem) <> 2 then
      raise exception 'each game must be a [a,b] array' using errcode='22023';
    end if;
    a := (game_elem ->> 0)::int;
    b := (game_elem ->> 1)::int;
    if a is null or b is null or a < 0 or b < 0 or a > 99 or b > 99 then
      raise exception 'scores must be integers 0-99' using errcode='22023';
    end if;
    insert into public.match_games(match_id, game_no, team_a_score, team_b_score)
    values (p_match_id, i + 1, a, b);

    if (a >= v_target or b >= v_target) and abs(a - b) >= v_win_by then
      if a > b then
        v_games_a := v_games_a + 1;
      else
        v_games_b := v_games_b + 1;
      end if;
    end if;
    v_total_a := v_total_a + a;
    v_total_b := v_total_b + b;
  end loop;

  if v_games_a > v_best_of / 2 then
    v_winner := 'a';
    v_completed := now();
  elsif v_games_b > v_best_of / 2 then
    v_winner := 'b';
    v_completed := now();
  end if;

  update public.matches
     set team_a_score = v_total_a,
         team_b_score = v_total_b,
         winner_side  = v_winner,
         completed_at = v_completed
   where id = p_match_id;
end;
$$;

revoke all on function public.app_create_division(uuid, text, text, text, numeric, numeric, int, int, int, int, int) from public;
grant execute on function public.app_create_division(uuid, text, text, text, numeric, numeric, int, int, int, int, int) to authenticated;

revoke all on function public.app_delete_division(uuid) from public;
grant execute on function public.app_delete_division(uuid) to authenticated;

revoke all on function public.app_assign_player_division(uuid, uuid) from public;
grant execute on function public.app_assign_player_division(uuid, uuid) to authenticated;

revoke all on function public.app_score_match_v2(uuid, jsonb) from public;
grant execute on function public.app_score_match_v2(uuid, jsonb) to authenticated;
