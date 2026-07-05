-- 0053 — Never strand a team on a court with no opponent (rotating team bye).
--
-- The bug (seen live at 7 men / 9 women in a mixed event): doubles seats TWO
-- teams per game, but the draw formed min(men,women)=7 teams and 7 is odd, so
-- the 7th team was placed on its own court with no opponent — a "game" that
-- can't be played (and, in round 5, showed as one man vs one woman). The pool
-- sit-out already benched the 2 overflow women; nothing forced the *team* count
-- to be even.
--
-- Fix: when the balanced team count (min of the two pools after overflow
-- sit-outs) is odd, one more player from EACH pool takes a bye this round,
-- dropping to an even team count. Byes are chosen fewest-sat-first by the
-- existing sit-out ordering, so they rotate fairly (no one sits twice before
-- everyone's sat once — the edge-cases.html "rotating bye" contract). Everyone
-- then either plays a real 2-team game or sits; a court never holds a lone team.
--
-- Body is identical to 0051 (waves/heats) except the sit-out-count computation
-- block, which now derives an EVEN team count. Mode-agnostic (mixed/same/open).

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
  v_count_a int;
  v_count_b int;
  v_teams int;
begin
  -- Exclusive row lock: serializes two concurrent draws on the same round.
  select * into v_round from public.mixer_rounds where id = p_round_id for update;
  if v_round.id is null then
    raise exception 'round not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_round.tournament_id);
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

  -- 0053: how many active players sit in each pool this round.
  --   1. Pool overflow: the bigger pool sits its extra so both pools match.
  --   2. Even teams: doubles needs an EVEN number of teams (2 per game). If the
  --      balanced count is odd, one more from each pool takes a rotating bye so
  --      no team is ever stranded on a court alone.
  select
    count(*) filter (where pes.pairing_pool = 'a'),
    count(*) filter (where pes.pairing_pool = 'b')
  into v_count_a, v_count_b
  from public.player_event_state pes
  join public.tournament_players tp on tp.id = pes.player_id
  where pes.tournament_id = v_round.tournament_id and tp.withdrawn_at is null;

  v_count_a := coalesce(v_count_a, 0);
  v_count_b := coalesce(v_count_b, 0);
  v_sit_needed_a := greatest(0, v_count_a - v_count_b);
  v_sit_needed_b := greatest(0, v_count_b - v_count_a);

  v_teams := least(v_count_a - v_sit_needed_a, v_count_b - v_sit_needed_b);
  if (v_teams % 2) = 1 then
    v_sit_needed_a := v_sit_needed_a + 1;
    v_sit_needed_b := v_sit_needed_b + 1;
  end if;

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
        insert into public.mixer_pairings (round_id, tournament_id, player_a_id, player_b_id, court_no, wave_no, weight)
        values (
          p_round_id, v_round.tournament_id, v_a.player_id, v_b_id,
          ((v_pairs / 2) % greatest(1, v_cfg.courts)) + 1,
          ((v_pairs / 2) / greatest(1, v_cfg.courts)) + 1,
          v_weight
        );
        v_available_b := array_remove(v_available_b, v_b_id);
        v_pairs := v_pairs + 1;
        exit;
      end if;
    end loop;
  end loop;

  -- 'same' mode: re-group so same-gender teams face each other, then re-derive
  -- BOTH court_no and wave_no from the regrouped order.
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
       set court_no = ((o.rn / 2) % greatest(1, v_cfg.courts)) + 1,
           wave_no  = ((o.rn / 2) / greatest(1, v_cfg.courts)) + 1
      from ordered o
     where o.id = mp.id;
  end if;

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
