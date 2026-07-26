-- Profile photo + completion gate: photo_url, avatar kind, reminder timestamp, public avatars bucket.

alter table public.profiles
  add column if not exists photo_url text;

alter table public.profiles
  add column if not exists avatar_kind text;

alter table public.profiles
  add column if not exists profile_reminder_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_kind_check'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_kind_check
      check (avatar_kind is null or avatar_kind in ('real', 'generic'));
  end if;
end $$;

comment on column public.profiles.photo_url is
  'Public Storage URL for a real photo, or generic:{id} for a preset avatar.';
comment on column public.profiles.avatar_kind is
  'real = uploaded photo; generic = preset avatar. AI-generated photos are rejected client-side.';
comment on column public.profiles.profile_reminder_sent_at is
  'Last time the user was reminded to complete phone / city / occupation / avatar.';

-- Public avatars bucket (members need to see each others photos in directories)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
