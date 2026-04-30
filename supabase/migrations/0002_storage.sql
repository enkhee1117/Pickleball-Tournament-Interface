-- Avatar storage bucket — public read, authenticated write to own folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Path convention: {user_id}/{filename}
create policy "avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload to their own avatar folder"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users update their own avatars"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users delete their own avatars"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
