-- 0057 — Make the voting timer real on the server.
--
-- The ballot lock (mixer_rounds.lock_at) was advisory: the player UI stops
-- voting at the deadline, but the server still accepted ballots while the round
-- was 'open'. A crafted or slow request could slip a vote in after time. This
-- adds a BEFORE INSERT trigger on mixer_votes that rejects votes once the timer
-- has passed — enforcing the deadline across EVERY write path (app_mixer_set_
-- ballot, the legacy set_vote, and the organizer sim) without rewriting those
-- large functions.
--
-- Scope: only when the round is still 'open' AND lock_mode = 'timer' AND now()
-- is past lock_at. Manual-lock events are unaffected; once a round is locked or
-- drawn no votes are written anyway. This does not auto-LOCK the round (that
-- still needs the organizer, or a future pg_cron job) — it just stops late
-- votes, which is what "the timer means something" requires.

set search_path = public;

create or replace function public.mixer_reject_late_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state text;
  v_lock_at timestamptz;
  v_lock_mode text;
begin
  select mr.state, mr.lock_at, ec.lock_mode
    into v_state, v_lock_at, v_lock_mode
  from public.mixer_rounds mr
  join public.event_config ec on ec.tournament_id = mr.tournament_id
  where mr.id = new.round_id;

  if v_state = 'open'
     and coalesce(v_lock_mode, 'timer') = 'timer'
     and v_lock_at is not null
     and now() > v_lock_at then
    raise exception 'voting closed at % for this round', v_lock_at using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists mixer_votes_deadline on public.mixer_votes;
create trigger mixer_votes_deadline
  before insert on public.mixer_votes
  for each row execute function public.mixer_reject_late_vote();
