-- Admin KYC write access + realtime sync for admin dashboard

drop policy if exists "kyc_submissions_admin_update" on public.kyc_submissions;
create policy "kyc_submissions_admin_update" on public.kyc_submissions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "kyc_submissions_admin_delete" on public.kyc_submissions;
create policy "kyc_submissions_admin_delete" on public.kyc_submissions
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "kyc_docs_admin_select" on storage.objects;
create policy "kyc_docs_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc-documents' and public.is_admin());

do $$ begin
  alter publication supabase_realtime add table public.kyc_submissions;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.tontines;
exception when duplicate_object then null;
end $$;
