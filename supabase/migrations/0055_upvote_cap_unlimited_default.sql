-- 0055 — Upvotes are UNLIMITED by default; organizers can still impose a cap.
--
-- Product change: the per-target upvote cap defaulted to 3, which surprised
-- organizers (a player couldn't stack more than 3 tokens on one partner without
-- the organizer first raising the knob). The blind vote is more expressive with
-- no cap, so the default is now effectively unlimited. Downvotes were already
-- uncapped; this only touches the upvote ceiling.
--
-- Implementation without rewriting the large ballot/config functions:
--   * The cap column keeps its int semantics and the enforcement
--     `coalesce(upvote_cap_per_target, 3)` in app_mixer_set_ballot is unchanged.
--   * We simply widen the allowed range and set the DEFAULT to a value larger
--     than any reachable token budget (1,000,000) — a non-constraint in
--     practice, i.e. "no limit". New events pick this up via the column default
--     (app_ensure_mixer_event never sets the column explicitly).
--   * Existing events keep whatever value they already have.
--
-- Organizer control: the Setup form still accepts a real cap (1–99). Saving the
-- form with the field BLANK sends null, and app_update_mixer_config's
-- `coalesce(..., upvote_cap_per_target)` preserves the current value — so a
-- routine config save never silently re-imposes a cap on an unlimited event.

set search_path = public;

-- Drop the old `between 1 and 99` check (auto-named when the column was added in
-- 0044) so the wider default is allowed, then re-add a generous range.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.event_config'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%upvote_cap_per_target%';
  if v_conname is not null then
    execute format('alter table public.event_config drop constraint %I', v_conname);
  end if;
end $$;

alter table public.event_config
  add constraint event_config_upvote_cap_chk
  check (upvote_cap_per_target between 1 and 1000000);

-- Unlimited by default for new events (1,000,000 ≫ any token budget).
alter table public.event_config
  alter column upvote_cap_per_target set default 1000000;
