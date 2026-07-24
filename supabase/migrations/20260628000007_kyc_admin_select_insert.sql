-- Admin can read/insert all KYC submissions (dashboard + approve orphan profiles)

drop policy if exists "kyc_submissions_admin_select" on public.kyc_submissions;
create policy "kyc_submissions_admin_select" on public.kyc_submissions
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "kyc_submissions_admin_insert" on public.kyc_submissions;
create policy "kyc_submissions_admin_insert" on public.kyc_submissions
  for insert to authenticated
  with check (public.is_admin());

update public.profiles set kyc_status = 'pending_review' where kyc_status = 'pending';
