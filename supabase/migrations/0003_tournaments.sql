-- Multi-tournament model (owner/member scoped) + player/match history scaffolding.

create table public.tournaments (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null references auth.users(id) on delete cascade,
  name                text not null check (length(trim(name)) between 3 and 120),
  format              text not null default 'round_robin',
  status              text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  whatsapp_group_url  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index tournaments_owner_idx on public.tournaments(owner_user_id);
create index tournaments_created_idx on public.tournaments(created_at desc);

create trigger tournaments_touch
  before update on public.tournaments
  for each row execute function public.touch_updated_at();

create table public.tournament_members (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  role           text not null check (role in ('owner', 'organizer', 'player', 'viewer')),
  created_at     timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index tournament_members_user_idx on public.tournament_members(user_id);
create index tournament_members_tournament_idx on public.tournament_members(tournament_id);

create table public.tournament_players (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  profile_id     uuid references public.profiles(id) on delete set null,
  display_name   text not null check (length(trim(display_name)) between 2 and 120),
  seed_rating    numeric(4,3),
  created_at     timestamptz not null default now()
);

create unique index tournament_players_tournament_profile_uidx
  on public.tournament_players(tournament_id, profile_id)
  where profile_id is not null;

create index tournament_players_tournament_idx on public.tournament_players(tournament_id);
create index tournament_players_profile_idx on public.tournament_players(profile_id);

create table public.matches (
  id                  uuid primary key default gen_random_uuid(),
  tournament_id       uuid not null references public.tournaments(id) on delete cascade,
  round_label         text,
  court_label         text,
  team_a_label        text not null,
  team_b_label        text not null,
  team_a_score        integer,
  team_b_score        integer,
  winner_side         text check (winner_side in ('a', 'b') or winner_side is null),
  scheduled_at        timestamptz,
  completed_at        timestamptz,
  created_by_user_id  uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index matches_tournament_created_idx on public.matches(tournament_id, created_at desc);

-- Ensure the owner is always represented in membership.
create or replace function public.add_owner_as_tournament_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tournament_members (tournament_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner')
  on conflict (tournament_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tournament_owner_member on public.tournaments;
create trigger tournament_owner_member
  after insert on public.tournaments
  for each row execute function public.add_owner_as_tournament_member();

alter table public.tournaments enable row level security;
alter table public.tournament_members enable row level security;
alter table public.tournament_players enable row level security;
alter table public.matches enable row level security;

create or replace function public.is_tournament_member(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_members tm
    where tm.tournament_id = tid
      and tm.user_id = auth.uid()
  );
$$;

create or replace function public.is_tournament_manager(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_members tm
    where tm.tournament_id = tid
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'organizer')
  );
$$;

-- tournaments
create policy "tournaments readable by members"
  on public.tournaments for select
  using (public.is_tournament_member(id));

create policy "authenticated users create own tournaments"
  on public.tournaments for insert
  with check (auth.uid() is not null and owner_user_id = auth.uid());

create policy "owners update tournaments"
  on public.tournaments for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "owners delete tournaments"
  on public.tournaments for delete
  using (owner_user_id = auth.uid());

-- tournament_members
create policy "members readable by tournament members"
  on public.tournament_members for select
  using (public.is_tournament_member(tournament_id));

create policy "managers can add members"
  on public.tournament_members for insert
  with check (public.is_tournament_manager(tournament_id));

create policy "managers can update members"
  on public.tournament_members for update
  using (public.is_tournament_manager(tournament_id))
  with check (public.is_tournament_manager(tournament_id));

create policy "managers can remove members"
  on public.tournament_members for delete
  using (public.is_tournament_manager(tournament_id));

-- tournament_players
create policy "players readable by tournament members"
  on public.tournament_players for select
  using (public.is_tournament_member(tournament_id));

create policy "managers can manage tournament players"
  on public.tournament_players for all
  using (public.is_tournament_manager(tournament_id))
  with check (public.is_tournament_manager(tournament_id));

-- matches
create policy "matches readable by tournament members"
  on public.matches for select
  using (public.is_tournament_member(tournament_id));

create policy "managers can manage matches"
  on public.matches for all
  using (public.is_tournament_manager(tournament_id))
  with check (public.is_tournament_manager(tournament_id));
