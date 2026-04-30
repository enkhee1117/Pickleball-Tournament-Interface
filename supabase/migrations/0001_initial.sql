-- ─────────────────────────────────────────────────────────────────────────────
-- MLP Scoreboard — initial schema
--   roles enum, profiles, invites, messages, RLS, helper fns, auth trigger
-- ─────────────────────────────────────────────────────────────────────────────

create type public.app_role as enum ('admin', 'organizer', 'player');

-- ── invites ─────────────────────────────────────────────────────────────────
-- Invite-only signup. The /login server action checks this table before
-- triggering a magic-link email; the handle_new_user trigger uses it to
-- assign the role attached to the invite.
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  role         public.app_role not null default 'player',
  invited_by   uuid references auth.users(id) on delete set null,
  token        text not null unique default replace(gen_random_uuid()::text,'-',''),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '14 days'),
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null
);

create index invites_email_idx on public.invites(lower(email));
create index invites_token_idx on public.invites(token);

-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  full_name     text,
  avatar_url    text,
  gender        text check (gender in ('m','f','x') or gender is null),
  dupr_id       text,
  dupr_singles  numeric(4,3),
  dupr_doubles  numeric(4,3),
  bio           text,
  role          public.app_role not null default 'player',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Auto-create a profile row when a user signs up; inherit role from invite.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  invite_role public.app_role;
begin
  select i.role into invite_role
  from public.invites i
  where lower(i.email) = lower(new.email) and i.accepted_at is null
  order by i.created_at desc
  limit 1;

  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    coalesce(invite_role, 'player')
  );

  update public.invites
     set accepted_at = now(), accepted_by = new.id
   where lower(email) = lower(new.email) and accepted_at is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── messages (chat) ─────────────────────────────────────────────────────────
create table public.messages (
  id          bigserial primary key,
  channel     text not null default 'general',
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     text not null check (length(content) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index messages_channel_created_idx on public.messages(channel, created_at desc);

-- Make INSERTs broadcast to realtime subscribers.
alter publication supabase_realtime add table public.messages;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.invites  enable row level security;
alter table public.messages enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('admin','organizer')
  );
$$;

-- profiles
create policy "profiles readable by signed-in users"
  on public.profiles for select
  using (auth.uid() is not null);

-- A user may update their own profile, but not their own role (the row-level
-- check freezes role to its current value). Admins update via service role.
create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );

create policy "admins can update any profile"
  on public.profiles for update
  using (public.is_admin());

create policy "admins can delete profiles"
  on public.profiles for delete
  using (public.is_admin());

-- invites — only staff may see/create; only admins may delete
create policy "staff can read invites"
  on public.invites for select
  using (public.is_staff());

create policy "staff can create invites"
  on public.invites for insert
  with check (invited_by = auth.uid() and public.is_staff());

create policy "admins can delete invites"
  on public.invites for delete using (public.is_admin());

-- messages — any signed-in user reads; only the author writes/deletes
create policy "messages readable by signed-in users"
  on public.messages for select
  using (auth.uid() is not null);

create policy "users post their own messages"
  on public.messages for insert
  with check (auth.uid() = user_id);

create policy "users delete their own messages"
  on public.messages for delete
  using (auth.uid() = user_id or public.is_admin());
