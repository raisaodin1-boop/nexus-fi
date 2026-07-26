-- HODIX — P0 security hardening (audit Jul 2026)
-- 1) Server-derive amount_xaf (never trust client p_amount_xaf for limits)
-- 2) PIN hash required on transfer/withdraw when wallet PIN is set
-- 3) protect_profile_columns: block client trust_score updates
-- 4) instant_loan_disburse: server-computed trust score (not profiles.trust_score)
-- 5) apply_momo_roundup: auth.uid() must match p_user_id

-- ── 1. Server-side FX → XAF (static fallback rates, aligned with app exchange-rates.ts) ──
create or replace function public._amount_to_xaf(p_amount numeric, p_currency text)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_cur text := upper(trim(coalesce(p_currency, '')));
  v_xaf_per_usd constant numeric := 655.957 * 0.915; -- ≈ 600 XAF / USD
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Montant invalide.';
  end if;
  if v_cur = 'XAF' then
    return p_amount;
  end if;
  if v_cur = 'XOF' then
    return p_amount; -- CFA UEMOA pegged 1:1 with XAF for limits
  end if;
  if v_cur = 'EUR' then
    return round(p_amount * 655.957);
  end if;
  if v_cur = 'USD' then
    return round(p_amount * v_xaf_per_usd);
  end if;
  if v_cur = 'NGN' then
    return round(p_amount * v_xaf_per_usd / 1620);
  end if;
  if v_cur = 'GHS' then
    return round(p_amount * v_xaf_per_usd / 15.5);
  end if;
  raise exception 'Conversion serveur indisponible pour la devise % — utilisez XAF.', v_cur;
end;
$$;

revoke all on function public._amount_to_xaf(numeric, text) from public, anon, authenticated;

