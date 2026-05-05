-- Functional invite codes for tournaments.
--
-- Adds a 6-char invite_code column, a generator that excludes look-alike
-- characters (no I, O, 0, 1), a before-insert trigger that allocates a unique
-- code when one is not supplied, and an authenticated RPC that lets a signed
-- in user join a tournament by typing the code. Existing tournaments are
-- backfilled with codes before NOT NULL + UNIQUE are enforced.
--
-- The RPC inserts the caller into tournament_members as a 'player' (no-op if
-- already a member) and runs as SECURITY DEFINER so it bypasses the
-- managers-only insert policy.

set search_path = public;

alter table public.tournaments
  add column if not exists invite_code text;

create or replace function public.gen_tournament_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out_code text := '';
  i int;
begin
  for i in 1..6 loop
    out_code := out_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out_code;
end;
$$;

create or replace function public.gen_unique_tournament_invite_code()
returns text
language plpgsql
as $$
declare
  candidate text;
  v_exists boolean;
  attempts int := 0;
begin
  loop
    candidate := public.gen_tournament_invite_code();
    select exists(select 1 from public.tournaments where invite_code = candidate)
      into v_exists;
    if not v_exists then
      return candidate;
    end if;
    attempts := attempts + 1;
    if attempts > 200 then
      raise exception 'could not allocate unique invite code after 200 attempts';
    end if;
  end loop;
end;
$$;

create or replace function public.set_tournament_invite_code()
returns trigger
language plpgsql
as $$
begin
  if new.invite_code is null or length(trim(new.invite_code)) = 0 then
    new.invite_code := public.gen_unique_tournament_invite_code();
  else
    new.invite_code := upper(regexp_replace(new.invite_code, '[^A-Za-z0-9]', '', 'g'));
  end if;
  return new;
end;
$$;

drop trigger if exists tournaments_set_invite_code on public.tournaments;
create trigger tournaments_set_invite_code
  before insert on public.tournaments
  for each row execute function public.set_tournament_invite_code();

-- Backfill any pre-existing rows.
do $$
declare
  rec record;
begin
  for rec in select id from public.tournaments where invite_code is null loop
    update public.tournaments
       set invite_code = public.gen_unique_tournament_invite_code()
     where id = rec.id;
  end loop;
end $$;

alter table public.tournaments
  alter column invite_code set not null;

create unique index if not exists tournaments_invite_code_uidx
  on public.tournaments(invite_code);

-- ---------------------------------------------------------------------------
-- Join-by-code RPC.
-- ---------------------------------------------------------------------------
create or replace function public.app_join_tournament_by_code(
  p_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_tid uuid;
begin
  if length(v_code) <> 6 then
    raise exception 'invite code must be 6 alphanumeric characters' using errcode = '22023';
  end if;

  select id into v_tid from public.tournaments where invite_code = v_code;
  if v_tid is null then
    raise exception 'no tournament found for that code' using errcode = '02000';
  end if;

  insert into public.tournament_members (tournament_id, user_id, role)
  values (v_tid, uid, 'player')
  on conflict (tournament_id, user_id) do nothing;

  return v_tid;
end;
$$;

revoke all on function public.app_join_tournament_by_code(text) from public;
grant execute on function public.app_join_tournament_by_code(text) to authenticated;
