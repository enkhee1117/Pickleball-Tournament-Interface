-- Phone-as-username signups went through synth emails (digits@phone.local)
-- so auth.users.phone is null for them — handle_new_user therefore left
-- profiles.phone null. That broke two things:
--   1. The on-signup auto-link only matched roster rows by email, so a
--      player invited by phone never got linked to their roster slot
--      when they signed up.
--   2. /tournaments couldn't find their tournaments via the
--      tournament_members table because the link never happened.
--
-- This migration:
--   * Re-issues handle_new_user to derive the phone from a synth email
--     when auth.users.phone is null, so profiles.phone always reflects
--     the real number.
--   * Re-issues link_player_rows_for_new_user to also match
--     tournament_players by phone (in addition to email) and create
--     the tournament_members row alongside.
--   * One-shot backfill: derive profiles.phone from synth-email rows
--     that don't already have one, then sweep tournament_players by
--     phone to link rows that should have been linked at signup.

set search_path = public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  invite_role public.app_role;
  v_phone text := nullif(new.phone, '');
  v_email text := nullif(new.email, '');
  -- Synth-email signup: digits@phone.local. Recover the +CCNNNN string so
  -- profiles.phone matches what the player typed during invite.
  v_synth_phone text := case
    when v_phone is null and v_email ~ '^[1-9][0-9]{6,14}@phone\.local$'
    then '+' || split_part(v_email, '@', 1)
    else null
  end;
  v_resolved_phone text := coalesce(v_phone, v_synth_phone);
  v_display text := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    case when v_email is not null and v_email !~ '^[0-9]+@phone\.local$'
      then split_part(v_email, '@', 1)
    end,
    v_resolved_phone,
    'Player'
  );
begin
  if v_email is not null then
    select i.role into invite_role
    from public.invites i
    where lower(i.email) = lower(v_email) and i.accepted_at is null
    order by i.created_at desc
    limit 1;
  end if;

  insert into public.profiles (id, display_name, role, phone)
  values (
    new.id,
    v_display,
    coalesce(invite_role, 'player'),
    case when v_resolved_phone ~ '^\+[1-9][0-9]{6,14}$' then v_resolved_phone end
  );

  if v_email is not null then
    update public.invites
       set accepted_at = now(), accepted_by = new.id
     where lower(email) = lower(v_email) and accepted_at is null;
  end if;

  return new;
end;
$$;

-- Auto-link by email OR phone. The previous version only handled email
-- so phone-only invitees never got their roster row linked at signup.
create or replace function public.link_player_rows_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  -- Email match (legacy path, unchanged).
  if new.email is not null then
    update public.tournament_players
       set profile_id = new.id
     where profile_id is null
       and lower(email) = lower(new.email);
  end if;

  -- Phone match. Look up the just-created profile's phone (or derive it
  -- from a synth email if it's still null — handle_new_user runs before
  -- this trigger but the update may not have committed yet).
  select p.phone into v_phone from public.profiles p where p.id = new.id;
  if v_phone is null
     and new.email is not null
     and new.email ~ '^[1-9][0-9]{6,14}@phone\.local$' then
    v_phone := '+' || split_part(new.email, '@', 1);
  end if;
  if v_phone is not null then
    update public.tournament_players
       set profile_id = new.id
     where profile_id is null
       and phone = v_phone;
  end if;

  -- Member row for every tournament we just linked them to.
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

-- Backfill: profiles whose phone is null but whose synth email tells us
-- what it should be.
update public.profiles p
   set phone = '+' || split_part(u.email, '@', 1)
  from auth.users u
 where p.id = u.id
   and p.phone is null
   and u.email ~ '^[1-9][0-9]{6,14}@phone\.local$';

-- Backfill: tournament_players rows that should be linked by phone but
-- aren't, because the user signed up before this migration. Link the
-- rows AND insert the matching member rows in one sweep.
with linked as (
  update public.tournament_players tp
     set profile_id = p.id
    from public.profiles p
   where tp.profile_id is null
     and tp.phone is not null
     and p.phone = tp.phone
  returning tp.tournament_id, p.id as user_id
)
insert into public.tournament_members (tournament_id, user_id, role)
select distinct tournament_id, user_id, 'player' from linked
on conflict (tournament_id, user_id) do nothing;
