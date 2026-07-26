-- Targeted moderation: high-risk / new-account / fraud hold (server-enforced);
-- Verified HODIX badge requests (admin-only grant).

alter table public.tontines
  add column if not exists moderation_status text not null default 'approved'
    check (moderation_status in ('approved', 'pending_review', 'rejected', 'suspended'));

alter table public.tontines
  add column if not exists moderation_reason text;

alter table public.tontines
  add column if not exists moderation_reviewed_at timestamptz;

alter table public.tontines
  add column if not exists moderation_reviewed_by uuid references auth.users(id);

comment on column public.tontines.moderation_status is
  'approved = listed on Découvrir (if public). pending_review = hold. rejected/suspended = hidden.';

update public.tontines
set moderation_status = 'approved'
where moderation_status is null or moderation_status = '';

create index if not exists tontines_moderation_status_idx
  on public.tontines (moderation_status, created_at desc);

-- Visibility: group + approved → public; personal / pending / rejected / suspended → not public
create or replace function public.enforce_group_tontine_public()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_personal, false) = true then
    new.is_public := false;
    new.is_personal := true;
    return new;
  end if;

  if coalesce(new.moderation_status, 'approved') in ('pending_review', 'rejected', 'suspended') then
    new.is_public := false;
  else
    new.is_public := true;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_group_tontine_public_trg on public.tontines;
create trigger enforce_group_tontine_public_trg
  before insert or update of is_public, is_personal, moderation_status
  on public.tontines
  for each row execute function public.enforce_group_tontine_public();

-- Risk / fraud gate on create + protect moderation fields
create or replace function public.enforce_tontine_risk_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_flags text[];
  v_fp text;
  v_created timestamptz;
  v_prior_public int;
  v_sibling int;
  v_amount numeric;
  v_is_admin boolean;
  v_reasons text[] := '{}';
begin
  v_is_admin := coalesce(public.is_admin(), false);

  -- Badge & moderation fields: only admins (or security definer RPCs) may grant
  if tg_op = 'UPDATE' then
    if not v_is_admin then
      if coalesce(new.is_hodix_verified, false) is distinct from coalesce(old.is_hodix_verified, false)
         and coalesce(new.is_hodix_verified, false) = true then
        raise exception 'Seul un admin HODIX peut accorder le badge Vérifié.';
      end if;
      if coalesce(new.moderation_status, 'approved') is distinct from coalesce(old.moderation_status, 'approved') then
        raise exception 'Le statut de modération est réservé à l''administration.';
      end if;
      new.moderation_reviewed_at := old.moderation_reviewed_at;
      new.moderation_reviewed_by := old.moderation_reviewed_by;
    end if;
    return new;
  end if;

  -- INSERT
  if not v_is_admin then
    new.is_hodix_verified := false;
  end if;

  if v_uid is null then
    return new;
  end if;

  select coalesce(trust_flags, '{}'), device_fingerprint, created_at
    into v_flags, v_fp, v_created
  from public.profiles
  where id = v_uid;

  if 'blacklisted' = any(v_flags) or 'fraud_confirmed' = any(v_flags) then
    raise exception 'Compte suspendu pour fraude. Contactez le support.';
  end if;

  if v_fp is not null and exists (
    select 1 from public.flagged_devices fd where fd.fingerprint = v_fp
  ) then
    raise exception 'Appareil signalé pour activité frauduleuse.';
  end if;

  if v_fp is not null then
    select count(*)::int into v_sibling
    from public.profiles p
    where p.device_fingerprint = v_fp and p.id <> v_uid;
    if coalesce(v_sibling, 0) >= 1 then
      raise exception 'Multi-comptes détectés sur cet appareil. Contactez le support.';
    end if;
  end if;

  -- Personal tontines stay off Découvrir — no review queue
  if coalesce(new.is_personal, false) = true then
    new.moderation_status := 'approved';
    new.moderation_reason := null;
    return new;
  end if;

  if v_is_admin then
    new.moderation_status := coalesce(new.moderation_status, 'approved');
    return new;
  end if;

  v_amount := coalesce(new.amount_per_cycle, new.contribution_amount, 0);

  if v_amount >= 50000 then
    v_reasons := array_append(v_reasons, 'montant élevé (≥ 50 000 XAF/cycle)');
  end if;

  -- 1ʳᵉ tontine publique d'un compte neuf only (not every first public forever)
  select count(*)::int into v_prior_public
  from public.tontines t
  where t.owner_id = v_uid
    and coalesce(t.is_personal, false) = false;

  if coalesce(v_prior_public, 0) = 0
     and v_created is not null
     and v_created > now() - interval '7 days' then
    v_reasons := array_append(v_reasons, '1ère tontine publique d''un compte neuf');
  end if;

  if cardinality(v_reasons) > 0 then
    new.moderation_status := 'pending_review';
    new.moderation_reason := array_to_string(v_reasons, ' · ');
    new.is_public := false;
  else
    new.moderation_status := 'approved';
    new.moderation_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_tontine_risk_moderation_trg on public.tontines;
