-- Bump app_create_tournament (the version the wizard actually calls) to
-- accept gender_mode. Migration 0023 added gender_mode to a sibling RPC
-- (app_create_tournament_minimal) but the wizard hits this one.

set search_path = public;

drop function if exists public.app_create_tournament(text, text, text, int);
drop function if exists public.app_create_tournament(text, text, text, int, text);
create or replace function public.app_create_tournament(
  p_name text,
  p_format text,
  p_whatsapp_group_url text,
  p_player_count int,
  p_gender_mode text default 'open'
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
  v_mode    text := lower(trim(coalesce(p_gender_mode, 'open')));
  new_id    uuid;
  v_names   text[] := ARRAY[
    'Alex Rivera','Jordan Lee','Sam Patel','Casey Kim','Morgan Chen',
    'Taylor Nguyen','Blake Santos','Quinn Hernandez','Avery Ramirez','Drew Flores',
    'Jamie Torres','Reese Diaz','Parker Morales','Skyler Reyes','Cameron Ortiz',
    'Dakota Gutierrez','Hayden Vargas','Sage Castro','River Romero','Emery Mendez',
    'Phoenix Alvarez','Logan Banks','Finley Webb','Harper Stone','Oakley Brooks',
    'Elliot Hayes','Monroe Reid','Rowan Cole','Emerson Ward','Sloane Grant',
    'Kendall Holt','Lennon Fox','Marlowe Hunt','Sutton Day','Caspian Marsh',
    'Indigo Lane','Wren Park','Cypress Bell','Juniper Cross','Arlo Shaw',
    'Bodhi Walsh','Zara Quinn','Milo Sterling','Nova King','Leo Mercer',
    'Isla Tran','Eli Carr','Vera Nash','Kai Hammond','Ada Monroe',
    'Ivan Frost','Lena York','Hugo Steele','Mila Pierce','Theo Vance',
    'Nora Blake','Felix Cannon','Cora Bright','Oscar Page','Luna Hale',
    'Miles Knox','Iris West','Jude Hart','Violet Ray','Finn Moss',
    'Hazel Snow','Asher Lynn','Ruby Dale','Atticus Green','Stella Ford'
  ];
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
  if v_mode not in ('open', 'mixed', 'same') then
    raise exception 'unknown gender_mode' using errcode = '22023';
  end if;

  insert into public.tournaments (owner_user_id, name, format, whatsapp_group_url, gender_mode)
  values (uid, v_name, v_format, v_url, v_mode)
  returning id into new_id;

  if v_count > 0 then
    insert into public.tournament_players (tournament_id, display_name)
    select
      new_id,
      v_names[(((row_number() over (order by random())) - 1) % array_length(v_names, 1) + 1)::int]
    from generate_series(1, v_count);
  end if;

  return new_id;
end;
$$;

revoke all on function public.app_create_tournament(text, text, text, int, text) from public;
grant execute on function public.app_create_tournament(text, text, text, int, text) to authenticated;
