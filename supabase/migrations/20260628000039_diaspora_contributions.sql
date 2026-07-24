-- HODIX Diaspora V1 — manual contribution requests, proof upload, admin validation

create table if not exists public.diaspora_contribution_requests (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  tontine_id            uuid not null references public.tontines(id) on delete cascade,
  reference_code        text not null unique,
  amount_expected       numeric not null,
  currency              text not null default 'XAF',
  cycle                 int not null default 1,
  due_date              timestamptz,
  status                text not null default 'pending_payment'
    check (status in (
      'pending_payment', 'proof_submitted', 'under_review', 'validated',
      'rejected', 'needs_info', 'suspicious'
    )),
  payment_method        text check (payment_method in ('mtn_momo', 'orange_money', 'bank_transfer')),
  payer_type            text check (payer_type in ('self', 'relative')),
  payer_name            text,
  payer_phone           text,
  payer_relation        text,
  declared_amount       numeric,
  declared_currency     text,
  payment_date          date,
  payment_time_approx   text,
  transaction_reference text,
  comment               text,
  proof_path            text,
  fraud_declaration     boolean not null default false,
  rejection_reason      text,
  reviewed_by           uuid references auth.users(id),
  reviewed_at           timestamptz,
  receipt_id            text,
  assigned_to           uuid references auth.users(id),
  internal_note         text,
  payment_id            uuid references public.payments(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_diaspora_requests_user on public.diaspora_contribution_requests(user_id);
create index if not exists idx_diaspora_requests_status on public.diaspora_contribution_requests(status);
create index if not exists idx_diaspora_requests_tontine on public.diaspora_contribution_requests(tontine_id);
create index if not exists idx_diaspora_requests_due on public.diaspora_contribution_requests(due_date);

create table if not exists public.diaspora_audit_log (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.diaspora_contribution_requests(id) on delete cascade,
  actor_id    uuid not null references auth.users(id),
  action      text not null,
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.diaspora_contribution_requests enable row level security;
alter table public.diaspora_audit_log enable row level security;

create policy "diaspora_requests_own" on public.diaspora_contribution_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "diaspora_requests_insert_own" on public.diaspora_contribution_requests
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "diaspora_requests_update_own" on public.diaspora_contribution_requests
  for update to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
  )
  with check (
    user_id = auth.uid()
    or public.is_admin()
  );

create policy "diaspora_audit_admin" on public.diaspora_audit_log
  for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.diaspora_contribution_requests r
    where r.id = request_id and r.user_id = auth.uid()
  ));

create policy "diaspora_audit_insert" on public.diaspora_audit_log
  for insert to authenticated
  with check (actor_id = auth.uid() and (public.is_admin() or exists (
    select 1 from public.diaspora_contribution_requests r
    where r.id = request_id and r.user_id = auth.uid()
  )));

-- Storage bucket for payment proofs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'diaspora-proofs',
  'diaspora-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

drop policy if exists "diaspora_proofs_select_own" on storage.objects;
create policy "diaspora_proofs_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'diaspora-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "diaspora_proofs_insert_own" on storage.objects;
create policy "diaspora_proofs_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'diaspora-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "diaspora_proofs_update_own" on storage.objects;
create policy "diaspora_proofs_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'diaspora-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admin validates diaspora contribution: creates payment + records tontine contribution
create or replace function public.validate_diaspora_contribution(
  p_request_id uuid,
  p_internal_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_req public.diaspora_contribution_requests;
  v_pay_id uuid;
  v_meta text;
  v_result jsonb;
  v_tontine public.tontines;
  v_reserve numeric;
  v_net numeric;
  v_paid_count int;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  select * into v_req from public.diaspora_contribution_requests where id = p_request_id;
  if not found then raise exception 'Demande introuvable.'; end if;
  if v_req.status = 'validated' then raise exception 'Déjà validée.'; end if;
  if v_req.status not in ('under_review', 'proof_submitted', 'needs_info', 'suspicious') then
    raise exception 'Statut incompatible pour validation.';
  end if;

  if exists (
    select 1 from public.tontine_contributions tc
    where tc.tontine_id = v_req.tontine_id and tc.user_id = v_req.user_id and tc.cycle = v_req.cycle
  ) then raise exception 'Cotisation déjà enregistrée pour ce cycle.'; end if;

  v_meta := jsonb_build_object(
    'kind', 'tontine_contribution',
    'amount_xaf', v_req.amount_expected,
    'tontine_id', v_req.tontine_id,
    'diaspora_request_id', v_req.id,
    'diaspora_reference', v_req.reference_code
  )::text;

  insert into public.payments (user_id, amount, currency, direction, description, status)
  values (v_req.user_id, v_req.amount_expected, coalesce(v_req.currency, 'XAF'), 'out', v_meta, 'succeeded')
  returning id into v_pay_id;

  -- Inline contribution (contribute_tontine_paid uses auth.uid() which would be the admin)
  select * into v_tontine from public.tontines where id = v_req.tontine_id;
  v_reserve := round(v_req.amount_expected * 0.02);
  v_net := v_req.amount_expected - v_reserve;

  insert into public.tontine_contributions (tontine_id, user_id, amount, cycle, payment_method)
  values (v_req.tontine_id, v_req.user_id, v_net, v_req.cycle, coalesce(v_req.payment_method, 'diaspora_manual'));

  update public.tontines set reserve_fund = coalesce(reserve_fund, 0) + v_reserve where id = v_req.tontine_id;
  update public.tontine_members set status = 'a_jour', last_paid_cycle = v_req.cycle
    where tontine_id = v_req.tontine_id and user_id = v_req.user_id;

  if v_req.cycle = 1 then
    select count(*)::int into v_paid_count from public.tontine_contributions
      where tontine_id = v_req.tontine_id and cycle = 1;
    if v_paid_count >= coalesce(v_tontine.max_members, 12) - 1 then
      insert into public.tontine_escrow (tontine_id, cycle, amount, release_at, status, dispute_count)
      values (v_req.tontine_id, 1, v_net * coalesce(v_tontine.max_members, 12), now() + interval '72 hours', 'held', 0)
      on conflict (tontine_id, cycle) do nothing;
    end if;
  end if;

  v_result := jsonb_build_object('detail', 'Contribution enregistrée', 'net_amount', v_net, 'reserve_deducted', v_reserve);

  update public.diaspora_contribution_requests set
    status = 'validated',
    payment_id = v_pay_id,
    receipt_id = 'HDX-RCP-' || upper(substr(replace(v_req.id::text, '-', ''), 1, 10)),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    internal_note = coalesce(p_internal_note, internal_note),
    updated_at = now()
  where id = p_request_id;

  insert into public.diaspora_audit_log (request_id, actor_id, action, note)
  values (p_request_id, auth.uid(), 'validated', p_internal_note);

  return jsonb_build_object(
    'detail', 'Cotisation validée',
    'payment_id', v_pay_id,
    'receipt_id', (select receipt_id from public.diaspora_contribution_requests where id = p_request_id),
    'contribution', v_result
  );
end $$;

revoke all on function public.validate_diaspora_contribution(uuid, text) from public, anon;
grant execute on function public.validate_diaspora_contribution(uuid, text) to authenticated;

grant select, insert, update on public.diaspora_contribution_requests to authenticated;
grant select, insert on public.diaspora_audit_log to authenticated;
