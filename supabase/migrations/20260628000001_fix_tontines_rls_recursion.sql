-- Break RLS circular dependency between tontines <-> tontine_members.
-- Policies that subquery each other cause: "infinite recursion detected in policy for relation tontines".

create or replace function public.is_tontine_owner(p_tontine_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tontines
    where id = p_tontine_id and owner_id = auth.uid()
  );
$$;

create or replace function public.is_tontine_member(p_tontine_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tontine_members
    where tontine_id = p_tontine_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_tontine_owner(uuid) from public, anon;
revoke all on function public.is_tontine_member(uuid) from public, anon;
grant execute on function public.is_tontine_owner(uuid) to authenticated;
grant execute on function public.is_tontine_member(uuid) to authenticated;

drop policy if exists "tontines_select" on public.tontines;
create policy "tontines_select" on public.tontines for select to authenticated using (
  is_public = true
  or owner_id = auth.uid()
  or public.is_tontine_member(id)
);

drop policy if exists "tontines_insert" on public.tontines;
create policy "tontines_insert" on public.tontines for insert to authenticated with check (
  auth.uid() = owner_id
);

drop policy if exists "tontine_members_select" on public.tontine_members;
create policy "tontine_members_select" on public.tontine_members for select to authenticated using (
  user_id = auth.uid()
  or public.is_tontine_owner(tontine_id)
);

drop policy if exists "tontine_members_insert" on public.tontine_members;
create policy "tontine_members_insert" on public.tontine_members for insert to authenticated with check (
  public.is_tontine_owner(tontine_id)
  or (user_id = auth.uid() and coalesce(role, 'member') = 'member')
);

drop policy if exists "tontine_contributions_select" on public.tontine_contributions;
create policy "tontine_contributions_select" on public.tontine_contributions for select to authenticated using (
  user_id = auth.uid()
  or public.is_tontine_owner(tontine_id)
);
