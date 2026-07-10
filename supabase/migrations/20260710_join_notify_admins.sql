-- Notify all platform admins on tontine join requests + return requester_id on respond

create or replace function public.request_join_tontine(p_tontine_id uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tontines%rowtype;
  v_id uuid;
  v_count int;
  v_admin record;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  select * into v_t from public.tontines where id = p_tontine_id;
  if v_t.id is null then raise exception 'Tontine introuvable'; end if;
  if not coalesce(v_t.is_public, false) then
    raise exception 'Cette tontine est privée — utilisez un code d''invitation';
  end if;
  if coalesce(v_t.is_active, true) is false then
    raise exception 'Cette tontine n''est plus active';
  end if;

  if exists (
    select 1 from public.tontine_members
    where tontine_id = p_tontine_id and user_id = v_uid
  ) then
    raise exception 'Vous êtes déjà membre de cette tontine';
  end if;

  select count(*)::int into v_count
  from public.tontine_members
  where tontine_id = p_tontine_id and coalesce(status, '') <> 'exclu';

  if v_t.max_members is not null and v_count >= v_t.max_members then
    raise exception 'La tontine est complète';
  end if;

  insert into public.tontine_join_requests (tontine_id, requester_id, message, status)
  values (p_tontine_id, v_uid, nullif(trim(coalesce(p_message, '')), ''), 'pending')
  on conflict (tontine_id, requester_id) do update
    set status = 'pending',
        message = excluded.message,
        reviewed_by = null,
        reviewed_at = null,
        created_at = now()
  returning id into v_id;

  -- Notify owner
  if v_t.owner_id is not null then
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_t.owner_id,
      'Demande d''adhésion',
      'Quelqu''un souhaite rejoindre « ' || v_t.name || ' ».',
      'join_request',
      jsonb_build_object(
        'tontine_id', p_tontine_id,
        'request_id', v_id,
        'requester_id', v_uid,
        'group_type', 'tontine'
      )
    );
  end if;

  -- Also notify platform admins (owner may be a seed account; admin console must see requests)
  for v_admin in
    select id from public.profiles
    where role in ('admin', 'super_admin')
      and id is distinct from v_t.owner_id
  loop
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_admin.id,
      'Demande d''adhésion tontine',
      'Nouvelle demande pour « ' || v_t.name || ' ».',
      'join_request',
      jsonb_build_object(
        'tontine_id', p_tontine_id,
        'request_id', v_id,
        'requester_id', v_uid,
        'group_type', 'tontine'
      )
    );
  end loop;

  insert into public.notifications (user_id, title, body, type, metadata)
  values (
    v_uid,
    'Demande envoyée',
    'Votre demande pour « ' || v_t.name || ' » a été transmise au manager.',
    'join_request_sent',
    jsonb_build_object('tontine_id', p_tontine_id, 'request_id', v_id)
  );

  return jsonb_build_object('status', 'pending', 'request_id', v_id, 'tontine_id', p_tontine_id);
end;
$$;

create or replace function public.respond_tontine_join(p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.tontine_join_requests%rowtype;
  v_t public.tontines%rowtype;
  v_count int;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  select * into v_req from public.tontine_join_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Demande introuvable'; end if;
  if v_req.status <> 'pending' then raise exception 'Demande déjà traitée'; end if;

  select * into v_t from public.tontines where id = v_req.tontine_id;
  if v_t.id is null then raise exception 'Tontine introuvable'; end if;

  if v_t.owner_id is distinct from v_uid
     and not public.is_admin()
     and not exists (
       select 1 from public.tontine_members m
       where m.tontine_id = v_t.id and m.user_id = v_uid and m.role = 'admin'
     )
  then
    raise exception 'Non autorisé';
  end if;

  update public.tontine_join_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = v_uid,
      reviewed_at = now()
  where id = p_request_id;

  if p_approve then
    select count(*)::int into v_count
    from public.tontine_members
    where tontine_id = v_t.id and coalesce(status, '') <> 'exclu';

    if v_t.max_members is not null and v_count >= v_t.max_members then
      raise exception 'La tontine est complète';
    end if;

    insert into public.tontine_members (tontine_id, user_id, role, rotation_position, status, is_creator)
    values (v_t.id, v_req.requester_id, 'member', v_count + 1, 'a_jour', false)
    on conflict (tontine_id, user_id) do nothing;

    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.requester_id,
      'Demande acceptée',
      'Votre demande pour rejoindre « ' || v_t.name || ' » a été acceptée.',
      'tontine_join_approved',
      jsonb_build_object('tontine_id', v_t.id)
    );
  else
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.requester_id,
      'Demande refusée',
      'Votre demande pour rejoindre « ' || v_t.name || ' » a été refusée.',
      'tontine_join_rejected',
      jsonb_build_object('tontine_id', v_t.id)
    );
  end if;

  return jsonb_build_object(
    'status', case when p_approve then 'approved' else 'rejected' end,
    'tontine_id', v_t.id,
    'requester_id', v_req.requester_id
  );
end;
$$;

revoke all on function public.request_join_tontine(uuid, text) from public;
grant execute on function public.request_join_tontine(uuid, text) to authenticated;
revoke all on function public.respond_tontine_join(uuid, boolean) from public;
grant execute on function public.respond_tontine_join(uuid, boolean) to authenticated;
