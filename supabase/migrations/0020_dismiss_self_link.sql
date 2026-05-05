-- Stats page nudges signed-in members to pick their player slot in every
-- tournament they belong to. Organizers who aren't actually playing want
-- to silence that nudge per-tournament.
--
-- Add a tournament_members.dismissed_self_link boolean and a small RPC the
-- user can call to flip it. The history page then filters those out of the
-- "unclaimed tournaments" list.

set search_path = public;

alter table public.tournament_members
  add column if not exists dismissed_self_link boolean not null default false;

create or replace function public.app_dismiss_tournament_self_link(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
begin
  update public.tournament_members
     set dismissed_self_link = true
   where tournament_id = p_tournament_id
     and user_id = uid;
  if not found then
    raise exception 'not a member of that tournament' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.app_dismiss_tournament_self_link(uuid) from public;
grant execute on function public.app_dismiss_tournament_self_link(uuid) to authenticated;

-- Symmetric un-dismiss in case the user changes their mind. (Currently the
-- "I am [name]" claim flow doesn't reset this, so the only way back is
-- through this RPC if we ever expose the affordance.)
create or replace function public.app_restore_tournament_self_link(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
begin
  update public.tournament_members
     set dismissed_self_link = false
   where tournament_id = p_tournament_id
     and user_id = uid;
end;
$$;

revoke all on function public.app_restore_tournament_self_link(uuid) from public;
grant execute on function public.app_restore_tournament_self_link(uuid) to authenticated;