create trigger enforce_tontine_risk_moderation_trg
  before insert or update on public.tontines
  for each row execute function public.enforce_tontine_risk_moderation();

-- Order: risk first, then visibility (Postgres fires alphabetically by default — rename for clarity)
drop trigger if exists enforce_group_tontine_public_trg on public.tontines;
drop trigger if exists z_enforce_group_tontine_public_trg on public.tontines;
create trigger z_enforce_group_tontine_public_trg
  before insert or update of is_public, is_personal, moderation_status
  on public.tontines
  for each row execute function public.enforce_group_tontine_public();

-- Verified badge requests
create table if not exists public.tontine_verified_requests (
  id              uuid primary key default gen_random_uuid(),
  tontine_id      uuid not null references public.tontines(id) on delete cascade,
  requester_id    uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  message         text,
  rejection_reason text,
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (tontine_id, requester_id)
);

create index if not exists tontine_verified_req_status_idx
  on public.tontine_verified_requests (status, created_at desc);

alter table public.tontine_verified_requests enable row level security;

drop policy if exists "tontine_verified_select" on public.tontine_verified_requests;
create policy "tontine_verified_select" on public.tontine_verified_requests
  for select to authenticated
  using (
    requester_id = (select auth.uid())
    or public.is_admin()
    or public.is_tontine_admin(tontine_id)
  );

drop policy if exists "tontine_verified_insert" on public.tontine_verified_requests;
create policy "tontine_verified_insert" on public.tontine_verified_requests
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and (
      public.is_tontine_admin(tontine_id)
      or public.is_tontine_owner(tontine_id)
    )
  );

grant select, insert on public.tontine_verified_requests to authenticated;

