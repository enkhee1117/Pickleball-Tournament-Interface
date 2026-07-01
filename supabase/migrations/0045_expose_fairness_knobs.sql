-- 0045 — Expose the fairness knobs added in 0044 through the admin
-- update path.
--
-- Migration 0044 added event_config.upvote_cap_per_target and
-- event_config.bet_lock_round_no, and the vote/bet RPCs read them, but
-- app_update_mixer_config had no way to write them — so an organizer
-- could not change the values from the Setup tab. This migration extends
-- the RPC signature with two optional params and slots them into the
-- existing UPDATE. Everything else in the body is preserved verbatim
-- from 0043.
--
-- Signature changes force us to drop and recreate the function because
-- Postgres treats a differently-signed function as a distinct object.

drop function if exists public.app_update_mixer_config(
  uuid, int, int, int, int, text, int, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, boolean, int, numeric, int,
  boolean, boolean, boolean, int, int, numeric, jsonb, jsonb, text
);

create or replace function public.app_update_mixer_config(
  p_tournament_id uuid,
  p_starting_tokens int default null,
  p_starting_chips int default null,
  p_rounds int default null,
  p_courts int default null,
  p_lock_mode text default null,
  p_lock_seconds int default null,
  p_alpha numeric default null,
  p_beta numeric default null,
  p_gamma numeric default null,
  p_tau numeric default null,
  p_grief_floor numeric default null,
  p_repeat_decay numeric default null,
  p_entry_fee numeric default null,
  p_pay_to_play_enabled boolean default null,
  p_boost_tokens int default null,
  p_boost_price numeric default null,
  p_boost_limit int default null,
  p_betting_enabled boolean default null,
  p_raffle_enabled boolean default null,
  p_downvotes_enabled boolean default null,
  p_podium_markets int default null,
  p_betting_prize_winners int default null,
  p_betting_rake_pct numeric default null,
  p_prize_buckets jsonb default null,
  p_payment_methods jsonb default null,
  p_raffle_prize text default null,
  p_upvote_cap int default null,
  p_bet_lock_round_no int default null,
  p_clear_bet_lock_round boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_format text;
  v_prize_total numeric;
  v_requested_rounds int;
  v_min_rounds int;
  v_final_rounds int;
  v_lock_mode text;
  v_lock_seconds int;
  v_default_state text;
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  select format into v_format from public.tournaments where id = p_tournament_id;
  if v_format <> 'partner_mixer' then
    raise exception 'tournament is not a partner mixer' using errcode = '22023';
  end if;

  if p_lock_mode is not null and p_lock_mode not in ('timer', 'manual') then
    raise exception 'invalid lock mode' using errcode = '22023';
  end if;

  if p_prize_buckets is not null then
    v_prize_total :=
      coalesce((p_prize_buckets->>'tournament')::numeric, 0) +
      coalesce((p_prize_buckets->>'raffle')::numeric, 0) +
      coalesce((p_prize_buckets->>'betting')::numeric, 0) +
      coalesce((p_prize_buckets->>'reserve')::numeric, 0);

    if abs(v_prize_total - 1) > 0.001 then
      raise exception 'prize buckets must total 100%%' using errcode = '22023';
    end if;
  end if;

  select coalesce(max(mr.round_no), 0)
    into v_min_rounds
  from public.mixer_rounds mr
  where mr.tournament_id = p_tournament_id
    and (
      mr.state in ('drawing', 'revealed', 'playing', 'done')
      or exists (select 1 from public.mixer_pairings mp where mp.round_id = mr.id)
      or exists (select 1 from public.mixer_scores ms where ms.round_id = mr.id)
    );

  v_requested_rounds := case
    when p_rounds is null then null
    else greatest(1, least(p_rounds, 50))
  end;

  update public.event_config
     set starting_tokens = coalesce(greatest(1, least(p_starting_tokens, 100)), starting_tokens),
         starting_chips = coalesce(greatest(0, p_starting_chips), starting_chips),
         rounds = coalesce(greatest(coalesce(v_requested_rounds, rounds), v_min_rounds), rounds),
         courts = coalesce(greatest(1, least(p_courts, 16)), courts),
         lock_mode = coalesce(p_lock_mode, lock_mode),
         lock_seconds = coalesce(greatest(5, least(p_lock_seconds, 604800)), lock_seconds),
         alpha = coalesce(greatest(0, p_alpha), alpha),
         beta = coalesce(greatest(0, p_beta), beta),
         gamma = coalesce(greatest(0, p_gamma), gamma),
         tau = coalesce(greatest(0.01, p_tau), tau),
         grief_floor = coalesce(greatest(0, p_grief_floor), grief_floor),
         repeat_decay = coalesce(greatest(0, least(p_repeat_decay, 1)), repeat_decay),
         entry_fee = coalesce(greatest(0, p_entry_fee), entry_fee),
         pay_to_play_enabled = coalesce(p_pay_to_play_enabled, pay_to_play_enabled),
         boost_tokens = coalesce(greatest(0, least(p_boost_tokens, 100)), boost_tokens),
         boost_price = coalesce(greatest(0, p_boost_price), boost_price),
         boost_limit = coalesce(greatest(0, least(p_boost_limit, 10)), boost_limit),
         betting_enabled = coalesce(p_betting_enabled, betting_enabled),
         raffle_enabled = coalesce(p_raffle_enabled, raffle_enabled),
         downvotes_enabled = coalesce(p_downvotes_enabled, downvotes_enabled),
         podium_markets = coalesce(greatest(1, least(p_podium_markets, 8)), podium_markets),
         betting_prize_winners = coalesce(greatest(1, least(p_betting_prize_winners, 20)), betting_prize_winners),
         betting_rake_pct = coalesce(greatest(0, least(p_betting_rake_pct, 1)), betting_rake_pct),
         prize_buckets = coalesce(p_prize_buckets, prize_buckets),
         payment_methods = coalesce(p_payment_methods, payment_methods),
         raffle_prize = coalesce(nullif(trim(p_raffle_prize), ''), raffle_prize),
         upvote_cap_per_target = coalesce(greatest(1, least(p_upvote_cap, 99)), upvote_cap_per_target),
         bet_lock_round_no = case
           when p_clear_bet_lock_round then null
           when p_bet_lock_round_no is null then bet_lock_round_no
           else greatest(1, least(p_bet_lock_round_no, 50))
         end
   where tournament_id = p_tournament_id
   returning rounds, lock_mode, lock_seconds into v_final_rounds, v_lock_mode, v_lock_seconds;

  if not found then
    raise exception 'mixer config not found' using errcode = '02000';
  end if;

  v_default_state := case
    when exists (
      select 1 from public.mixer_rounds
      where tournament_id = p_tournament_id
        and state in ('locked', 'drawing', 'revealed', 'playing', 'done')
    ) then 'locked'
    else 'open'
  end;

  insert into public.mixer_rounds (tournament_id, round_no, state, lock_at)
  select
    p_tournament_id,
    gs.round_no,
    v_default_state,
    case when v_lock_mode = 'timer' and v_default_state = 'open' then now() + make_interval(secs => v_lock_seconds) else null end
  from generate_series(1, v_final_rounds) as gs(round_no)
  on conflict (tournament_id, round_no) do nothing;

  delete from public.mixer_rounds mr
  where mr.tournament_id = p_tournament_id
    and mr.round_no > v_final_rounds
    and mr.state in ('open', 'locked')
    and not exists (select 1 from public.mixer_pairings mp where mp.round_id = mr.id)
    and not exists (select 1 from public.mixer_scores ms where ms.round_id = mr.id);

  update public.mixer_rounds
     set lock_at = case
       when state = 'open' and v_lock_mode = 'timer'
         then now() + make_interval(secs => v_lock_seconds)
       when v_lock_mode = 'manual'
         then null
       else lock_at
     end
   where tournament_id = p_tournament_id
     and state = 'open';
end;
$$;

revoke all on function public.app_update_mixer_config(
  uuid, int, int, int, int, text, int, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, boolean, int, numeric, int,
  boolean, boolean, boolean, int, int, numeric, jsonb, jsonb, text,
  int, int, boolean
) from public;
grant execute on function public.app_update_mixer_config(
  uuid, int, int, int, int, text, int, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, boolean, int, numeric, int,
  boolean, boolean, boolean, int, int, numeric, jsonb, jsonb, text,
  int, int, boolean
) to authenticated;
