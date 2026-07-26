-- Ensure admins can always read diaspora enrollments (explicit policy refresh).
-- Visibility bug was mainly UX (Control Center had no enrollment inbox); keep RLS explicit.

drop policy if exists "diaspora_enrollment_own" on public.diaspora_enrollments;
create policy "diaspora_enrollment_own" on public.diaspora_enrollments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
  );

drop policy if exists "diaspora_enrollment_update" on public.diaspora_enrollments;
create policy "diaspora_enrollment_update" on public.diaspora_enrollments
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
  )
  with check (
    user_id = (select auth.uid())
    or public.is_admin()
  );
