-- Allow all tontine members to read the public contributions list.
drop policy if exists "tontine_contributions_select" on public.tontine_contributions;
create policy "tontine_contributions_select" on public.tontine_contributions for select to authenticated using (
  user_id = auth.uid()
  or public.is_tontine_owner(tontine_id)
  or public.is_tontine_member(tontine_id)
);

-- Keep contribution_amount in sync with amount_per_cycle for legacy rows.
update public.tontines
set contribution_amount = amount_per_cycle
where (contribution_amount is null or contribution_amount = 0)
  and amount_per_cycle is not null
  and amount_per_cycle > 0;
