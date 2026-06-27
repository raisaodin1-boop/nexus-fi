-- Batch: certificate verify RPC, profiles privacy RLS, Manager Pro subscription

-- ── 1. Public certificate verification (hash lookup, no PII leak) ──
create or replace function public.verify_certificate(p_hash text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.identity_certificates%rowtype;
  v_name text;
begin
  if coalesce(trim(p_hash), '') = '' then
    return json_build_object('valid', false);
  end if;

  select * into v_row
  from public.identity_certificates
  where lower(content_hash) = lower(trim(p_hash))
  limit 1;

  if not found then
    return json_build_object('valid', false);
  end if;

  select coalesce(full_name, 'Titulaire HODIX') into v_name
  from public.profiles where id = v_row.user_id;

  return json_build_object(
    'valid', true,
    'content_hash', v_row.content_hash,
    'doc_type', v_row.doc_type,
    'doc_id', v_row.doc_id,
    'holder_name', v_name,
    'issued_at', v_row.created_at,
    'chain_ref', v_row.chain_ref,
    'verify_url', v_row.verify_url
  );
end;
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated, service_role;

-- ── 2. Profiles privacy — own + admin + shared community ─────────
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_select_shared_groups" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "profiles_select_admin" on public.profiles
  for select to authenticated using (public.is_admin());

create policy "profiles_select_shared_groups" on public.profiles
  for select to authenticated using (
    id <> auth.uid()
    and not public.is_admin()
    and (
      exists (
        select 1 from public.tontine_members a
        join public.tontine_members b on a.tontine_id = b.tontine_id
        where a.user_id = auth.uid() and b.user_id = profiles.id
      )
      or exists (
        select 1 from public.association_members a
        join public.association_members b on a.association_id = b.association_id
        where a.user_id = auth.uid() and b.user_id = profiles.id
      )
      or exists (
        select 1 from public.cooperative_members a
        join public.cooperative_members b on a.cooperative_id = b.cooperative_id
        where a.user_id = auth.uid() and b.user_id = profiles.id
      )
      or exists (
        select 1 from public.fund_members a
        join public.fund_members b on a.fund_id = b.fund_id
        where a.user_id = auth.uid() and b.user_id = profiles.id
      )
      or exists (
        select 1 from public.messages m
        where (m.sender_id = auth.uid() and m.recipient_id = profiles.id)
           or (m.recipient_id = auth.uid() and m.sender_id = profiles.id)
      )
    )
  );

-- Lookup by email for transfers (returns id + name only)
create or replace function public.lookup_profile_by_email(p_email text)
returns table(id uuid, full_name text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select p.id, coalesce(p.full_name, 'Membre HODIX')
  from public.profiles p
  where lower(trim(p.email)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.lookup_profile_by_email(text) from public;
grant execute on function public.lookup_profile_by_email(text) to authenticated, service_role;

create or replace function public.lookup_profile_by_phone(p_phone text)
returns table(id uuid, full_name text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select p.id, coalesce(p.full_name, 'Membre HODIX')
  from public.profiles p
  where trim(p.phone) = trim(p_phone)
  limit 1;
$$;

revoke all on function public.lookup_profile_by_phone(text) from public;
grant execute on function public.lookup_profile_by_phone(text) to authenticated, service_role;

-- ── 3. Manager Pro subscription ──────────────────────────────────
alter table public.profiles
  add column if not exists manager_pro_until timestamptz,
  add column if not exists manager_pro_plan text not null default 'free';

-- Extend CinetPay confirmation for Manager Pro (4990 XAF / 30 days)
create or replace function public.confirm_cinetpay_payment(
  p_payment_id uuid,
  p_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay public.payments;
  v_meta jsonb;
  v_user uuid;
  v_amount numeric;
  v_kind text;
  v_locked uuid;
  v_roundup jsonb;
  v_result jsonb;
begin
  if p_payment_id is null then raise exception 'payment_id requis.'; end if;
  if coalesce(trim(p_reference), '') = '' then raise exception 'Référence requise.'; end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Paiement introuvable.'; end if;

  if auth.uid() is not null and auth.uid() <> v_pay.user_id and not public.is_admin() then
    raise exception 'Non autorisé.';
  end if;

  if v_pay.status = 'succeeded' then
    return jsonb_build_object(
      'payment_id', p_payment_id, 'status', 'succeeded', 'already_fulfilled', true
    );
  end if;
  if v_pay.status <> 'pending_cinetpay' then
    raise exception 'Ce paiement n''est plus en attente.';
  end if;

  v_user := v_pay.user_id;
  v_meta := public._payment_meta(v_pay.description);
  if v_meta is null or v_meta = '{}'::jsonb then
    raise exception 'Métadonnées de paiement invalides.';
  end if;

  v_amount := coalesce((v_meta->>'amount_xaf')::numeric, v_pay.amount);
  v_kind := coalesce(v_meta->>'kind', '');

  update public.payments
    set status = 'succeeded',
        description = v_pay.description || ' · ref:' || p_reference
    where id = p_payment_id and status = 'pending_cinetpay'
    returning id into v_locked;

  if v_locked is null then
    return jsonb_build_object(
      'payment_id', p_payment_id, 'status', 'succeeded', 'already_fulfilled', true
    );
  end if;

  case v_kind
    when 'tontine_contribution' then
      perform public.contribute_tontine_paid(
        (v_meta->>'tontine_id')::uuid, v_amount, p_payment_id
      );
    when 'savings_deposit' then
      perform public.savings_deposit_paid(
        (v_meta->>'goal_id')::uuid, v_amount, p_payment_id, 'Dépôt CinetPay'
      );
    when 'association_contribution' then
      perform public.contribute_association_paid(
        (v_meta->>'association_id')::uuid, v_amount, p_payment_id
      );
    when 'cooperative_contribution' then
      perform public.contribute_cooperative_paid(
        (v_meta->>'cooperative_id')::uuid, v_amount, p_payment_id
      );
    when 'fund_contribution' then
      perform public.contribute_fund_paid(
        (v_meta->>'fund_id')::uuid, v_amount, p_payment_id
      );
    when 'wallet_topup' then
      perform public.wallet_topup(
        v_amount, 'XAF',
        coalesce(v_meta->>'provider', 'CinetPay'),
        coalesce(v_meta->>'phone', ''),
        v_amount, p_payment_id
      );
      insert into public.identity_events (user_id, event_type, points_delta)
      values (v_user, 'wallet_topup', 1);
      v_roundup := public.apply_momo_roundup(v_user, v_amount, p_payment_id);
    when 'certified_report' then
      if not exists (
        select 1 from public.certificate_purchases
        where user_id = v_user
          and kind = coalesce(v_meta->>'cert_kind', 'identity')
          and status = 'paid'
      ) then
        insert into public.certificate_purchases
          (user_id, kind, amount_xaf, status, payment_id, paid_at)
        values (
          v_user,
          coalesce(v_meta->>'cert_kind', 'identity'),
          10000, 'paid', p_payment_id, now()
        );
      end if;
    when 'manager_pro_subscription' then
      update public.profiles
      set manager_pro_plan = 'pro',
          manager_pro_until = case
            when manager_pro_until is not null and manager_pro_until > now()
              then manager_pro_until + interval '30 days'
            else now() + interval '30 days'
          end
      where id = v_user;
    else
      raise exception 'Type de paiement inconnu: %', v_kind;
  end case;

  insert into public.notifications (user_id, title, body, type, is_read)
  values (
    v_user,
    'Paiement confirmé',
    to_char(v_amount, 'FM999G999G999') || ' XAF — opération enregistrée après validation du paiement.',
    'success',
    false
  );

  v_result := jsonb_build_object(
    'payment_id', p_payment_id,
    'status', 'succeeded',
    'kind', v_kind,
    'amount_xaf', v_amount,
    'roundup', v_roundup
  );
  return v_result;
end;
$$;

revoke all on function public.confirm_cinetpay_payment(uuid, text) from public, anon;
grant execute on function public.confirm_cinetpay_payment(uuid, text) to authenticated, service_role;
