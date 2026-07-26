-- Message attachments + ensure co-members can always see the roster.

alter table public.messages
  add column if not exists attachment_paths text[] not null default '{}';

alter table public.messages
  drop constraint if exists messages_attachments_max;

alter table public.messages
  add constraint messages_attachments_max check (cardinality(attachment_paths) <= 5);

comment on column public.messages.attachment_paths is
  'Private storage paths in message-attachments bucket (images/PDF).';

-- Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

drop policy if exists "message_attachments_select" on storage.objects;
create policy "message_attachments_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1 from public.messages m
        where m.attachment_paths @> array[name]
          and (
            m.sender_id = auth.uid()
            or m.recipient_id = auth.uid()
            or (m.message_type = 'tontine' and public.is_tontine_member(m.tontine_id))
          )
      )
    )
  );

drop policy if exists "message_attachments_insert" on storage.objects;
create policy "message_attachments_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Contacts for a tontine: manager + platform admin (for member inbox CTAs)
create or replace function public.get_tontine_message_contacts(p_tontine_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tontines%rowtype;
  v_manager_id uuid;
  v_manager_name text;
  v_admin_id uuid;
  v_admin_name text;
  v_members jsonb;
begin
  if v_uid is null then raise exception 'Non authentifié.'; end if;

  select * into v_t from public.tontines where id = p_tontine_id;
  if v_t.id is null then raise exception 'Tontine introuvable.'; end if;

  if not (
    public.is_tontine_member(p_tontine_id)
    or public.is_tontine_owner(p_tontine_id)
    or public.is_admin()
  ) then
    raise exception 'Réservé aux membres de la tontine.';
  end if;

  v_manager_id := v_t.owner_id;
  if v_manager_id is null then
    select user_id into v_manager_id
    from public.tontine_members
    where tontine_id = p_tontine_id and role = 'admin'
    order by joined_at nulls last
    limit 1;
  end if;

  select full_name into v_manager_name from public.profiles where id = v_manager_id;

  select id, full_name into v_admin_id, v_admin_name
  from public.profiles
  where role in ('admin', 'super_admin')
  order by case when role = 'super_admin' then 0 else 1 end, created_at
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', m.user_id,
      'full_name', coalesce(p.full_name, 'Membre'),
      'role', m.role,
      'status', m.status,
      'rotation_position', m.rotation_position,
      'is_manager', (m.user_id = v_manager_id or m.role = 'admin'),
      'kyc_verified', coalesce(p.kyc_status in ('approved', 'verified'), false)
    )
    order by
      case when m.user_id = v_manager_id or m.role = 'admin' then 0 else 1 end,
      m.rotation_position nulls last,
      p.full_name
  ), '[]'::jsonb)
  into v_members
  from public.tontine_members m
  left join public.profiles p on p.id = m.user_id
  where m.tontine_id = p_tontine_id
    and coalesce(m.status, 'a_jour') <> 'exclu';

  return jsonb_build_object(
    'tontine_id', p_tontine_id,
    'tontine_name', v_t.name,
    'manager', case when v_manager_id is null then null else jsonb_build_object(
      'id', v_manager_id,
      'full_name', coalesce(v_manager_name, 'Gestionnaire')
    ) end,
    'platform_admin', case when v_admin_id is null then null else jsonb_build_object(
      'id', v_admin_id,
      'full_name', coalesce(v_admin_name, 'Admin HODIX')
    ) end,
    'members', v_members
  );
end;
$$;

revoke all on function public.get_tontine_message_contacts(uuid) from public;
grant execute on function public.get_tontine_message_contacts(uuid) to authenticated;
