-- KYC documentaire + bucket Storage privé

alter table public.kyc_submissions add column if not exists id_type text;
alter table public.kyc_submissions add column if not exists country_code text;
alter table public.kyc_submissions add column if not exists id_front_path text;
alter table public.kyc_submissions add column if not exists id_back_path text;
alter table public.kyc_submissions add column if not exists selfie_path text;
alter table public.kyc_submissions add column if not exists provider text default 'smile_id';
alter table public.kyc_submissions add column if not exists provider_job_id text;
alter table public.kyc_submissions add column if not exists provider_result jsonb;
alter table public.kyc_submissions add column if not exists verification_mode text;

-- Bucket privé pour pièces d'identité (5 Mo max, images uniquement)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-documents',
  'kyc-documents',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- L'utilisateur peut lire/écrire uniquement dans son dossier {user_id}/*
drop policy if exists "kyc_docs_select_own" on storage.objects;
create policy "kyc_docs_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "kyc_docs_insert_own" on storage.objects;
create policy "kyc_docs_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "kyc_docs_update_own" on storage.objects;
create policy "kyc_docs_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "kyc_docs_delete_own" on storage.objects;
create policy "kyc_docs_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- Admin : lecture des documents KYC (service role bypass RLS ; policy pour rôle admin)
drop policy if exists "kyc_submissions_admin_select" on public.kyc_submissions;
create policy "kyc_submissions_admin_select" on public.kyc_submissions
  for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );
