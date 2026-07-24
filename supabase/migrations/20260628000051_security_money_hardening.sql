-- HODIX — Money / auth hardening (surgical)
-- 1) Block client self-confirm of payments
-- 2) Lock payments RLS (no client status→succeeded)
-- 3) Revoke client wallet_topup (confirm RPC / service_role only)
-- 4) Protect wallet_frozen + allow signup role window
-- 5) Server-derive withdraw amount_xaf for XAF
-- 6) Diaspora contribution update guard
-- 7) Support subscription payment kind in confirm RPC

-- ── 1. confirm_cinetpay_payment: service_role only ──────────────
revoke all on function public.confirm_cinetpay_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_cinetpay_payment(uuid, text) to service_role;

-- ── 2. payments RLS: no client UPDATE/DELETE ───────────────────
drop policy if exists "payments_own" on public.payments;
drop policy if exists "payments_select_own" on public.payments;
drop policy if exists "payments_insert_own" on public.payments;
drop policy if exists "payments_update_own" on public.payments;

create policy "payments_select_own" on public.payments
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

create policy "payments_insert_own" on public.payments
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status in ('pending_paynote', 'pending_cinetpay', 'pending')
  );

-- No UPDATE/DELETE for authenticated — status transitions via SECURITY DEFINER RPCs / service_role

-- ── 3. wallet_topup: service_role + definer callers only ────────
revoke all on function public.wallet_topup(numeric, text, text, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.wallet_topup(numeric, text, text, text, numeric, uuid) to service_role;

-- ── 4. protect_profile_columns: wallet_frozen + signup role ─────
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.role is distinct from old.role
      or new.is_blacklisted is distinct from old.is_blacklisted
      or new.kyc_status is distinct from old.kyc_status
      or coalesce(new.wallet_frozen, false) is distinct from coalesce(old.wallet_frozen, false))
     and not public.is_admin() then
    -- Allow member → tontine_manager only within 15 min of profile creation (signup)
    if new.role is distinct from old.role
       and old.role = 'member'
       and new.role = 'tontine_manager'
       and old.created_at > now() - interval '15 minutes'
       and new.is_blacklisted is not distinct from old.is_blacklisted
       and new.kyc_status is not distinct from old.kyc_status
       and coalesce(new.wallet_frozen, false) is not distinct from coalesce(old.wallet_frozen, false) then
      return new;
    end if;
    raise exception 'Modification non autorisée (champ protégé).';
  end if;
  return new;
end $$;

-- ── 5. wallet_withdraw: never trust client amount_xaf for XAF ───
create or replace function public.wallet_withdraw(
  p_amount numeric, p_currency text, p_provider text, p_phone text, p_amount_xaf numeric
) returns public.wallet_transactions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
  v_xaf numeric;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_currency not in ('XAF','XOF','NGN','GHS','USD','EUR') then raise exception 'Devise invalide.'; end if;

  -- For XAF, payout amount must equal debit amount (ignore client p_amount_xaf).
  if p_currency = 'XAF' then
    v_xaf := p_amount;
  else
    v_xaf := coalesce(nullif(p_amount_xaf, 0), p_amount);
  end if;

  perform public._enforce_wallet_outbound(v_user, v_xaf, true);

  if p_currency in ('XAF', 'XOF') then
    update public.wallets set
      balance_xaf = case when p_currency = 'XAF' then balance_xaf - p_amount else balance_xaf end,
      balance_xof = case when p_currency = 'XOF' then balance_xof - p_amount else balance_xof end,
      updated_at = now()
    where user_id = v_user
      and ((p_currency = 'XAF' and balance_xaf >= p_amount) or (p_currency = 'XOF' and balance_xof >= p_amount));
  elsif p_currency = 'NGN' then
    update public.wallets set balance_ngn = balance_ngn - p_amount, updated_at = now()
      where user_id = v_user and balance_ngn >= p_amount;
  elsif p_currency = 'GHS' then
    update public.wallets set balance_ghs = balance_ghs - p_amount, updated_at = now()
      where user_id = v_user and balance_ghs >= p_amount;
  elsif p_currency = 'EUR' then
    update public.wallets set balance_eur = balance_eur - p_amount, updated_at = now()
      where user_id = v_user and balance_eur >= p_amount;
  else
    update public.wallets set balance_usd = balance_usd - p_amount, updated_at = now()
      where user_id = v_user and balance_usd >= p_amount;
  end if;
  if not found then raise exception 'Solde insuffisant.'; end if;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, amount_xaf, reference, status,
     mobile_money_provider, mobile_money_number, note)
  values
    (v_user, 'withdraw', p_amount, p_currency, v_xaf,
     'WDR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     'pending_disbursement', p_provider, p_phone,
     'Retrait vers ' || coalesce(p_provider, 'Mobile Money'))
  returning * into v_tx;

  perform public.log_compliance_event(
    v_user, 'financial', 'wallet_withdraw', 'wallet_transaction', v_tx.id, v_xaf,
    jsonb_build_object('provider', p_provider, 'phone', p_phone, 'currency', p_currency)
  );
  return v_tx;
