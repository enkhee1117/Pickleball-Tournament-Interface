-- Public read-only tournament view for invite links.
--
-- Anyone with a valid 6-character invite code can fetch the tournament's
-- name, status, roster, and scored matches via a single RPC. This lets the
-- /t/[code] route render a scoreboard preview before the visitor signs in.
-- The function is SECURITY DEFINER + granted to anon so it works without a
-- session; it returns NULL when the code doesn't resolve so the route can
-- show a friendly "tournament not found" page.

set search_path = public;

create or replace function public.app_get_public_tournament_by_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_tournament_id uuid;
  v_tournament jsonb;
  v_players jsonb;
  v_matches jsonb;
begin
  if length(v_code) <> 6 then
    return null;
  end if;

  select id into v_tournament_id from public.tournaments where invite_code = v_code;
  if v_tournament_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'format', t.format,
    'status', t.status,
    'invite_code', t.invite_code,
    'created_at', t.created_at
  )
  into v_tournament
  from public.tournaments t
  where t.id = v_tournament_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', tp.id, 'display_name', tp.display_name)
              order by tp.created_at),
    '[]'::jsonb
  )
  into v_players
  from public.tournament_players tp
  where tp.tournament_id = v_tournament_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'round_label', m.round_label,
        'court_label', m.court_label,
        'team_a_label', m.team_a_label,
        'team_b_label', m.team_b_label,
        'team_a_score', m.team_a_score,
        'team_b_score', m.team_b_score,
        'winner_side', m.winner_side,
        'completed_at', m.completed_at,
        'match_games', (
          select coalesce(
            jsonb_agg(jsonb_build_object(
              'team_a_score', mg.team_a_score,
              'team_b_score', mg.team_b_score
            ) order by mg.game_no),
            '[]'::jsonb
          )
          from public.match_games mg
          where mg.match_id = m.id
        )
      ) order by m.created_at
    ),
    '[]'::jsonb
  )
  into v_matches
  from public.matches m
  where m.tournament_id = v_tournament_id;

  return jsonb_build_object(
    'tournament', v_tournament,
    'players', v_players,
    'matches', v_matches
  );
end;
$$;

revoke all on function public.app_get_public_tournament_by_code(text) from public;
grant execute on function public.app_get_public_tournament_by_code(text) to anon, authenticated;
