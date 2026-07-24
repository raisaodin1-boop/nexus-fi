-- KYC schema completeness: colonnes profil + soumissions + accès admin documents

alter table public.profiles add column if not exists occupation text;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists phone text;

alter table public.kyc_submissions add column if not exists submitted_at timestamptz;
alter table public.kyc_submissions add column if not exists reviewed_at timestamptz;
alter table public.kyc_submissions add column if not exists rejection_reason text;
alter table public.kyc_submissions add column if not exists id_type text;
alter table public.kyc_submissions add column if not exists country_code text;
alter table public.kyc_submissions add column if not exists id_front_path text;
alter table public.kyc_submissions add column if not exists id_back_path text;
alter table public.kyc_submissions add column if not exists selfie_path text;
alter table public.kyc_submissions add column if not exists verification_mode text;
alter table public.kyc_submissions add column if not exists provider text;

drop policy if exists "kyc_docs_admin_select" on storage.objects;
create policy "kyc_docs_admin_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );
