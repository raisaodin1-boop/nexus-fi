-- Phase 1 P0: cycle deadlines, reminder dedup, payment claims/proofs, overdue status

-- ── 1. Backfill + defaults for cycle deadlines ───────────────────
update public.tontines
set
  current_cycle = coalesce(current_cycle, 1),
  cycle_deadline = coalesce(
    cycle_deadline,
    now() + (
      case lower(coalesce(frequency, 'monthly'))
        when 'weekly' then 7
        when 'biweekly' then 14
        when 'quarterly' then 90
        else 30
      end || ' days'
    )::interval
  )
where cycle_deadline is null or current_cycle is null;

-- ── 2. Reminder dedup log ───────────────────────────────────────
create table if not exists public.tontine_reminder_log (
  id uuid primary key default gen_random_uuid(),
  tontine_id uuid not null references public.tontines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle int not null,
  reminder_kind text not null,
  sent_at timestamptz not null default now(),
  unique (tontine_id, user_id, cycle, reminder_kind)
);
alter table public.tontine_reminder_log enable row level security;
drop policy if exists "tontine_reminder_log_admin" on public.tontine_reminder_log;
create policy "tontine_reminder_log_admin" on public.tontine_reminder_log
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.tontines t
      where t.id = tontine_id and t.owner_id = auth.uid()
    )
  );

-- ── 3. Payment claims (cash / MoMo proof workflow) ───────────────
create table if not exists public.tontine_payment_claims (
  id uuid primary key default gen_random_uuid(),
  tontine_id uuid not null references public.tontines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle int not null,
  amount numeric not null,
  status text not null default 'proof_submitted'
    check (status in ('proof_submitted', 'validated', 'rejected')),
  proof_path text,
  note text,
  payment_method text,
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tontine_payment_claims_open_uidx
  on public.tontine_payment_claims (tontine_id, user_id, cycle)
  where status in ('proof_submitted');

create index if not exists tontine_payment_claims_tontine_idx
  on public.tontine_payment_claims (tontine_id, cycle, status);

alter table public.tontine_payment_claims enable row level security;

drop policy if exists "tontine_claims_select" on public.tontine_payment_claims;
create policy "tontine_claims_select" on public.tontine_payment_claims
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.tontines t
      where t.id = tontine_id and t.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.tontine_members tm
      where tm.tontine_id = tontine_payment_claims.tontine_id
        and tm.user_id = auth.uid()
        and tm.status is distinct from 'exclu'
    )
  );

drop policy if exists "tontine_claims_insert" on public.tontine_payment_claims;
create policy "tontine_claims_insert" on public.tontine_payment_claims
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tontine_members tm
      where tm.tontine_id = tontine_payment_claims.tontine_id
        and tm.user_id = auth.uid()
        and tm.status is distinct from 'exclu'
    )
  );

drop policy if exists "tontine_claims_update" on public.tontine_payment_claims;
create policy "tontine_claims_update" on public.tontine_payment_claims
  for update to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.tontines t
      where t.id = tontine_id and t.owner_id = auth.uid()
    )
    or (user_id = auth.uid() and status = 'proof_submitted')
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.tontines t
      where t.id = tontine_id and t.owner_id = auth.uid()
    )
    or (user_id = auth.uid() and status = 'proof_submitted')
  );

-- Storage for tontine payment proofs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tontine-proofs',
  'tontine-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

drop policy if exists "tontine_proofs_select" on storage.objects;
create policy "tontine_proofs_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tontine-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "tontine_proofs_insert" on storage.objects;
create policy "tontine_proofs_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tontine-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Validate claim → create contribution + mark member a_jour
create or replace function public.validate_tontine_payment_claim(p_claim_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claim public.tontine_payment_claims;
  v_tontine public.tontines;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Non authentifie.'; end if;

  select * into v_claim from public.tontine_payment_claims where id = p_claim_id for update;
  if not found then raise exception 'Demande introuvable.'; end if;
  if v_claim.status <> 'proof_submitted' then raise exception 'Cette demande a deja ete traitee.'; end if;

  select * into v_tontine from public.tontines where id = v_claim.tontine_id;
  if v_tontine.owner_id <> v_uid and not public.is_admin() then
    raise exception 'Reserve au gestionnaire.';
  end if;

  if exists (
    select 1 from public.tontine_contributions
    where tontine_id = v_claim.tontine_id and user_id = v_claim.user_id and cycle = v_claim.cycle
  ) then
    update public.tontine_payment_claims
    set status = 'validated', reviewed_by = v_uid, reviewed_at = now(),
        note = coalesce(p_note, note), updated_at = now()
    where id = p_claim_id;
    return jsonb_build_object('ok', true, 'already_paid', true);
  end if;

  insert into public.tontine_contributions (tontine_id, user_id, amount, cycle, paid_at, payment_method)
  values (
    v_claim.tontine_id, v_claim.user_id, v_claim.amount, v_claim.cycle,
    now(), coalesce(v_claim.payment_method, 'proof_validated')
  );

  update public.tontine_members
  set
    last_paid_cycle = greatest(coalesce(last_paid_cycle, 0), v_claim.cycle),
    cycles_paid = coalesce(cycles_paid, 0) + 1,
    status = 'a_jour',
    cycles_late = 0
  where tontine_id = v_claim.tontine_id and user_id = v_claim.user_id;

  update public.tontine_payment_claims
  set status = 'validated', reviewed_by = v_uid, reviewed_at = now(),
      note = coalesce(p_note, note), updated_at = now()
  where id = p_claim_id;

  insert into public.notifications (user_id, title, body, type, is_read, metadata)
  values (
    v_claim.user_id,
    'Cotisation validee',
    'Votre preuve de paiement a ete acceptee. Cotisation enregistree.',
    'tontine_claim_validated',
    false,
    jsonb_build_object('action_url', '/tontines/' || v_claim.tontine_id::text, 'claim_id', p_claim_id)
  );

  return jsonb_build_object('ok', true, 'claim_id', p_claim_id);
end;
$$;

revoke all on function public.validate_tontine_payment_claim(uuid, text) from public;
grant execute on function public.validate_tontine_payment_claim(uuid, text) to authenticated, service_role;

create or replace function public.reject_tontine_payment_claim(p_claim_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claim public.tontine_payment_claims;
  v_tontine public.tontines;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Non authentifie.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Motif de rejet requis.'; end if;

  select * into v_claim from public.tontine_payment_claims where id = p_claim_id for update;
  if not found then raise exception 'Demande introuvable.'; end if;
  if v_claim.status <> 'proof_submitted' then raise exception 'Cette demande a deja ete traitee.'; end if;

  select * into v_tontine from public.tontines where id = v_claim.tontine_id;
  if v_tontine.owner_id <> v_uid and not public.is_admin() then
    raise exception 'Reserve au gestionnaire.';
  end if;

  update public.tontine_payment_claims
  set status = 'rejected', rejection_reason = trim(p_reason),
      reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  where id = p_claim_id;

  insert into public.notifications (user_id, title, body, type, is_read, metadata)
  values (
    v_claim.user_id,
    'Preuve refusee',
    'Votre preuve de cotisation a ete refusee : ' || trim(p_reason),
    'tontine_claim_rejected',
    false,
    jsonb_build_object('action_url', '/tontines/' || v_claim.tontine_id::text, 'claim_id', p_claim_id)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.reject_tontine_payment_claim(uuid, text) from public;
grant execute on function public.reject_tontine_payment_claim(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
