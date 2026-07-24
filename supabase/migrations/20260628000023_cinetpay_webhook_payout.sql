-- HODIX — CinetPay webhook fulfillment RPC + wallet payout pipeline

-- ── 1. Confirm payment server-side (webhook + polling) ─────────
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

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'status', 'succeeded',
    'kind', v_kind,
    'amount_xaf', v_amount
  );
end;
$$;

revoke all on function public.confirm_cinetpay_payment(uuid, text) from public, anon;
grant execute on function public.confirm_cinetpay_payment(uuid, text) to authenticated;
grant execute on function public.confirm_cinetpay_payment(uuid, text) to service_role;

-- ── 2. Wallet withdraw → pending disbursement ───────────────────
alter table public.wallet_transactions
  add column if not exists payout_reference text,
  add column if not exists payout_provider_ref text;

alter table public.withdrawal_requests
  add column if not exists wallet_tx_id uuid references public.wallet_transactions(id) on delete set null,
  add column if not exists payout_reference text,
  add column if not exists payout_lot text;

create or replace function public.wallet_withdraw(
  p_amount numeric, p_currency text, p_provider text, p_phone text, p_amount_xaf numeric
) returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;
  if p_currency not in ('XAF','USD','EUR') then raise exception 'Devise invalide.'; end if;

  if p_currency = 'XAF' then
    update public.wallets set balance_xaf = balance_xaf - p_amount, updated_at = now()
      where user_id = v_user and balance_xaf >= p_amount;
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
    (v_user, 'withdraw', p_amount, p_currency, coalesce(p_amount_xaf, p_amount),
     'WDR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     'pending_disbursement', p_provider, p_phone,
     'Retrait vers ' || coalesce(p_provider, 'Mobile Money'))
  returning * into v_tx;
  return v_tx;
end;
$$;

-- ── 3. Complete / fail payout (called by edge function) ─────────
create or replace function public.complete_wallet_payout(
  p_tx_id uuid,
  p_payout_ref text default null,
  p_provider_ref text default null
) returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tx public.wallet_transactions;
begin
  update public.wallet_transactions
    set status = 'completed',
        payout_reference = coalesce(p_payout_ref, payout_reference),
        payout_provider_ref = coalesce(p_provider_ref, payout_provider_ref),
        note = coalesce(note, '') || ' · payout:confirmed'
    where id = p_tx_id and type = 'withdraw' and status = 'pending_disbursement'
    returning * into v_tx;
  if not found then raise exception 'Transaction de retrait introuvable ou déjà finalisée.'; end if;

  update public.withdrawal_requests
    set status = 'completed',
        payout_reference = coalesce(p_payout_ref, payout_reference)
    where wallet_tx_id = p_tx_id;

  return v_tx;
end;
$$;

create or replace function public.refund_wallet_withdraw(p_tx_id uuid, p_reason text default null)
returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tx public.wallet_transactions;
begin
  select * into v_tx from public.wallet_transactions
    where id = p_tx_id and type = 'withdraw' and status = 'pending_disbursement'
    for update;
  if not found then raise exception 'Transaction de retrait introuvable.'; end if;

  if v_tx.currency = 'XAF' then
    update public.wallets set balance_xaf = balance_xaf + v_tx.amount, updated_at = now()
      where user_id = v_tx.user_id;
  elsif v_tx.currency = 'EUR' then
    update public.wallets set balance_eur = balance_eur + v_tx.amount, updated_at = now()
      where user_id = v_tx.user_id;
  else
    update public.wallets set balance_usd = balance_usd + v_tx.amount, updated_at = now()
      where user_id = v_tx.user_id;
  end if;

  update public.wallet_transactions
    set status = 'failed',
        note = coalesce(note, '') || ' · payout:failed' || coalesce(' — ' || p_reason, '')
    where id = p_tx_id
    returning * into v_tx;

  update public.withdrawal_requests
    set status = 'failed'
    where wallet_tx_id = p_tx_id;

  return v_tx;
end;
$$;

revoke all on function public.complete_wallet_payout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.refund_wallet_withdraw(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_wallet_payout(uuid, text, text) to service_role;
grant execute on function public.refund_wallet_withdraw(uuid, text) to service_role;
