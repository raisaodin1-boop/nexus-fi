-- Admin KYC review: lecture documents Storage + motif de rejet

alter table public.kyc_submissions add column if not exists rejection_reason text;

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
