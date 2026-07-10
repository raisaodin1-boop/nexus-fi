-- Association governance: invite join RPC, public associations, join requests,
-- member removal requests (admin-only hard delete)

-- ── Columns ───────────────────────────────────────────────────
alter table public.associations
  add column if not exists is_public boolean not null default true;

alter table public.associations
  add column if not exists category text;

comment on column public.associations.is_public is 'Visible dans l''annuaire; rejoindre via demande ou code';

-- ── Join requests ─────────────────────────────────────────────
create table if not exists public.association_join_requests (
  id              uuid primary key default gen_random_uuid(),
  association_id  uuid not null references public.associations(id) on delete cascade,
  requester_id    uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  message         text,
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (association_id, requester_id)
);

create index if not exists assoc_join_req_assoc_idx
  on public.association_join_requests (association_id, status);
create index if not exists assoc_join_req_requester_idx
  on public.association_join_requests (requester_id);

alter table public.association_join_requests enable row level security;

-- ── Member removal requests (managers ask platform admin) ─────
create table if not exists public.member_removal_requests (
  id              uuid primary key default gen_random_uuid(),
  group_type      text not null check (group_type in ('tontine', 'association', 'cooperative', 'fund')),
  group_id        uuid not null,
  target_user_id  uuid not null references auth.users(id) on delete cascade,
  requested_by    uuid not null references auth.users(id) on delete cascade,
  reason          text not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists member_removal_pending_idx
  on public.member_removal_requests (status, created_at desc);

alter table public.member_removal_requests enable row level security;

-- ── RLS: public associations readable ─────────────────────────
drop policy if exists "associations_select" on public.associations;
create policy "associations_select" on public.associations
  for select to authenticated
  using (
    is_public = true
    or owner_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.association_members m
      where m.association_id = associations.id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "associations_update" on public.associations;
create policy "associations_update" on public.associations
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());

drop policy if exists "associations_delete" on public.associations;
create policy "associations_delete" on public.associations
  for delete to authenticated
  using (public.is_admin());

-- Join requests policies
drop policy if exists "assoc_join_select" on public.association_join_requests;
create policy "assoc_join_select" on public.association_join_requests
  for select to authenticated
  using (
    requester_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.associations a
      where a.id = association_id
        and (a.owner_id = (select auth.uid())
             or exists (
               select 1 from public.association_members m
               where m.association_id = a.id
                 and m.user_id = (select auth.uid())
                 and m.role = 'admin'
             ))
    )
  );

drop policy if exists "assoc_join_insert" on public.association_join_requests;
create policy "assoc_join_insert" on public.association_join_requests
  for insert to authenticated
  with check (requester_id = (select auth.uid()));

drop policy if exists "assoc_join_update" on public.association_join_requests;
create policy "assoc_join_update" on public.association_join_requests
  for update to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.associations a
      where a.id = association_id and a.owner_id = (select auth.uid())
    )
  );

-- Removal requests policies
drop policy if exists "member_removal_select" on public.member_removal_requests;
create policy "member_removal_select" on public.member_removal_requests
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or target_user_id = (select auth.uid())
    or public.is_admin()
  );

drop policy if exists "member_removal_insert" on public.member_removal_requests;
create policy "member_removal_insert" on public.member_removal_requests
  for insert to authenticated
  with check (requested_by = (select auth.uid()));

drop policy if exists "member_removal_update" on public.member_removal_requests;
create policy "member_removal_update" on public.member_removal_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Block non-admin hard deletes on association_members (managers must request)
drop policy if exists "assoc_members_delete" on public.association_members;
create policy "assoc_members_delete" on public.association_members
  for delete to authenticated
  using (
    public.is_admin()
    or user_id = (select auth.uid())  -- self leave allowed
  );

-- Same for tontine_members: only admin or self (no manager kick)
drop policy if exists "tontine_members_delete" on public.tontine_members;
drop policy if exists "tm_delete" on public.tontine_members;
create policy "tontine_members_delete" on public.tontine_members
  for delete to authenticated
  using (
    public.is_admin()
    or user_id = (select auth.uid())
  );

-- ── RPC: join association by invite code (bypasses select RLS) ─
create or replace function public.join_association_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_assoc public.associations%rowtype;
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;
  if length(v_code) < 4 then
    raise exception 'Code d''invitation invalide';
  end if;

  select * into v_assoc
  from public.associations
  where upper(trim(invite_code)) = v_code
    and coalesce(is_active, true) = true
  limit 1;

  if v_assoc.id is null then
    raise exception 'Code d''invitation invalide';
  end if;

  if exists (
    select 1 from public.association_members
    where association_id = v_assoc.id and user_id = v_uid
  ) then
    return jsonb_build_object('association_id', v_assoc.id, 'already_member', true);
  end if;

  insert into public.association_members (association_id, user_id, role)
  values (v_assoc.id, v_uid, 'member');

  insert into public.notifications (user_id, title, body, type, metadata)
  values (
    v_assoc.owner_id,
    'Nouveau membre',
    'Un membre a rejoint « ' || v_assoc.name || ' » via code d''invitation.',
    'association_join',
    jsonb_build_object('association_id', v_assoc.id, 'user_id', v_uid)
  );

  return jsonb_build_object('association_id', v_assoc.id, 'already_member', false);
