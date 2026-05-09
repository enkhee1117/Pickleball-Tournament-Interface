-- Re-issue app_create_tournament with predictable placeholder names that
-- carry gender info when the tournament is mixed/same.
--
-- The legacy placeholders were realistic but ungendered ("Alex Rivera",
-- "Jordan Lee", ...), which broke testing for mixed-doubles tournaments —
-- the manager had to manually open every row and tag M/F before generation
-- could balance teams.
--
-- New scheme:
--   open:  "Player 1", "Player 2", ... — gender stays null.
--   mixed: alternate "Male 1", "Female 1", "Male 2", "Female 2", ...
--          and seed gender = 'm'/'f' inline so balanced pairing works on
--          first generation.
--   same:  first half "Male N", second half "Female N", same gender stamping.
--
-- DUPR is still seeded at 3.200 so the balanced/snake generator has a
-- deterministic baseline.

set search_path = public;

drop function if exists public.app_create_tournament(text, text, text, int, text, text);
create or replace function public.app_create_tournament(
  p_name text,
  p_format text,
  p_whatsapp_group_url text,
  p_player_count int,
  p_gender_mode text default 'open',
  p_pairing_mode text default 'random'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := public.app_require_auth();
  v_name    text := trim(coalesce(p_name, ''));
  v_format  text := coalesce(nullif(trim(p_format), ''), 'round_robin');
  v_url     text := nullif(trim(coalesce(p_whatsapp_group_url, '')), '');
  v_count   int  := greatest(0, least(coalesce(p_player_count, 0), 64));
  v_gender_mode text := lower(trim(coalesce(p_gender_mode, 'open')));
  v_pairing text := lower(trim(coalesce(p_pairing_mode, 'random')));
  new_id    uuid;
  v_male_cap int;
begin
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'tournament name must be 3-120 characters' using errcode = '22023';
  end if;
  if v_format not in ('round_robin', 'fixed_partners', 'bracket') then
    raise exception 'unknown format %', v_format using errcode = '22023';
  end if;
  if v_url is not null and v_url not like 'https://chat.whatsapp.com/%' then
    raise exception 'invalid WhatsApp group URL' using errcode = '22023';
  end if;
  if v_gender_mode not in ('open', 'mixed', 'same') then
    raise exception 'unknown gender_mode' using errcode = '22023';
  end if;
  if v_pairing not in ('random', 'balanced', 'snake') then
    raise exception 'unknown pairing_mode' using errcode = '22023';
  end if;

  insert into public.tournaments (owner_user_id, name, format, whatsapp_group_url, gender_mode, pairing_mode)
  values (uid, v_name, v_format, v_url, v_gender_mode, v_pairing)
  returning id into new_id;

  if v_count > 0 then
    if v_gender_mode = 'mixed' then
      -- Alternate Male/Female so even player_counts produce a balanced roster
      -- ready for mixed-doubles balancing on first generation.
      insert into public.tournament_players (tournament_id, display_name, gender, dupr)
      select
        new_id,
        case when (gs.n % 2) = 1
          then 'Male ' || ((gs.n + 1) / 2)::text
          else 'Female ' || (gs.n / 2)::text
        end,
        case when (gs.n % 2) = 1 then 'm' else 'f' end,
        3.200
      from generate_series(1, v_count) as gs(n);
    elsif v_gender_mode = 'same' then
      -- Half male, half female so the same-gender matchmaker has both
      -- pools to work with. Odd counts give the extra slot to males.
      v_male_cap := (v_count + 1) / 2;
      insert into public.tournament_players (tournament_id, display_name, gender, dupr)
      select
        new_id,
        case when gs.n <= v_male_cap
          then 'Male ' || gs.n::text
          else 'Female ' || (gs.n - v_male_cap)::text
        end,
        case when gs.n <= v_male_cap then 'm' else 'f' end,
        3.200
      from generate_series(1, v_count) as gs(n);
    else
      -- Open: gender stays null, generic Player N.
      insert into public.tournament_players (tournament_id, display_name, dupr)
      select new_id, 'Player ' || gs.n::text, 3.200
      from generate_series(1, v_count) as gs(n);
    end if;
  end if;

  return new_id;
end;
$$;

revoke all on function public.app_create_tournament(text, text, text, int, text, text) from public;
grant execute on function public.app_create_tournament(text, text, text, int, text, text) to authenticated;
