-- Member reports against a tontine (reasons + proof attachments).

create table if not exists public.tontine_reports (
  id              uuid primary key default gen_random_uuid(),
  tontine_id      uuid not null references public.tontines(id) on delete cascade,
  reporter_id     uuid not null references auth.users(id) on delete cascade,
  reason_code     text not null
                    check (reason_code in (
                      'fraude', 'non_paiement', 'harcelement',
                      'faux_membres', 'mauvaise_gestion', 'autre'
                    )),
  reason_detail   text not null,
  proof_paths     text[] not null default '{}',
  status          text not null default 'open'
                    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_note      text,
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint tontine_reports_detail_len check (char_length(trim(reason_detail)) >= 10),
  constraint tontine_reports_proofs_max check (cardinality(proof_paths) <= 5)
);

create index if not exists tontine_reports_status_idx
  on public.tontine_reports (status, created_at desc);

create index if not exists tontine_reports_tontine_idx
  on public.tontine_reports (tontine_id, created_at desc);

-- One open report per reporter per tontine (re-open via update in RPC)
create unique index if not exists tontine_reports_open_uniq
  on public.tontine_reports (tontine_id, reporter_id)
  where status in ('open', 'reviewing');

alter table public.tontine_reports enable row level security;

drop policy if exists "tontine_reports_select" on public.tontine_reports;
create policy "tontine_reports_select" on public.tontine_reports
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.is_admin()
  );

grant select on public.tontine_reports to authenticated;

-- Storage for report proofs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tontine-reports',
  'tontine-reports',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

drop policy if exists "tontine_reports_storage_select" on storage.objects;
create policy "tontine_reports_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tontine-reports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "tontine_reports_storage_insert" on storage.objects;
create policy "tontine_reports_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tontine-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.submit_tontine_report(
  p_tontine_id uuid,
  p_reason_code text,
  p_reason_detail text,
  p_proof_paths text[] default '{}'
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
  v_detail text := trim(coalesce(p_reason_detail, ''));
  v_paths text[] := coalesce(p_proof_paths, '{}');
  v_admin record;
  v_is_member boolean;
begin
  if v_uid is null then raise exception 'Non authentifié.'; end if;
  if p_reason_code is null or p_reason_code not in (
    'fraude', 'non_paiement', 'harcelement', 'faux_membres', 'mauvaise_gestion', 'autre'
  ) then
    raise exception 'Motif de signalement invalide.';
  end if;
  if char_length(v_detail) < 10 then
    raise exception 'Décrivez le problème (au moins 10 caractères).';
  end if;
  if cardinality(v_paths) < 1 then
    raise exception 'Joignez au moins une preuve (photo ou PDF).';
  end if;
  if cardinality(v_paths) > 5 then
    raise exception 'Maximum 5 preuves.';
  end if;

  select * into v_t from public.tontines where id = p_tontine_id;
  if v_t.id is null then raise exception 'Tontine introuvable.'; end if;

  if v_t.owner_id = v_uid then
    raise exception 'Vous ne pouvez pas signaler votre propre tontine.';
  end if;

  v_is_member := public.is_tontine_member(p_tontine_id);
  if not v_is_member and not coalesce(v_t.is_public, false) then
    raise exception 'Vous devez être membre pour signaler cette tontine.';
  end if;

  -- Proof paths must belong to reporter folder
  if exists (
    select 1 from unnest(v_paths) as p(path)
    where split_part(path, '/', 1) <> v_uid::text
  ) then
    raise exception 'Preuve invalide.';
  end if;

  if exists (
    select 1 from public.tontine_reports
    where tontine_id = p_tontine_id
      and reporter_id = v_uid
      and status in ('open', 'reviewing')
  ) then
    raise exception 'Vous avez déjà un signalement en cours pour cette tontine.';
  end if;

  insert into public.tontine_reports (
    tontine_id, reporter_id, reason_code, reason_detail, proof_paths, status
  ) values (
    p_tontine_id, v_uid, p_reason_code, v_detail, v_paths, 'open'
  )
  returning id into v_id;

  for v_admin in
    select id from public.profiles where role in ('admin', 'super_admin')
  loop
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_admin.id,
      'Signalement tontine',
      '« ' || v_t.name || ' » — motif : ' || p_reason_code,
      'warning',
      jsonb_build_object(
        'action_url', '/admin?tab=tontines',
        'tontine_id', p_tontine_id,
        'report_id', v_id
      )
    );
  end loop;

  -- High-risk reasons → fraud alert on owner (security definer insert)
  if p_reason_code in ('fraude', 'faux_membres') and v_t.owner_id is not null then
    insert into public.fraud_alerts (user_id, alert_type, severity, amount_xaf, flags, metadata)
    values (
      v_t.owner_id,
      'tontine_member_report',
      'high',
      coalesce(v_t.amount_per_cycle, 0),
      array[p_reason_code, 'member_report'],
      jsonb_build_object(
        'tontine_id', p_tontine_id,
        'report_id', v_id,
        'reporter_id', v_uid
      )
    );
  end if;

  return jsonb_build_object('status', 'open', 'report_id', v_id);
end;
$$;

revoke all on function public.submit_tontine_report(uuid, text, text, text[]) from public;
grant execute on function public.submit_tontine_report(uuid, text, text, text[]) to authenticated;

create or replace function public.admin_review_tontine_report(
  p_report_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.tontine_reports%rowtype;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs.';
  end if;
  if p_status not in ('reviewing', 'resolved', 'dismissed') then
    raise exception 'Statut invalide.';
  end if;

  select * into v_req from public.tontine_reports where id = p_report_id;
  if v_req.id is null then raise exception 'Signalement introuvable.'; end if;

  update public.tontine_reports set
    status = p_status,
    admin_note = nullif(trim(coalesce(p_note, '')), ''),
    reviewed_by = v_uid,
    reviewed_at = now()
  where id = p_report_id;

  insert into public.notifications (user_id, title, body, type, metadata)
  values (
    v_req.reporter_id,
    case
      when p_status = 'resolved' then 'Signalement traité'
      when p_status = 'dismissed' then 'Signalement classé'
      else 'Signalement en cours d''examen'
    end,
    case
      when p_status = 'resolved' then 'Votre signalement a été traité par HODIX.'
      when p_status = 'dismissed' then 'Votre signalement a été examiné et classé sans suite.'
      else 'Votre signalement est en cours d''examen.'
    end
      || case when p_note is not null and trim(p_note) <> '' then ' Note : ' || trim(p_note) else '' end,
    case when p_status = 'resolved' then 'success' else 'info' end,
    jsonb_build_object('action_url', '/tontines/' || v_req.tontine_id::text, 'report_id', p_report_id)
  );

  return jsonb_build_object('report_id', p_report_id, 'status', p_status);
end;
$$;

revoke all on function public.admin_review_tontine_report(uuid, text, text) from public;
grant execute on function public.admin_review_tontine_report(uuid, text, text) to authenticated;