end $$;

-- ── 6. Diaspora: block client status forgery ────────────────────
create or replace function public.protect_diaspora_contribution_updates()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Never allow client to set validated / under_review / admin fields
  if new.status in ('validated', 'under_review') and old.status is distinct from new.status then
    if new.status = 'under_review' and old.status in ('pending_payment', 'proof_submitted', 'rejected', 'needs_info') then
      -- proof submit path OK
      null;
    else
      raise exception 'Transition de statut non autorisée.';
    end if;
  end if;

  if new.status = 'validated' then
    raise exception 'Validation réservée aux administrateurs.';
  end if;

  if new.amount_expected is distinct from old.amount_expected then
    raise exception 'Montant attendu non modifiable.';
  end if;

  if new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by
     or new.receipt_id is distinct from old.receipt_id then
    raise exception 'Champs admin non modifiables.';
  end if;

  return new;
end $$;

drop trigger if exists protect_diaspora_contribution_updates_trg on public.diaspora_contribution_requests;
create trigger protect_diaspora_contribution_updates_trg
  before update on public.diaspora_contribution_requests
  for each row execute function public.protect_diaspora_contribution_updates();

-- ── 7. confirm RPC: add subscription kind (no-op side effect; client/fulfill activates) ──
-- Re-apply confirm with subscription branch by patching via create or replace of full body
-- is heavy; instead add a thin wrapper note: existing confirm raises on unknown kind.
-- Patch the case via replacing function from latest definition + subscription.

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
  v_pending text;
  v_plan text;
begin
  if p_payment_id is null then raise exception 'payment_id requis.'; end if;
  if coalesce(trim(p_reference), '') = '' then raise exception 'Référence requise.'; end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Paiement introuvable.'; end if;

  -- service_role has auth.uid() null — allowed. Authenticated callers revoked above.
  if auth.uid() is not null and auth.uid() <> v_pay.user_id and not public.is_admin() then
    raise exception 'Non autorisé.';
  end if;

  if v_pay.status = 'succeeded' then
    return jsonb_build_object(
      'payment_id', p_payment_id, 'status', 'succeeded', 'already_fulfilled', true
    );
  end if;

  v_pending := v_pay.status;
  if v_pending not in ('pending_cinetpay', 'pending_paynote') then
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
        description = split_part(v_pay.description, ' · ref:', 1) || ' · ref:' || p_reference
    where id = p_payment_id and status = v_pending
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
        (v_meta->>'goal_id')::uuid, v_amount, p_payment_id,
        case when coalesce(v_meta->>'gateway', '') = 'paynote' then 'Dépôt MTN Paynote' else 'Dépôt CinetPay' end
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
        case when coalesce(v_meta->>'gateway', '') = 'paynote' then 'MTN MoMo (Paynote)' else coalesce(v_meta->>'provider', 'CinetPay') end,
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
    when 'subscription' then
      -- Mark payment succeeded; plan activation is done by app fulfill / subscribeToPlan
      -- after verifying this succeeded payment. Keep a breadcrumb in notifications.
      v_plan := coalesce(v_meta->>'plan_id', '');
      insert into public.notifications (user_id, title, body, type, is_read)
      values (
        v_user,
        'Paiement abonnement reçu',
        'Votre paiement d''abonnement a été confirmé.' || case when v_plan <> '' then ' Plan: ' || v_plan else '' end,
        'success',
        false
      );
    else
      raise exception 'Type de paiement inconnu: %', v_kind;
  end case;

  if v_kind <> 'subscription' then
    insert into public.notifications (user_id, title, body, type, is_read)
    values (
      v_user,
      'Paiement confirmé',
      to_char(v_amount, 'FM999G999G999') || ' XAF — opération enregistrée après validation du paiement.',
      'success',
      false
    );
  end if;

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

revoke all on function public.confirm_cinetpay_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_cinetpay_payment(uuid, text) to service_role;
