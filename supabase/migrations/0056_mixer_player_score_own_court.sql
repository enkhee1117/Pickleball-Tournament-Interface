-- 0056 — Let players post the score for the game they're playing.
--
-- Until now only the organizer could enter scores (app_mixer_score_court is
-- manager-gated). The design puts score entry courtside on the player's own
-- Match screen (ux-score.html), so this adds a participant-scoped path:
-- app_mixer_player_score_court lets a player post the score for the (court,
-- wave) they are actually seated on, while the round is in play. The organizer
-- keeps their own override via app_mixer_score_court.
--
-- Guardrails:
--   * caller must be a roster player ON that game slot this round;
--   * the round must be revealed/playing — once the organizer marks the round
--     'done' the score locks (players can still fix a fat-fingered score up to
--     that point; the organizer's manager RPC can override afterward).
-- Nothing here touches votes, so the blind-vote guardrail is unaffected.

set search_path = public;

create or replace function public.app_mixer_player_score_court(
  p_round_id uuid,
  p_court_no int,
  p_team_a_score int,
  p_team_b_score int,
  p_wave_no int default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_tournament_id uuid;
  v_state text;
  v_my_player uuid;
  v_court int := greatest(1, p_court_no);
  v_wave int := greatest(1, p_wave_no);
begin
  select tournament_id, state into v_tournament_id, v_state
  from public.mixer_rounds where id = p_round_id;
  if v_tournament_id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;

  select id into v_my_player
  from public.tournament_players
  where tournament_id = v_tournament_id and profile_id = uid
  limit 1;
  if v_my_player is null then
    raise exception 'only a player in this event can post a score' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.mixer_pairings mp
    where mp.round_id = p_round_id
      and mp.court_no = v_court
      and mp.wave_no = v_wave
      and (mp.player_a_id = v_my_player or mp.player_b_id = v_my_player)
  ) then
    raise exception 'you can only score the court you are playing on' using errcode = '42501';
  end if;

  if v_state not in ('revealed', 'playing') then
    raise exception 'scores can only be posted while the round is in play' using errcode = '42501';
  end if;

  insert into public.mixer_scores (
    round_id, tournament_id, court_no, wave_no, team_a_score, team_b_score, completed_at
  )
  values (
    p_round_id, v_tournament_id, v_court, v_wave,
    greatest(0, p_team_a_score), greatest(0, p_team_b_score), now()
  )
  on conflict (round_id, court_no, wave_no) do update
     set team_a_score = excluded.team_a_score,
         team_b_score = excluded.team_b_score,
         completed_at = excluded.completed_at;
end;
$$;

revoke all on function public.app_mixer_player_score_court(uuid, int, int, int, int) from public;
grant execute on function public.app_mixer_player_score_court(uuid, int, int, int, int) to authenticated;
