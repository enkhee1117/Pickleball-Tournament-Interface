-- Mid-tournament withdrawal.
--
-- A player who shows up to round 1, plays a couple matches, then has to
-- leave (injury, family thing, double-booked, whatever) used to leave
-- the manager with no clean recovery: removing the row strips the row
-- from completed-match labels in confusing ways, and leaving them in
-- means their pending matches sit forever as "live, score not entered".
--
-- This migration:
--   1. Adds `tournament_players.withdrawn_at timestamptz` so the roster
--      can show a WITHDRAWN chip.
--   2. Adds `matches.forfeited_by uuid` so the scoreboard can render a
--      W/O badge instead of pretending an 11-0 was actually played.
--   3. Adds `app_withdraw_player(p_player_id)` — the manager-only RPC
--      that flips both. Pending matches mentioning the player by display
--      name get a forfeit score (11-0 in favour of the other side), a
--      `forfeited_by` stamp, and `completed_at = now()` so they fall out
--      of the "still pending" count.

set search_path = public;

alter table public.tournament_players
  add column if not exists withdrawn_at timestamptz null;

alter table public.matches
  add column if not exists forfeited_by uuid null
    references public.tournament_players(id) on delete set null;

create or replace function public.app_withdraw_player(
  p_player_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_name text;
  v_count int := 0;
begin
  select tp.tournament_id, tp.display_name
    into v_tournament_id, v_name
    from public.tournament_players tp
   where tp.id = p_player_id;
  if v_tournament_id is null then
    raise exception 'player not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_tournament_id);

  update public.tournament_players
     set withdrawn_at = now()
   where id = p_player_id;

  -- Forfeit any pending match where the player's display_name appears in
  -- either team label. Doubles labels are "X & Y"; singles are just the
  -- bare name. Pickleball roster names are 2+ characters so the LIKE
  -- patterns below are unambiguous against the " & " separator.
  update public.matches m
     set winner_side = case
           when m.team_a_label = v_name
             or m.team_a_label like v_name || ' & %'
             or m.team_a_label like '% & ' || v_name
           then 'b'
           else 'a'
         end,
         team_a_score = case
           when m.team_a_label = v_name
             or m.team_a_label like v_name || ' & %'
             or m.team_a_label like '% & ' || v_name
           then 0
           else 11
         end,
         team_b_score = case
           when m.team_a_label = v_name
             or m.team_a_label like v_name || ' & %'
             or m.team_a_label like '% & ' || v_name
           then 11
           else 0
         end,
         completed_at = now(),
         forfeited_by = p_player_id
   where m.tournament_id = v_tournament_id
     and m.completed_at is null
     and (
       m.team_a_label = v_name
       or m.team_a_label like v_name || ' & %'
       or m.team_a_label like '% & ' || v_name
       or m.team_b_label = v_name
       or m.team_b_label like v_name || ' & %'
       or m.team_b_label like '% & ' || v_name
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.app_withdraw_player(uuid) from public;
grant execute on function public.app_withdraw_player(uuid) to authenticated;

-- Symmetric reinstate-player in case the withdrawal was a mistake. Only
-- clears the flag — does NOT undo forfeits, since rescoring a forfeited
-- match in the regular scoring UI is the safer path back.
create or replace function public.app_reinstate_player(
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
begin
  select tp.tournament_id into v_tournament_id
    from public.tournament_players tp
   where tp.id = p_player_id;
  if v_tournament_id is null then
    raise exception 'player not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_tournament_id);

  update public.tournament_players
     set withdrawn_at = null
   where id = p_player_id;
end;
$$;

revoke all on function public.app_reinstate_player(uuid) from public;
grant execute on function public.app_reinstate_player(uuid) to authenticated;
