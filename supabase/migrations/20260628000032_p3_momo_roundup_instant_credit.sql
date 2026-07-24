-- P3: Arrondi MoMo (round-up épargne) + Crédit instantané Trust Score

-- ── 1. Arrondi MoMo settings ───────────────────────────────────
alter table public.profiles
  add column if not exists momo_roundup_enabled boolean not null default false,
  add column if not exists momo_roundup_increment numeric not null default 500,
  add column if not exists momo_roundup_goal_id uuid references public.savings_goals(id) on delete set null;

create table if not exists public.momo_roundup_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  goal_id uuid references public.savings_goals on delete set null,
  source_payment_id uuid references public.payments on delete set null,
  topup_amount numeric not null,
  roundup_amount numeric not null check (roundup_amount > 0),
  increment_used numeric not null,
  created_at timestamptz not null default now()
);

alter table public.momo_roundup_events enable row level security;
drop policy if exists "momo_roundup_events_own" on public.momo_roundup_events;
create policy "momo_roundup_events_own" on public.momo_roundup_events
  for select to authenticated using (auth.uid() = user_id);

-- ── 2. Apply MoMo round-up after top-up ───────────────────────
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
    (p_user_id, 'withdraw', v_spare, 'XAF', v_spare,
     'MRU-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     'Arrondi MoMo → épargne', 'completed');

  insert into public.savings_transactions (goal_id, user_id, amount, note)
  values (v_goal.id, p_user_id, v_spare, 'Arrondi MoMo automatique');

  select coalesce(sum(amount), 0) into v_total
    from public.savings_transactions where goal_id = v_goal.id;
  update public.savings_goals set current_amount = greatest(0, v_total) where id = v_goal.id;

  insert into public.momo_roundup_events
    (user_id, goal_id, source_payment_id, topup_amount, roundup_amount, increment_used)
  values (p_user_id, v_goal.id, p_payment_id, p_topup_amount, v_spare, v_prof.momo_roundup_increment);

  insert into public.notifications (user_id, title, body, type, is_read)
  values (
    p_user_id,
    'Arrondi MoMo',
    to_char(v_spare, 'FM999G999G999') || ' XAF épargnés automatiquement sur « ' || v_goal.name || ' ».',
    'savings',
    false
  );

  return jsonb_build_object(
    'applied', true,
    'roundup_xaf', v_spare,
    'goal_id', v_goal.id,
    'goal_name', v_goal.name
  );
end;
$$;

-- ── 3. Instant loans ────────────────────────────────────────────
create table if not exists public.instant_loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  amount_xaf numeric not null check (amount_xaf > 0),
  fee_xaf numeric not null default 0 check (fee_xaf >= 0),
  total_due_xaf numeric not null check (total_due_xaf > 0),
  amount_repaid_xaf numeric not null default 0 check (amount_repaid_xaf >= 0),
  credit_score_at_issue int not null,
  status text not null default 'active' check (status in ('active', 'repaid', 'defaulted')),
  due_at timestamptz not null,
  repaid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists instant_loans_user_active_idx
  on public.instant_loans (user_id) where status = 'active';

alter table public.instant_loans enable row level security;
drop policy if exists "instant_loans_own" on public.instant_loans;
create policy "instant_loans_own" on public.instant_loans
  for all to authenticated using (auth.uid() = user_id);

create or replace function public._instant_loan_max(p_score int)
returns numeric
language sql immutable as $$
  select case
    when p_score >= 850 then 200000
    when p_score >= 800 then 100000
    when p_score >= 750 then 50000
    else 0
  end;
$$;

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

  v_score := coalesce(v_prof.trust_score, 0)::int;
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

create or replace function public.instant_loan_repay(p_loan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_loan public.instant_loans%rowtype;
  v_remaining numeric;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;

  select * into v_loan from public.instant_loans
    where id = p_loan_id and user_id = v_user for update;
  if not found then raise exception 'Crédit introuvable.'; end if;
  if v_loan.status <> 'active' then raise exception 'Ce crédit n''est plus actif.'; end if;

  v_remaining := v_loan.total_due_xaf - v_loan.amount_repaid_xaf;
  if v_remaining <= 0 then
    update public.instant_loans set status = 'repaid', repaid_at = now() where id = p_loan_id;
    return jsonb_build_object('detail', 'Déjà remboursé', 'status', 'repaid');
  end if;

  update public.wallets set balance_xaf = balance_xaf - v_remaining, updated_at = now()
    where user_id = v_user and balance_xaf >= v_remaining;
  if not found then raise exception 'Solde insuffisant pour rembourser % XAF.', v_remaining; end if;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, amount_xaf, reference, note, status)
  values
    (v_user, 'withdraw', v_remaining, 'XAF', v_remaining,
     'ICR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     'Remboursement crédit instantané', 'completed');

  update public.instant_loans
    set amount_repaid_xaf = total_due_xaf, status = 'repaid', repaid_at = now()
    where id = p_loan_id;

  perform public.log_compliance_event(
    v_user, 'financial', 'instant_loan_repay', 'instant_loan', p_loan_id, v_remaining,
    jsonb_build_object('total_due_xaf', v_loan.total_due_xaf)
  );

  return jsonb_build_object(
    'detail', 'Crédit remboursé',
    'amount_repaid_xaf', v_remaining,
    'status', 'repaid'
  );
end;
$$;

-- ── 4. Hook round-up into CinetPay confirmation ─────────────────
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
    'amount_xaf', v_amount
  );
  if v_roundup is not null then
    v_result := v_result || jsonb_build_object('momo_roundup', v_roundup);
  end if;
  return v_result;
end;
$$;

revoke all on function public.apply_momo_roundup(uuid, numeric, uuid) from public;
grant execute on function public.apply_momo_roundup(uuid, numeric, uuid) to authenticated, service_role;

revoke all on function public.instant_loan_disburse(numeric) from public;
grant execute on function public.instant_loan_disburse(numeric) to authenticated;

revoke all on function public.instant_loan_repay(uuid) from public;
grant execute on function public.instant_loan_repay(uuid) to authenticated;
