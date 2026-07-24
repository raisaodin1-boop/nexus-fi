-- Fix tontine members/contributions visibility for all group members (not just owner)
-- + normalize rotation positions for existing tontines

drop policy if exists "tontine_members_select" on public.tontine_members;
create policy "tontine_members_select" on public.tontine_members
  for select to authenticated using (
    public.is_tontine_member(tontine_id)
    or public.is_tontine_owner(tontine_id)
  );

drop policy if exists "tontine_contributions_select" on public.tontine_contributions;
create policy "tontine_contributions_select" on public.tontine_contributions
  for select to authenticated using (
    public.is_tontine_member(tontine_id)
    or public.is_tontine_owner(tontine_id)
  );

-- Backfill rotation order (1..n by join date) when missing or all identical
do $$
declare
  r record;
  m record;
  i int;
begin
  for r in
    select tontine_id
    from public.tontine_members
    group by tontine_id
    having count(*) filter (where rotation_position is null or rotation_position <= 0) > 0
       or count(distinct rotation_position) < count(*)
  loop
    i := 0;
    for m in
      select id from public.tontine_members
      where tontine_id = r.tontine_id and coalesce(status, 'a_jour') <> 'exclu'
      order by joined_at nulls last, id
    loop
      i := i + 1;
      update public.tontine_members set rotation_position = i where id = m.id;
    end loop;
  end loop;
end $$;
