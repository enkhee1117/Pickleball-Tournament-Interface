-- Match recording URLs.
--
-- Organizers (and players in the match) can attach a recording link to a
-- completed match — typically a YouTube video. A column lives on matches so
-- the scoreboard, the public /t/[code] preview, and standings rows can show
-- a watch icon next to the FINAL chip.
--
-- Validation: 8 KB cap on the URL string and a simple http(s)://... shape
-- check at the RPC level. The matches RLS policy already restricts who can
-- read the row; we just gate writes via app_require_match_scorer (so a
-- player in the match can post the link too, not just the organizer).

set search_path = public;

alter table public.matches
  add column if not exists recording_url text;

alter table public.matches
  add constraint matches_recording_url_length_chk
  check (recording_url is null or length(recording_url) <= 8192);

create or replace function public.app_set_match_recording(
  p_match_id uuid,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  perform public.app_require_match_scorer(p_match_id);

  if v_url is not null then
    if length(v_url) > 8192 then
      raise exception 'recording url too long' using errcode = '22023';
    end if;
    if v_url !~* '^https?://[a-z0-9._~:/?#\[\]@!$&''()*+,;=%-]+$' then
      raise exception 'recording url must start with http:// or https://'
        using errcode = '22023';
    end if;
  end if;

  update public.matches
     set recording_url = v_url
   where id = p_match_id;
end;
$$;

revoke all on function public.app_set_match_recording(uuid, text) from public;
grant execute on function public.app_set_match_recording(uuid, text) to authenticated;
