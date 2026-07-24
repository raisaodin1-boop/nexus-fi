-- Align promotion_requests admin RLS with public.is_admin()

drop policy if exists "promotion_requests_admin_all" on public.promotion_requests;
create policy "promotion_requests_admin_all" on public.promotion_requests
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