-- Admin approve/reject moderation
create or replace function public.admin_review_tontine_moderation(
  p_tontine_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tontines%rowtype;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  select * into v_t from public.tontines where id = p_tontine_id;
  if v_t.id is null then raise exception 'Tontine introuvable.'; end if;

  if p_approve then
    update public.tontines set
      moderation_status = 'approved',
      moderation_reason = nullif(trim(coalesce(p_note, '')), ''),
      moderation_reviewed_at = now(),
      moderation_reviewed_by = v_uid,
      is_personal = false,
      is_public = true
    where id = p_tontine_id
      and coalesce(is_personal, false) = false;

    -- Personal stays private even if "approved"
    update public.tontines set
      moderation_status = 'approved',
      moderation_reason = nullif(trim(coalesce(p_note, '')), ''),
      moderation_reviewed_at = now(),
      moderation_reviewed_by = v_uid,
      is_public = false
    where id = p_tontine_id
      and coalesce(is_personal, false) = true;

    if v_t.owner_id is not null then
      insert into public.notifications (user_id, title, body, type, metadata)
      values (
        v_t.owner_id,
        'Tontine approuvée',
        '« ' || v_t.name || ' » est maintenant visible sur Découvrir.',
        'success',
        jsonb_build_object('action_url', '/tontines/' || p_tontine_id::text, 'tontine_id', p_tontine_id)
      );
    end if;
  else
    update public.tontines set
      moderation_status = 'rejected',
      moderation_reason = coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Refusée par l''administration HODIX'),
      moderation_reviewed_at = now(),
      moderation_reviewed_by = v_uid,
      is_public = false
    where id = p_tontine_id;

    if v_t.owner_id is not null then
      insert into public.notifications (user_id, title, body, type, metadata)
      values (
        v_t.owner_id,
        'Tontine non publiée',
        '« ' || v_t.name || ' » n''a pas été validée pour Découvrir.'
          || case when p_note is not null and trim(p_note) <> '' then ' Motif : ' || trim(p_note) else '' end,
        'warning',
        jsonb_build_object('action_url', '/tontines/' || p_tontine_id::text, 'tontine_id', p_tontine_id)
      );
    end if;
  end if;

  return jsonb_build_object(
    'tontine_id', p_tontine_id,
    'moderation_status', case when p_approve then 'approved' else 'rejected' end
  );
end;
$$;

revoke all on function public.admin_review_tontine_moderation(uuid, boolean, text) from public;
grant execute on function public.admin_review_tontine_moderation(uuid, boolean, text) to authenticated;

create or replace function public.request_tontine_verified_badge(
  p_tontine_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tontines%rowtype;
  v_id uuid;
  v_admin record;
begin
  if v_uid is null then raise exception 'Non authentifié.'; end if;

  select * into v_t from public.tontines where id = p_tontine_id;
  if v_t.id is null then raise exception 'Tontine introuvable.'; end if;
  if coalesce(v_t.is_hodix_verified, false) then
    raise exception 'Cette tontine est déjà vérifiée HODIX.';
  end if;
  if not (public.is_tontine_admin(p_tontine_id) or public.is_tontine_owner(p_tontine_id) or public.is_admin()) then
    raise exception 'Seul l''admin de la tontine peut demander le badge.';
  end if;
  if coalesce(v_t.moderation_status, 'approved') <> 'approved' then
    raise exception 'Validez d''abord la publication de la tontine.';
  end if;
  if coalesce(v_t.is_personal, false) or not coalesce(v_t.is_public, false) then
    raise exception 'Le badge Vérifié concerne les tontines publiques sur Découvrir.';
  end if;

  insert into public.tontine_verified_requests (tontine_id, requester_id, message, status)
  values (p_tontine_id, v_uid, nullif(trim(coalesce(p_message, '')), ''), 'pending')
  on conflict (tontine_id, requester_id) do update
    set status = 'pending',
        message = excluded.message,
        rejection_reason = null,
        reviewed_by = null,
        reviewed_at = null,
        created_at = now()
  returning id into v_id;

  for v_admin in
    select id from public.profiles where role in ('admin', 'super_admin')
  loop
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_admin.id,
      'Demande badge Vérifié HODIX',
      '« ' || v_t.name || ' » demande le badge officiel.',
      'info',
      jsonb_build_object('action_url', '/admin?tab=tontines', 'tontine_id', p_tontine_id, 'request_id', v_id)
    );
  end loop;

  return jsonb_build_object('status', 'pending', 'request_id', v_id);
end;
$$;

revoke all on function public.request_tontine_verified_badge(uuid, text) from public;
grant execute on function public.request_tontine_verified_badge(uuid, text) to authenticated;

create or replace function public.admin_review_tontine_verified(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.tontine_verified_requests%rowtype;
  v_t public.tontines%rowtype;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  select * into v_req from public.tontine_verified_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Demande introuvable.'; end if;
  if v_req.status <> 'pending' then raise exception 'Demande déjà traitée.'; end if;

  select * into v_t from public.tontines where id = v_req.tontine_id;

  update public.tontine_verified_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    rejection_reason = case when p_approve then null else coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Refusé') end,
    reviewed_by = v_uid,
    reviewed_at = now()
  where id = p_request_id;

  if p_approve then
    update public.tontines set is_hodix_verified = true where id = v_req.tontine_id;
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.requester_id,
      'Badge Vérifié HODIX accordé',
      '« ' || coalesce(v_t.name, 'Votre tontine') || ' » porte désormais le badge officiel.',
      'success',
      jsonb_build_object('action_url', '/tontines/' || v_req.tontine_id::text)
    );
  else
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.requester_id,
      'Badge Vérifié refusé',
      'La demande pour « ' || coalesce(v_t.name, 'votre tontine') || ' » a été refusée.'
        || case when p_note is not null and trim(p_note) <> '' then ' Motif : ' || trim(p_note) else '' end,
      'warning',
      jsonb_build_object('action_url', '/tontines/' || v_req.tontine_id::text)
    );
  end if;

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', case when p_approve then 'approved' else 'rejected' end
  );
end;
$$;

revoke all on function public.admin_review_tontine_verified(uuid, boolean, text) from public;
grant execute on function public.admin_review_tontine_verified(uuid, boolean, text) to authenticated;
