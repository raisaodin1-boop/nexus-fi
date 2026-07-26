-- Direct messages: members may only DM HODIX admins or managers of a shared tontine.
-- Managers / admins may still DM their members. No member ↔ member DMs.

create or replace function public.can_direct_message(p_sender uuid, p_recipient uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Callers may only evaluate their own send permission (admins may probe any pair).
  if (select auth.uid()) is null then
    return false;
  end if;
  if p_sender is distinct from (select auth.uid()) and not public.is_admin() then
    return false;
  end if;

  if p_sender is null or p_recipient is null or p_sender = p_recipient then
    return false;
  end if;

  if exists (
    select 1 from public.profiles s
    where s.id = p_sender and s.role in ('admin', 'super_admin')
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.profiles r
    where r.id = p_recipient and r.role in ('admin', 'super_admin')
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.tontine_members sm
    join public.tontine_members rm
      on rm.tontine_id = sm.tontine_id
     and rm.user_id = p_recipient
    join public.tontines t on t.id = sm.tontine_id
    where sm.user_id = p_sender
      and coalesce(sm.status, 'a_jour') is distinct from 'exclu'
      and coalesce(rm.status, 'a_jour') is distinct from 'exclu'
      and (
        t.owner_id in (p_sender, p_recipient)
        or coalesce(sm.role, 'member') = 'admin'
        or coalesce(rm.role, 'member') = 'admin'
      )
  );
end;
$$;

comment on function public.can_direct_message(uuid, uuid) is
  'True when sender may start/continue a direct message with recipient (admin HODIX or shared-tontine manager/member).';

revoke all on function public.can_direct_message(uuid, uuid) from public;
grant execute on function public.can_direct_message(uuid, uuid) to authenticated;

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      (message_type = 'broadcast' and public.is_admin())
      or (message_type = 'tontine' and public.is_tontine_member(tontine_id))
      or (
        message_type = 'direct'
        and recipient_id is not null
        and recipient_id <> (select auth.uid())
        and public.can_direct_message((select auth.uid()), recipient_id)
      )
    )
  );
