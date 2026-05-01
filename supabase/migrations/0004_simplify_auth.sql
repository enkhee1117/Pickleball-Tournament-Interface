-- Simplify auth + cross-user history.
--   * Track an optional invite email on tournament_players so registered users
--     can be linked to their roster row and see their own match history.
--   * Auto-link to the matching profile (and add tournament membership) when
--     either the player is added or a user signs up later with that email.
--   * Allow users to read their own tournament_players rows directly so the
--     history page works even if the membership row hasn't been added.

alter table public.tournament_players
  add column if not exists email text;

create index if not exists tournament_players_email_idx
  on public.tournament_players (lower(email))
  where email is not null;

-- When a player row is inserted with an email, look up the existing profile
-- by email and backfill profile_id + tournament_members in one shot.
create or replace function public.link_tournament_player_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_user uuid;
begin
  if new.profile_id is null and new.email is not null then
    select u.id into matched_user
      from auth.users u
     where lower(u.email) = lower(new.email)
     limit 1;
    if matched_user is not null then
      new.profile_id := matched_user;
    end if;
  end if;

  if new.profile_id is not null then
    insert into public.tournament_members (tournament_id, user_id, role)
    values (new.tournament_id, new.profile_id, 'player')
    on conflict (tournament_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_players_link on public.tournament_players;
create trigger tournament_players_link
  before insert on public.tournament_players
  for each row execute function public.link_tournament_player_to_profile();

-- When a new user signs up, retro-link any tournament_players rows that were
-- added with their email but had no profile_id yet.
create or replace function public.link_player_rows_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    return new;
  end if;

  update public.tournament_players
     set profile_id = new.id
   where profile_id is null
     and lower(email) = lower(new.email);

  insert into public.tournament_members (tournament_id, user_id, role)
  select tp.tournament_id, new.id, 'player'
    from public.tournament_players tp
   where tp.profile_id = new.id
  on conflict (tournament_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_players on auth.users;
create trigger on_auth_user_created_link_players
  after insert on auth.users
  for each row execute function public.link_player_rows_for_new_user();

-- Let users always see their own tournament_players rows (even before the
-- member link exists), so /history can resolve their identity.
drop policy if exists "users read their own tournament_players" on public.tournament_players;
create policy "users read their own tournament_players"
  on public.tournament_players for select
  using (profile_id = auth.uid());