end;
$$;

revoke all on function public.join_association_by_code(text) from public;
grant execute on function public.join_association_by_code(text) to authenticated;

create or replace function public.join_cooperative_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_coop public.cooperatives%rowtype;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if length(v_code) < 4 then raise exception 'Code d''invitation invalide'; end if;

  select * into v_coop
  from public.cooperatives
  where upper(trim(invite_code)) = v_code
    and coalesce(is_active, true) = true
  limit 1;

  if v_coop.id is null then raise exception 'Code d''invitation invalide'; end if;

  if exists (
    select 1 from public.cooperative_members
    where cooperative_id = v_coop.id and user_id = v_uid
  ) then
    return jsonb_build_object('cooperative_id', v_coop.id, 'already_member', true);
  end if;

  insert into public.cooperative_members (cooperative_id, user_id, role)
  values (v_coop.id, v_uid, 'member');

  return jsonb_build_object('cooperative_id', v_coop.id, 'already_member', false);
end;
$$;

revoke all on function public.join_cooperative_by_code(text) from public;
grant execute on function public.join_cooperative_by_code(text) to authenticated;

-- Fix private tontine invite join similarly
create or replace function public.join_tontine_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_t public.tontines%rowtype;
  v_count int;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if length(v_code) < 4 then raise exception 'Code d''invitation invalide'; end if;

  select * into v_t
  from public.tontines
  where upper(trim(invite_code)) = v_code
    and coalesce(is_active, true) = true
  limit 1;

  if v_t.id is null then raise exception 'Code d''invitation invalide'; end if;

  if exists (
    select 1 from public.tontine_members where tontine_id = v_t.id and user_id = v_uid
  ) then
    return jsonb_build_object('tontine_id', v_t.id, 'already_member', true);
  end if;

  select count(*) into v_count from public.tontine_members where tontine_id = v_t.id;
  if v_t.max_members is not null and v_count >= v_t.max_members then
    raise exception 'La tontine est complète';
  end if;

  insert into public.tontine_members (tontine_id, user_id, role, rotation_position, status, is_creator)
  values (v_t.id, v_uid, 'member', v_count + 1, 'a_jour', false);

  return jsonb_build_object('tontine_id', v_t.id, 'already_member', false);
end;
$$;

revoke all on function public.join_tontine_by_code(text) from public;
grant execute on function public.join_tontine_by_code(text) to authenticated;

-- Request join public association
create or replace function public.request_join_association(p_association_id uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_assoc public.associations%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  select * into v_assoc from public.associations where id = p_association_id;
  if v_assoc.id is null then raise exception 'Association introuvable'; end if;
  if not coalesce(v_assoc.is_public, false) then
    raise exception 'Cette association est privée — utilisez un code d''invitation';
  end if;

  if exists (
    select 1 from public.association_members
    where association_id = p_association_id and user_id = v_uid
  ) then
    raise exception 'Vous êtes déjà membre';
  end if;

  insert into public.association_join_requests (association_id, requester_id, message, status)
  values (p_association_id, v_uid, nullif(trim(coalesce(p_message, '')), ''), 'pending')
  on conflict (association_id, requester_id) do update
    set status = 'pending',
        message = excluded.message,
        reviewed_by = null,
        reviewed_at = null,
        created_at = now()
  returning id into v_id;

  insert into public.notifications (user_id, title, body, type, metadata)
  values (
    v_assoc.owner_id,
    'Demande d''adhésion',
    'Quelqu''un souhaite rejoindre « ' || v_assoc.name || ' ».',
    'association_join_request',
    jsonb_build_object('association_id', p_association_id, 'request_id', v_id, 'requester_id', v_uid)
  );

  return jsonb_build_object('status', 'pending', 'request_id', v_id);
end;
$$;

revoke all on function public.request_join_association(uuid, text) from public;
grant execute on function public.request_join_association(uuid, text) to authenticated;

create or replace function public.respond_association_join(p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.association_join_requests%rowtype;
  v_owner uuid;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  select * into v_req from public.association_join_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Demande introuvable'; end if;
  if v_req.status <> 'pending' then raise exception 'Demande déjà traitée'; end if;

  select owner_id into v_owner from public.associations where id = v_req.association_id;
  if v_owner is distinct from v_uid and not public.is_admin() then
    raise exception 'Non autorisé';
  end if;

  update public.association_join_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = v_uid,
      reviewed_at = now()
  where id = p_request_id;

  if p_approve then
    insert into public.association_members (association_id, user_id, role)
    values (v_req.association_id, v_req.requester_id, 'member')
    on conflict do nothing;

    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.requester_id,
      'Demande acceptée',
      'Votre demande d''adhésion a été acceptée.',
      'association_join_approved',
      jsonb_build_object('association_id', v_req.association_id)
    );
  else
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.requester_id,
      'Demande refusée',
      'Votre demande d''adhésion a été refusée.',
      'association_join_rejected',
      jsonb_build_object('association_id', v_req.association_id)
    );
  end if;

  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

