-- 0058 — Live-night recovery (no-show swap) + configurable game target.
--
-- Two additions:
--   1. app_mixer_swap_player — the edge-cases.html "no-show / swap in from the
--      bench" flow. After a draw, an organizer replaces a seated player who
--      didn't show with a benched (sitting-out or otherwise unseated) player,
--      preserving everyone else's draw. The swapped-out player takes the bench.
--      (Early-leave / retire already works via app_withdraw_player from 0031 —
--      the draw excludes withdrawn_at players — so only a working button is
--      needed there, not new SQL.)
--   2. event_config.game_to — the game target (11/15/21). Mixer scoring was
--      hardcoded to 11; this makes it configurable per event. win-by-2 stays.

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Configurable game target
-- ---------------------------------------------------------------------------
alter table public.event_config
  add column if not exists game_to int not null default 11;

alter table public.event_config
  drop constraint if exists event_config_game_to_chk;
alter table public.event_config
  add constraint event_config_game_to_chk check (game_to in (11, 15, 21));

-- Dedicated setter so the Setup form can save the target without re-issuing the
-- whole (large) app_update_mixer_config — the config action calls both.
create or replace function public.app_mixer_set_game_target(
  p_tournament_id uuid,
  p_game_to int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_require_tournament_manager(p_tournament_id);
  if coalesce(p_game_to, 11) not in (11, 15, 21) then
    raise exception 'game target must be 11, 15 or 21' using errcode = '22023';
  end if;
  update public.event_config set game_to = p_game_to where tournament_id = p_tournament_id;
end;
$$;

revoke all on function public.app_mixer_set_game_target(uuid, int) from public;
grant execute on function public.app_mixer_set_game_target(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. No-show swap: replace a seated player with a bench player for this round
-- ---------------------------------------------------------------------------
create or replace function public.app_mixer_swap_player(
  p_round_id uuid,
  p_out_player uuid,
  p_in_player uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tid uuid;
  v_state text;
begin
  select tournament_id, state into v_tid, v_state
  from public.mixer_rounds where id = p_round_id;
  if v_tid is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_tid);

  if v_state not in ('revealed', 'playing') then
    raise exception 'can only swap players in a drawn, in-play round' using errcode = '42501';
  end if;

  -- The out-player must actually be seated this round.
  if not exists (
    select 1 from public.mixer_pairings mp
    where mp.round_id = p_round_id
      and (mp.player_a_id = p_out_player or mp.player_b_id = p_out_player)
  ) then
    raise exception 'that player is not seated in this round' using errcode = '42501';
  end if;

  -- The in-player must belong to the event, be active, and not already seated.
  if not exists (
    select 1 from public.tournament_players tp
    where tp.id = p_in_player and tp.tournament_id = v_tid and tp.withdrawn_at is null
  ) then
    raise exception 'replacement is not an active player in this event' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.mixer_pairings mp
    where mp.round_id = p_round_id
      and (mp.player_a_id = p_in_player or mp.player_b_id = p_in_player)
  ) then
    raise exception 'replacement is already playing this round' using errcode = '42501';
  end if;

  -- Swap in the replacement everywhere the no-show was seated (preserves the
  -- rest of the draw — court, wave, partner, opponent all stay).
  update public.mixer_pairings set player_a_id = p_in_player
   where round_id = p_round_id and player_a_id = p_out_player;
  update public.mixer_pairings set player_b_id = p_in_player
   where round_id = p_round_id and player_b_id = p_out_player;

  -- The replacement is no longer sitting; the no-show now takes the bench.
  delete from public.mixer_sit_outs where round_id = p_round_id and player_id = p_in_player;
  insert into public.mixer_sit_outs (round_id, tournament_id, player_id)
  values (p_round_id, v_tid, p_out_player)
  on conflict (round_id, player_id) do nothing;
end;
$$;

revoke all on function public.app_mixer_swap_player(uuid, uuid, uuid) from public;
grant execute on function public.app_mixer_swap_player(uuid, uuid, uuid) to authenticated;
