-- 0050 — Draw precondition errors: stop masking them as "permission denied".
--
-- Bug report: an organizer locked the ballot, ran the draw (which succeeded),
-- then a second/stale "Run the draw" submission landed on the now-'revealed'
-- round. The draw's state guard raised with errcode 42501 (insufficient_
-- privilege), which the UI (src/lib/forms.ts) blanket-maps to "You don't have
-- permission to do that." — so the sole tournament owner saw a scary, wrong
-- permission error for what was really a harmless double-submit.
--
-- These guards are precondition/state errors, not authorization errors. Move
-- them to SQLSTATE 55000 (object_not_in_prerequisite_state) so formatPgError
-- passes the real, actionable text through, and split out an explicit
-- "already been drawn" case so a redundant submit reads as a no-op, not a
-- failure. app_require_tournament_manager keeps 42501 — that one really IS a
-- permission check.
--
-- Function body otherwise identical to 0049.

set search_path = public;

create or replace function public.app_mixer_draw_round(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.mixer_rounds%rowtype;
  v_cfg public.event_config%rowtype;
  v_gender_mode text;
  v_a_gender text;
  v_pairs int := 0;
  v_a record;
  v_b_id uuid;
  v_available_b uuid[];
  v_candidates uuid[];
  v_total numeric;
  v_cursor numeric;
  v_weight numeric;
  v_sit_needed_a int;
  v_sit_needed_b int;
begin
  -- Exclusive row lock: serializes two concurrent draws on the same round.
  select * into v_round from public.mixer_rounds where id = p_round_id for update;
  if v_round.id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_round.tournament_id);
  -- 0050: distinguish "already drawn" (harmless re-submit) from "not locked
  -- yet", and use SQLSTATE 55000 (object_not_in_prerequisite_state) so these
  -- state errors are no longer conflated with an auth failure (42501).
  if v_round.state in ('drawing', 'revealed', 'playing', 'done') then
    raise exception 'This round has already been drawn.' using errcode = '55000';
  elsif v_round.state <> 'locked' then
    raise exception 'Lock the ballot before drawing.' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.mixer_rounds mr
    where mr.tournament_id = v_round.tournament_id
      and mr.round_no < v_round.round_no
      and mr.state <> 'done'
  ) then
    raise exception 'Finish earlier rounds before drawing this round.' using errcode = '55000';
  end if;

  select * into v_cfg from public.event_config where tournament_id = v_round.tournament_id;
  select coalesce(gender_mode, 'open') into v_gender_mode
  from public.tournaments where id = v_round.tournament_id;

  update public.mixer_rounds set state = 'drawing' where id = p_round_id;
  delete from public.mixer_pairings where round_id = p_round_id;
  delete from public.mixer_sit_outs where round_id = p_round_id;

  select greatest(0,
    count(*) filter (where pairing_pool = 'a') - count(*) filter (where pairing_pool = 'b')
  ) into v_sit_needed_a
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id and tp.withdrawn_at is null;

  select greatest(0,
    count(*) filter (where pairing_pool = 'b') - count(*) filter (where pairing_pool = 'a')
  ) into v_sit_needed_b
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id and tp.withdrawn_at is null;

  insert into public.mixer_sit_outs (round_id, tournament_id, player_id)
  select p_round_id, v_round.tournament_id, pes.player_id
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id
    and pes.pairing_pool = 'a'
    and tp.withdrawn_at is null
  order by pes.sit_out_count asc, pes.sat_last_round asc, random()
  limit v_sit_needed_a;

  insert into public.mixer_sit_outs (round_id, tournament_id, player_id)
  select p_round_id, v_round.tournament_id, pes.player_id
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id
    and pes.pairing_pool = 'b'
    and tp.withdrawn_at is null
  order by pes.sit_out_count asc, pes.sat_last_round asc, random()
  limit v_sit_needed_b;

  select array_agg(pes.player_id order by random())
    into v_available_b
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id
    and pes.pairing_pool = 'b'
    and tp.withdrawn_at is null
    and not exists (
      select 1
      from public.mixer_sit_outs so
      where so.round_id = p_round_id and so.player_id = pes.player_id
    );

  v_available_b := coalesce(v_available_b, array[]::uuid[]);

  for v_a in
    select pes.player_id
    from public.player_event_state pes
    join public.tournament_players tp on tp.id = pes.player_id
    where pes.tournament_id = v_round.tournament_id
      and pes.pairing_pool = 'a'
      and tp.withdrawn_at is null
      and not exists (
        select 1
        from public.mixer_sit_outs so
        where so.round_id = p_round_id and so.player_id = pes.player_id
      )
    order by random()
  loop
    -- 0047: in 'same' mode only same-gender candidates are eligible.
    if v_gender_mode = 'same' then
      select coalesce(tp.gender, 'x') into v_a_gender
      from public.tournament_players tp where tp.id = v_a.player_id;

      select coalesce(array_agg(b.player_id), array[]::uuid[])
        into v_candidates
      from unnest(v_available_b) as b(player_id)
      join public.tournament_players tpb on tpb.id = b.player_id
      where coalesce(tpb.gender, 'x') = v_a_gender;
    else
      v_candidates := v_available_b;
    end if;

    select coalesce(sum(
      exp((
        greatest(
          (
            v_cfg.alpha * (
              coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = b.player_id), 0) +
              coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = b.player_id and target_player_id = v_a.player_id), 0)
            ) +
            v_cfg.beta * sqrt(
              coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = b.player_id), 0) *
              coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = b.player_id and target_player_id = v_a.player_id), 0)
            ) -
            v_cfg.gamma * (
              coalesce((select down_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = b.player_id), 0) +
              coalesce((select down_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = b.player_id and target_player_id = v_a.player_id), 0)
            )
          ),
          -v_cfg.grief_floor
        )
      ) / v_cfg.tau) *
      power(v_cfg.repeat_decay, coalesce((
        select count(*)
        from public.mixer_pairings mp
        join public.mixer_rounds mr on mr.id = mp.round_id
        where mr.tournament_id = v_round.tournament_id
          and ((mp.player_a_id = v_a.player_id and mp.player_b_id = b.player_id)
            or (mp.player_a_id = b.player_id and mp.player_b_id = v_a.player_id))
      ), 0))
    ), 0)
    into v_total
    from unnest(v_candidates) as b(player_id);

    if v_total <= 0 then
      -- 0047: no eligible candidate for THIS player (e.g. gender cohort
      -- exhausted in 'same' mode) — move on, others may still pair.
      continue;
    end if;

    v_cursor := random() * v_total;
    for v_b_id in select player_id from unnest(v_candidates) as b(player_id) order by random() loop
      v_weight :=
        exp((
          greatest(
            (
              v_cfg.alpha * (
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = v_b_id), 0) +
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_b_id and target_player_id = v_a.player_id), 0)
              ) +
              v_cfg.beta * sqrt(
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = v_b_id), 0) *
                coalesce((select up_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_b_id and target_player_id = v_a.player_id), 0)
              ) -
              v_cfg.gamma * (
                coalesce((select down_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_a.player_id and target_player_id = v_b_id), 0) +
                coalesce((select down_tokens from public.mixer_votes where round_id = p_round_id and voter_player_id = v_b_id and target_player_id = v_a.player_id), 0)
              )
            ),
            -v_cfg.grief_floor
          )
        ) / v_cfg.tau) *
        power(v_cfg.repeat_decay, coalesce((
          select count(*)
          from public.mixer_pairings mp
          join public.mixer_rounds mr on mr.id = mp.round_id
          where mr.tournament_id = v_round.tournament_id
            and ((mp.player_a_id = v_a.player_id and mp.player_b_id = v_b_id)
              or (mp.player_a_id = v_b_id and mp.player_b_id = v_a.player_id))
        ), 0));
      v_cursor := v_cursor - v_weight;
      if v_cursor <= 0 then
        insert into public.mixer_pairings (round_id, tournament_id, player_a_id, player_b_id, court_no, weight)
        values (p_round_id, v_round.tournament_id, v_a.player_id, v_b_id, ((v_pairs / 2) % greatest(1, v_cfg.courts)) + 1, v_weight);
        v_available_b := array_remove(v_available_b, v_b_id);
        v_pairs := v_pairs + 1;
        exit;
      end if;
    end loop;
  end loop;

  -- 0047: in 'same' mode, re-group courts by team gender so same-gender
  -- teams face each other where counts allow (an odd cohort still produces
  -- one cross-gender court at the boundary — organizer reality).
  if v_gender_mode = 'same' then
    with ordered as (
      select
        mp.id,
        row_number() over (
          order by coalesce(tpa.gender, 'x'), mp.created_at, mp.id
        ) - 1 as rn
      from public.mixer_pairings mp
      join public.tournament_players tpa on tpa.id = mp.player_a_id
      where mp.round_id = p_round_id
    )
    update public.mixer_pairings mp
       set court_no = ((o.rn / 2) % greatest(1, v_cfg.courts)) + 1
      from ordered o
     where o.id = mp.id;
  end if;

  -- 0049: anyone still active and unseated after the loop sat out this round
  -- in every sense that matters — record it. Before this, a 'same'-mode draw
  -- with an odd gender cohort (or a mixed draw that ran out of candidates)
  -- left players silently unseated: no pairing, no sit-out row, no rotation
  -- credit, and nothing for the organizer to see.
  insert into public.mixer_sit_outs (round_id, tournament_id, player_id)
  select p_round_id, v_round.tournament_id, pes.player_id
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id
    and tp.withdrawn_at is null
    and not exists (
      select 1 from public.mixer_pairings mp
      where mp.round_id = p_round_id
        and (mp.player_a_id = pes.player_id or mp.player_b_id = pes.player_id)
    )
  on conflict (round_id, player_id) do nothing;

  update public.player_event_state
     set sat_last_round = false
   where tournament_id = v_round.tournament_id;

  update public.player_event_state pes
     set sit_out_count = sit_out_count + 1,
         sat_last_round = true
    from public.mixer_sit_outs so
   where so.round_id = p_round_id
     and so.player_id = pes.player_id;

  update public.mixer_rounds set state = 'revealed' where id = p_round_id;
  return v_pairs;
end;
$$;

revoke all on function public.app_mixer_draw_round(uuid) from public;
grant execute on function public.app_mixer_draw_round(uuid) to authenticated;