-- ── 2. Server trust score (activity-based, not client-writable profiles.trust_score) ──
create or replace function public._compute_server_trust_score(p_user uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_account_created timestamptz := now();
  v_deposit_cnt int := 0;
  v_contrib_cnt int := 0;
  v_topup_cnt int := 0;
  v_active_months int := 0;
  v_score numeric;
begin
  if p_user is null then return 0; end if;

  select coalesce(au.created_at, now()) into v_account_created
  from auth.users au where au.id = p_user;

  select count(*)::int into v_deposit_cnt
  from public.savings_transactions where user_id = p_user and amount > 0;

  select count(*)::int into v_contrib_cnt
  from public.tontine_contributions where user_id = p_user;

  select count(*)::int into v_topup_cnt
  from public.wallet_transactions where user_id = p_user and type = 'topup';

  select count(*)::int into v_active_months from (
    select date_trunc('month', created_at) as month
    from public.savings_transactions where user_id = p_user and amount > 0
    union
    select date_trunc('month', created_at)
    from public.tontine_contributions where user_id = p_user
    union
    select date_trunc('month', created_at)
    from public.wallet_transactions where user_id = p_user and type = 'topup'
  ) am;

  v_score := least(
    1000,
    round(
      (5 + v_deposit_cnt + v_contrib_cnt + v_topup_cnt) * 1.5
      + least(120, floor(extract(epoch from (now() - v_account_created)) / 86400 / 365) * 15)
      + least(250, v_active_months * 4)
    )
  );

  return coalesce(v_score, 0)::int;
end;
$$;

revoke all on function public._compute_server_trust_score(uuid) from public, anon, authenticated;

-- ── 3. PIN gate for outbound wallet ops ──
create or replace function public._require_wallet_pin_if_set(p_user uuid, p_pin_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stored text;
begin
  if p_user is null then raise exception 'Non authentifié.'; end if;

  select pin_hash into v_stored
  from public.wallet_security
  where user_id = p_user;

  if v_stored is null or trim(v_stored) = '' then
    return;
  end if;

  if coalesce(trim(p_pin_hash), '') = '' then
    raise exception 'PIN requis pour cette opération.';
  end if;

  if trim(p_pin_hash) <> v_stored then
    raise exception 'PIN incorrect.';
  end if;
end;
$$;

revoke all on function public._require_wallet_pin_if_set(uuid, text) from public, anon, authenticated;

-- ── 4. protect_profile_columns: block trust_score self-update ──
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.role is distinct from old.role
      or new.is_blacklisted is distinct from old.is_blacklisted
      or new.kyc_status is distinct from old.kyc_status
      or coalesce(new.trust_score, 0) is distinct from coalesce(old.trust_score, 0)
      or coalesce(new.wallet_frozen, false) is distinct from coalesce(old.wallet_frozen, false))
     and not public.is_admin()
     and coalesce(current_setting('app.allow_wallet_freeze', true), '') <> '1' then
    if new.role is distinct from old.role
       and old.role = 'member'
       and new.role = 'tontine_manager'
       and old.created_at > now() - interval '15 minutes'
       and new.is_blacklisted is not distinct from old.is_blacklisted
       and new.kyc_status is not distinct from old.kyc_status
       and coalesce(new.trust_score, 0) is not distinct from coalesce(old.trust_score, 0)
       and coalesce(new.wallet_frozen, false) is not distinct from coalesce(old.wallet_frozen, false) then
      return new;
    end if;
    raise exception 'Modification non autorisée (champ protégé).';
  end if;
  return new;
end $$;

-- ── 5. wallet_transfer: server xaf + optional PIN ──
create or replace function public.wallet_transfer(
  p_recipient uuid,
  p_amount numeric,
  p_currency text,
  p_amount_xaf numeric,
  p_note text,
  p_pin_hash text default null
) returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
  v_ref text := 'TRF-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
  v_sender_name text;
  v_recipient_name text;
  v_xaf numeric;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;

  perform public._require_wallet_pin_if_set(v_user, p_pin_hash);

  v_xaf := public._amount_to_xaf(p_amount, p_currency);
  perform public._enforce_wallet_outbound(v_user, v_xaf, false);

  if p_currency not in ('XAF','XOF','NGN','GHS','USD','EUR') then raise exception 'Devise invalide.'; end if;
  if p_recipient is null or p_recipient = v_user then raise exception 'Destinataire invalide.'; end if;

  select full_name into v_recipient_name from public.profiles where id = p_recipient;
  if v_recipient_name is null then raise exception 'Membre introuvable.'; end if;
  select full_name into v_sender_name from public.profiles where id = v_user;

  if p_currency = 'XAF' then
    update public.wallets set balance_xaf = balance_xaf - p_amount, updated_at = now()
      where user_id = v_user and balance_xaf >= p_amount;
  elsif p_currency = 'XOF' then
    update public.wallets set balance_xof = balance_xof - p_amount, updated_at = now()
      where user_id = v_user and balance_xof >= p_amount;
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

  insert into public.wallets (user_id) values (p_recipient) on conflict (user_id) do nothing;
  if p_currency = 'XAF' then
    update public.wallets set balance_xaf = balance_xaf + p_amount, updated_at = now() where user_id = p_recipient;
  elsif p_currency = 'XOF' then
    update public.wallets set balance_xof = balance_xof + p_amount, updated_at = now() where user_id = p_recipient;
  elsif p_currency = 'NGN' then
    update public.wallets set balance_ngn = balance_ngn + p_amount, updated_at = now() where user_id = p_recipient;
  elsif p_currency = 'GHS' then
    update public.wallets set balance_ghs = balance_ghs + p_amount, updated_at = now() where user_id = p_recipient;
  elsif p_currency = 'EUR' then
    update public.wallets set balance_eur = balance_eur + p_amount, updated_at = now() where user_id = p_recipient;
  else
    update public.wallets set balance_usd = balance_usd + p_amount, updated_at = now() where user_id = p_recipient;
  end if;

  insert into public.wallet_transactions
    (user_id, counterpart_id, counterpart_name, type, amount, currency, amount_xaf, reference, note, status)
  values
    (v_user, p_recipient, v_recipient_name, 'transfer_out', p_amount, p_currency, v_xaf, v_ref, p_note, 'completed')
  returning * into v_tx;

  insert into public.wallet_transactions
    (user_id, counterpart_id, counterpart_name, type, amount, currency, amount_xaf, reference, note, status)
  values
    (p_recipient, v_user, coalesce(v_sender_name, 'Hodix User'), 'transfer_in', p_amount, p_currency, v_xaf, v_ref, p_note, 'completed');

  perform public.log_compliance_event(
    v_user, 'financial', 'wallet_transfer', 'wallet_transaction', v_tx.id, v_xaf,
    jsonb_build_object('recipient_id', p_recipient, 'currency', p_currency)
  );
  return v_tx;
end;
$$;

-- ── 6. wallet_withdraw: server xaf + optional PIN ──
create or replace function public.wallet_withdraw(
  p_amount numeric,
  p_currency text,
  p_provider text,
  p_phone text,
  p_amount_xaf numeric,
  p_pin_hash text default null
) returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
  v_xaf numeric;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_currency not in ('XAF','XOF','NGN','GHS','USD','EUR') then raise exception 'Devise invalide.'; end if;

  perform public._require_wallet_pin_if_set(v_user, p_pin_hash);

  v_xaf := public._amount_to_xaf(p_amount, p_currency);
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
end;
$$;

-- ── 7. instant_loan_disburse: server trust score ──
create or replace function public.instant_loan_disburse(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_prof public.profiles%rowtype;
  v_score int;
  v_max numeric;
  v_fee numeric;
  v_total numeric;
  v_loan_id uuid;
  v_due timestamptz := now() + interval '30 days';
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount < 5000 then
    raise exception 'Montant minimum : 5 000 XAF.';
  end if;

  select * into v_prof from public.profiles where id = v_user;
  if not found then raise exception 'Profil introuvable.'; end if;
  if coalesce(v_prof.kyc_status, 'not_submitted') <> 'approved' then
    raise exception 'KYC approuvé requis pour le crédit instantané (conformité LCB-FT).';
  end if;
  if coalesce(v_prof.wallet_frozen, false) then
    raise exception 'Wallet gelé — crédit indisponible.';
  end if;

  v_score := public._compute_server_trust_score(v_user);
  if v_score < 750 then
    raise exception 'Score Trust minimum 750 requis (votre score : %).', v_score;
  end if;

  v_max := public._instant_loan_max(v_score);
  if p_amount > v_max then
    raise exception 'Plafond crédit instantané : % XAF pour votre score.', v_max;
  end if;

  if exists (select 1 from public.instant_loans where user_id = v_user and status = 'active') then
    raise exception 'Vous avez déjà un crédit instantané actif.';
  end if;

  v_fee := greatest(round(p_amount * 0.025), 100);
  v_total := p_amount + v_fee;

  insert into public.wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  update public.wallets set balance_xaf = balance_xaf + p_amount, updated_at = now()
    where user_id = v_user;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, amount_xaf, reference, note, status)
  values
    (v_user, 'transfer_in', p_amount, 'XAF', p_amount,
     'ICL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     'Crédit instantané HODIX (échéance ' || to_char(v_due, 'DD/MM/YYYY') || ')', 'completed');

  insert into public.instant_loans
    (user_id, amount_xaf, fee_xaf, total_due_xaf, credit_score_at_issue, due_at)
  values (v_user, p_amount, v_fee, v_total, v_score, v_due)
  returning id into v_loan_id;

  perform public.log_compliance_event(
    v_user, 'financial', 'instant_loan_disburse', 'instant_loan', v_loan_id, p_amount,
    jsonb_build_object('fee_xaf', v_fee, 'total_due_xaf', v_total, 'score', v_score, 'due_at', v_due)
  );

  insert into public.notifications (user_id, title, body, type, is_read)
  values (
    v_user,
    'Crédit instantané accordé',
    to_char(p_amount, 'FM999G999G999') || ' XAF crédités. Remboursement : '
      || to_char(v_total, 'FM999G999G999') || ' XAF avant le '
      || to_char(v_due, 'DD/MM/YYYY') || '.',
    'loan',
    false
  );

  return jsonb_build_object(
    'loan_id', v_loan_id,
    'amount_xaf', p_amount,
    'fee_xaf', v_fee,
    'total_due_xaf', v_total,
    'due_at', v_due,
    'detail', 'Crédit instantané accordé'
  );
end;
$$;

-- ── 8. apply_momo_roundup: caller must be owner or admin ──
create or replace function public.apply_momo_roundup(
  p_user_id uuid,
  p_topup_amount numeric,
  p_payment_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prof public.profiles%rowtype;
  v_goal public.savings_goals%rowtype;
  v_spare numeric;
  v_remainder numeric;
  v_total numeric;
begin
  if p_user_id is null or p_topup_amount is null or p_topup_amount <= 0 then
    return jsonb_build_object('applied', false, 'reason', 'invalid_input');
  end if;

  if auth.uid() is not null and auth.uid() <> p_user_id and not public.is_admin() then
    raise exception 'Non autorisé.';
  end if;

  select * into v_prof from public.profiles where id = p_user_id;
  if not found or not coalesce(v_prof.momo_roundup_enabled, false) then
    return jsonb_build_object('applied', false, 'reason', 'disabled');
  end if;
  if v_prof.momo_roundup_goal_id is null then
    return jsonb_build_object('applied', false, 'reason', 'no_goal');
  end if;

  select * into v_goal
    from public.savings_goals
    where id = v_prof.momo_roundup_goal_id
      and user_id = p_user_id
      and is_active = true;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'goal_missing');
  end if;

  v_remainder := mod(p_topup_amount::bigint, greatest(v_prof.momo_roundup_increment, 100)::bigint);
  if v_remainder = 0 then
    return jsonb_build_object('applied', false, 'reason', 'already_round');
  end if;
  v_spare := v_prof.momo_roundup_increment - v_remainder;
  if v_spare <= 0 then
    return jsonb_build_object('applied', false, 'reason', 'zero_spare');
  end if;

  update public.wallets set balance_xaf = balance_xaf - v_spare, updated_at = now()
    where user_id = p_user_id and balance_xaf >= v_spare;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'insufficient_balance');
  end if;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, amount_xaf, reference, note, status)
  values
    (p_user_id, 'transfer_out', v_spare, 'XAF', v_spare,
     'MRU-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     'Arrondi MoMo → épargne', 'completed');

  update public.savings_goals
    set current_amount = current_amount + v_spare, updated_at = now()
    where id = v_goal.id;

  insert into public.savings_transactions (goal_id, user_id, amount, note)
    values (v_goal.id, p_user_id, v_spare, 'Arrondi MoMo automatique');

  insert into public.momo_roundup_events
    (user_id, goal_id, source_payment_id, topup_amount, roundup_amount, increment_used)
  values
    (p_user_id, v_goal.id, p_payment_id, p_topup_amount, v_spare, v_prof.momo_roundup_increment);

  select current_amount into v_total from public.savings_goals where id = v_goal.id;

  return jsonb_build_object(
    'applied', true,
    'roundup_amount', v_spare,
    'goal_id', v_goal.id,
    'goal_balance', v_total
  );
end;
$$;

-- Re-grant wallet RPCs (signature changed with p_pin_hash)
revoke all on function public.wallet_transfer(uuid, numeric, text, numeric, text, text) from public, anon;
grant execute on function public.wallet_transfer(uuid, numeric, text, numeric, text, text) to authenticated;

revoke all on function public.wallet_withdraw(numeric, text, text, text, numeric, text) from public, anon;
grant execute on function public.wallet_withdraw(numeric, text, text, text, numeric, text) to authenticated;
