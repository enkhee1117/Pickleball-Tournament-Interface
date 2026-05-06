-- Mixed-doubles round robin generation needs to know each player's gender
-- so the random partner shuffle pairs male+female on every team. Until now
-- the wizard's "rr-mixed" / "fp-mixed" formats collapsed to plain
-- 'round_robin' / 'fixed_partners' at the DB level and the generator
-- shuffled blind, so a "mixed" tournament could end up with two male-male
-- teams in the same game.
--
-- Two new columns:
--   tournament_players.gender   ('m' | 'f' | 'x' | null) — per-player
--   tournaments.gender_mode     ('open' | 'mixed' | 'same') — drives
--                               generator behaviour.
--
-- 'open' (default) keeps the previous random-shuffle behaviour. 'mixed'
-- enforces 1M+1F per team. 'same' enforces same-gender per team.

set search_path = public;

alter table public.tournament_players
  add column if not exists gender text;

alter table public.tournament_players
  drop constraint if exists tournament_players_gender_chk;
alter table public.tournament_players
  add constraint tournament_players_gender_chk
  check (gender is null or gender in ('m', 'f', 'x'));

alter table public.tournaments
  add column if not exists gender_mode text not null default 'open';

alter table public.tournaments
  drop constraint if exists tournaments_gender_mode_chk;
alter table public.tournaments
  add constraint tournaments_gender_mode_chk
  check (gender_mode in ('open', 'mixed', 'same'));

-- ---------------------------------------------------------------------------
-- Bump app_create_tournament_minimal so the wizard can pass the mode at
-- creation time. Keep the old signature working (default 'open') so any
-- callers we forgot still compile.
-- ---------------------------------------------------------------------------
drop function if exists public.app_create_tournament_minimal(text, text, text, int, text);
create or replace function public.app_create_tournament_minimal(
  p_name text,
  p_format text,
  p_whatsapp_group_url text default null,
  p_player_count int default 0,
  p_gender_mode text default 'open'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_name text := trim(coalesce(p_name, ''));
  v_url text := nullif(trim(coalesce(p_whatsapp_group_url, '')), '');
  v_format text := lower(trim(coalesce(p_format, '')));
  v_count int := greatest(0, least(coalesce(p_player_count, 0), 200));
  v_mode text := lower(trim(coalesce(p_gender_mode, 'open')));
  v_id uuid;
  v_seq int;
begin
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'tournament name must be 3-120 characters' using errcode = '22023';
  end if;
  if v_format not in ('round_robin', 'fixed_partners', 'bracket') then
    raise exception 'unknown format' using errcode = '22023';
  end if;
  if v_url is not null and v_url not like 'https://chat.whatsapp.com/%' then
    raise exception 'invalid WhatsApp group URL' using errcode = '22023';
  end if;
  if v_mode not in ('open', 'mixed', 'same') then
    raise exception 'unknown gender_mode' using errcode = '22023';
  end if;

  insert into public.tournaments (owner_user_id, name, format, whatsapp_group_url, gender_mode)
    values (uid, v_name, v_format, v_url, v_mode)
    returning id into v_id;

  insert into public.tournament_members (tournament_id, user_id, role)
    values (v_id, uid, 'owner');

  if v_count > 0 then
    for v_seq in 1..v_count loop
      insert into public.tournament_players (tournament_id, display_name)
        values (v_id, public.placeholder_player_name(v_seq));
    end loop;
  end if;

  return v_id;
end;
$$;

revoke all on function public.app_create_tournament_minimal(text, text, text, int, text) from public;
grant execute on function public.app_create_tournament_minimal(text, text, text, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Update player setter so the manager can assign a gender from the roster
-- editor. Combine into the existing app_update_tournament_player so the
-- client only has one RPC to call.
-- ---------------------------------------------------------------------------
drop function if exists public.app_update_tournament_player(uuid, text, text);
drop function if exists public.app_update_tournament_player(uuid, text, text, text);
create or replace function public.app_update_tournament_player(
  p_player_id uuid,
  p_display_name text,
  p_email text default null,
  p_gender text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_old_name text;
  v_new_name text := trim(coalesce(p_display_name, ''));
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_gender text := nullif(lower(trim(coalesce(p_gender, ''))), '');
begin
  if v_gender is not null and v_gender not in ('m', 'f', 'x') then
    raise exception 'gender must be m, f, x, or null' using errcode = '22023';
  end if;

  select tp.tournament_id, tp.display_name
    into v_tournament_id, v_old_name
    from public.tournament_players tp
   where tp.id = p_player_id;
  if v_tournament_id is null then
    raise exception 'player not found' using errcode = '02000';
  end if;
  perform public.app_require_tournament_manager(v_tournament_id);

  if length(v_new_name) < 2 or length(v_new_name) > 120 then
    raise exception 'display name must be 2-120 characters' using errcode = '22023';
  end if;

  update public.tournament_players
     set display_name = v_new_name,
         email = v_email,
         gender = v_gender
   where id = p_player_id;

  if v_old_name is distinct from v_new_name then
    update public.matches m
       set team_a_label = public.relabel_team(m.team_a_label, v_old_name, v_new_name),
           team_b_label = public.relabel_team(m.team_b_label, v_old_name, v_new_name)
     where m.tournament_id = v_tournament_id
       and (m.team_a_label like '%' || v_old_name || '%'
         or m.team_b_label like '%' || v_old_name || '%');
  end if;

  return p_player_id;
end;
$$;

revoke all on function public.app_update_tournament_player(uuid, text, text, text) from public;
grant execute on function public.app_update_tournament_player(uuid, text, text, text) to authenticated;
