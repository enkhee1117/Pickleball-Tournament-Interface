-- Tournament cover image: optional banner for the scoreboard / public
-- invite page. Manager-only upload + set, public read.
--
-- Path convention: tournament-covers/{tournament_id}/cover-{timestamp}.{ext}
-- The path is keyed off tournament_id so storage policies can verify the
-- caller is a manager of THAT tournament before allowing writes.

set search_path = public;

alter table public.tournaments
  add column if not exists cover_image_url text;

-- Bucket creation. Public read so the SSR'd OG image / public scoreboard
-- can render it without signing.
insert into storage.buckets (id, name, public)
values ('tournament-covers', 'tournament-covers', true)
on conflict (id) do nothing;

-- Public read.
drop policy if exists "tournament covers are publicly readable" on storage.objects;
create policy "tournament covers are publicly readable"
  on storage.objects for select
  using (bucket_id = 'tournament-covers');

-- Helper: caller must be a manager of the tournament whose id appears as
-- the first folder segment in the storage path.
create or replace function public.app_can_write_tournament_cover(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = (split_part(p_path, '/', 1))::uuid
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'organizer')
  )
$$;

revoke all on function public.app_can_write_tournament_cover(text) from public;
grant execute on function public.app_can_write_tournament_cover(text) to authenticated;

drop policy if exists "managers upload tournament covers" on storage.objects;
create policy "managers upload tournament covers"
  on storage.objects for insert
  with check (
    bucket_id = 'tournament-covers'
    and public.app_can_write_tournament_cover(name)
  );

drop policy if exists "managers update tournament covers" on storage.objects;
create policy "managers update tournament covers"
  on storage.objects for update
  using (
    bucket_id = 'tournament-covers'
    and public.app_can_write_tournament_cover(name)
  );

drop policy if exists "managers delete tournament covers" on storage.objects;
create policy "managers delete tournament covers"
  on storage.objects for delete
  using (
    bucket_id = 'tournament-covers'
    and public.app_can_write_tournament_cover(name)
  );

-- Server-side setter so the URL update goes through a manager check
-- without depending on RLS on tournaments (which is currently permissive
-- for managers via direct UPDATE — the RPC is just a clean call site).
create or replace function public.app_set_tournament_cover(
  p_tournament_id uuid,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_require_tournament_manager(p_tournament_id);

  if p_url is not null and p_url not like 'https://%' then
    raise exception 'cover URL must be https://' using errcode = '22023';
  end if;

  update public.tournaments
     set cover_image_url = nullif(trim(coalesce(p_url, '')), '')
   where id = p_tournament_id;
end;
$$;

revoke all on function public.app_set_tournament_cover(uuid, text) from public;
grant execute on function public.app_set_tournament_cover(uuid, text) to authenticated;
