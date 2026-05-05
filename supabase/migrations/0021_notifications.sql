-- Per-user in-app notifications.
--
-- First use case: when a match recording is posted, every player linked to
-- either team gets a notification with a link to the match page so they can
-- watch the replay. The notification lives in a small table; UI surfaces it
-- on /history as a dismissible strip.
--
-- The set-recording RPC fans out the inserts in the same SECURITY DEFINER
-- transaction so RLS doesn't have to permit cross-user writes elsewhere.

set search_path = public;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  body jsonb not null default '{}',
  link_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_user_recent_idx
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "users read their notifications" on public.notifications;
create policy "users read their notifications"
  on public.notifications for select
  using (user_id = (select auth.uid()));

drop policy if exists "users update their notifications" on public.notifications;
create policy "users update their notifications"
  on public.notifications for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "users delete their notifications" on public.notifications;
create policy "users delete their notifications"
  on public.notifications for delete
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Recreate app_set_match_recording so that it fans out notifications to
-- every other linked player on either team in the match. Body is the same
-- as 0018 plus the insert at the end.
-- ---------------------------------------------------------------------------
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
  uid uuid;
  v_url text := nullif(trim(coalesce(p_url, '')), '');
  v_tournament_id uuid;
  v_team_a text;
  v_team_b text;
  v_round text;
  v_court text;
  v_match_player_names text[];
  v_was_set_before boolean;
begin
  perform public.app_require_match_scorer(p_match_id);
  uid := (select auth.uid());

  if v_url is not null then
    if length(v_url) > 8192 then
      raise exception 'recording url too long' using errcode = '22023';
    end if;
    if v_url !~* '^https?://[a-z0-9._~:/?#\[\]@!$&''()*+,;=%-]+$' then
      raise exception 'recording url must start with http:// or https://'
        using errcode = '22023';
    end if;
  end if;

  select tournament_id, team_a_label, team_b_label, round_label, court_label,
         recording_url is not null
    into v_tournament_id, v_team_a, v_team_b, v_round, v_court, v_was_set_before
    from public.matches where id = p_match_id;

  update public.matches
     set recording_url = v_url
   where id = p_match_id;

  -- Only notify when a NEW recording is being added. Editing an existing
  -- one or clearing it doesn't fan out a fresh notification.
  if v_url is not null and not v_was_set_before then
    v_match_player_names :=
      regexp_split_to_array(coalesce(v_team_a, ''), '\s*&\s*|\s*/\s*')
      || regexp_split_to_array(coalesce(v_team_b, ''), '\s*&\s*|\s*/\s*');

    insert into public.notifications (user_id, kind, body, link_url)
    select tp.profile_id,
           'match_recording_added',
           jsonb_build_object(
             'match_id', p_match_id,
             'tournament_id', v_tournament_id,
             'team_a_label', v_team_a,
             'team_b_label', v_team_b,
             'round_label', v_round,
             'court_label', v_court,
             'recording_url', v_url
           ),
           '/tournaments/' || v_tournament_id::text || '/match/' || p_match_id::text
      from public.tournament_players tp
     where tp.tournament_id = v_tournament_id
       and tp.profile_id is not null
       and tp.profile_id <> uid
       and tp.display_name = any(v_match_player_names);
  end if;
end;
$$;

revoke all on function public.app_set_match_recording(uuid, text) from public;
grant execute on function public.app_set_match_recording(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Mark every unread notification for the caller as read. Returns the count.
-- ---------------------------------------------------------------------------
create or replace function public.app_mark_all_notifications_read()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.app_require_auth();
  v_count int;
begin
  update public.notifications
     set read_at = now()
   where user_id = uid and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.app_mark_all_notifications_read() from public;
grant execute on function public.app_mark_all_notifications_read() to authenticated;