revoke all on function public.respond_association_join(uuid, boolean) from public;
grant execute on function public.respond_association_join(uuid, boolean) to authenticated;

-- Manager requests removal; only platform admin executes
create or replace function public.request_member_removal(
  p_group_type text,
  p_group_id uuid,
  p_target_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean := false;
  v_id uuid;
  v_name text;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Indiquez une raison (min. 5 caractères)';
  end if;
  if p_target_user_id = v_uid then
    raise exception 'Utilisez le départ volontaire pour vous retirer';
  end if;

  if p_group_type = 'association' then
    select exists(
      select 1 from public.associations a
      where a.id = p_group_id and a.owner_id = v_uid
    ) into v_ok;
    select name into v_name from public.associations where id = p_group_id;
  elsif p_group_type = 'tontine' then
    select exists(
      select 1 from public.tontines t
      where t.id = p_group_id
        and (t.owner_id = v_uid or t.creator_id = v_uid
             or exists (
               select 1 from public.tontine_members m
               where m.tontine_id = t.id and m.user_id = v_uid and m.role = 'admin'
             ))
    ) into v_ok;
    select name into v_name from public.tontines where id = p_group_id;
  elsif p_group_type = 'cooperative' then
    select exists(select 1 from public.cooperatives c where c.id = p_group_id and c.owner_id = v_uid) into v_ok;
    select name into v_name from public.cooperatives where id = p_group_id;
  else
    raise exception 'Type de groupe invalide';
  end if;

  if not v_ok and not public.is_admin() then
    raise exception 'Seul le gestionnaire peut demander une exclusion';
  end if;

  insert into public.member_removal_requests (group_type, group_id, target_user_id, requested_by, reason)
  values (p_group_type, p_group_id, p_target_user_id, v_uid, trim(p_reason))
  returning id into v_id;

  insert into public.notifications (user_id, title, body, type, metadata)
  select p.id,
         'Demande d''exclusion membre',
         'Demande pour « ' || coalesce(v_name, 'groupe') || ' » : ' || left(trim(p_reason), 120),
         'member_removal_request',
         jsonb_build_object('request_id', v_id, 'group_type', p_group_type, 'group_id', p_group_id)
  from public.profiles p
  where p.role in ('admin', 'super_admin');

  return jsonb_build_object('status', 'pending', 'request_id', v_id);
end;
$$;

revoke all on function public.request_member_removal(text, uuid, uuid, text) from public;
grant execute on function public.request_member_removal(text, uuid, uuid, text) to authenticated;

create or replace function public.admin_execute_member_removal(p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.member_removal_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Réservé à l''administration HODIX'; end if;

  select * into v_req from public.member_removal_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Demande introuvable'; end if;
  if v_req.status <> 'pending' then raise exception 'Demande déjà traitée'; end if;

  update public.member_removal_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id;

  if p_approve then
    if v_req.group_type = 'association' then
      delete from public.association_members
      where association_id = v_req.group_id and user_id = v_req.target_user_id;
    elsif v_req.group_type = 'tontine' then
      delete from public.tontine_members
      where tontine_id = v_req.group_id and user_id = v_req.target_user_id;
    elsif v_req.group_type = 'cooperative' then
      delete from public.cooperative_members
      where cooperative_id = v_req.group_id and user_id = v_req.target_user_id;
    end if;

    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.target_user_id,
      'Retrait du groupe',
      'Vous avez été retiré d''un groupe par l''administration HODIX.',
      'member_removed',
      jsonb_build_object('group_type', v_req.group_type, 'group_id', v_req.group_id)
    );
  end if;

  insert into public.notifications (user_id, title, body, type, metadata)
  values (
    v_req.requested_by,
    case when p_approve then 'Exclusion approuvée' else 'Exclusion refusée' end,
    case when p_approve
      then 'L''administration a retiré le membre.'
      else 'L''administration a refusé la demande d''exclusion.'
    end,
    'member_removal_result',
    jsonb_build_object('request_id', p_request_id, 'approved', p_approve)
  );

  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

revoke all on function public.admin_execute_member_removal(uuid, boolean) from public;
grant execute on function public.admin_execute_member_removal(uuid, boolean) to authenticated;

create or replace function public.admin_delete_association(p_association_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  if not public.is_admin() then raise exception 'Réservé à l''administration HODIX'; end if;
  select name into v_name from public.associations where id = p_association_id;
  if v_name is null then raise exception 'Association introuvable'; end if;
  delete from public.associations where id = p_association_id;
  return jsonb_build_object('deleted', true, 'name', v_name, 'reason', p_reason);
end;
$$;

revoke all on function public.admin_delete_association(uuid, text) from public;
grant execute on function public.admin_delete_association(uuid, text) to authenticated;
