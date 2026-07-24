-- Allow payment fulfillment (webhook / confirm RPC) when auth.uid() is absent
-- by resolving the payer from the validated payment row.

create or replace function public.savings_deposit_paid(
  p_goal_id uuid, p_amount numeric, p_payment_id uuid, p_note text default 'Dépôt CinetPay'
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_pay public.payments;
  v_meta jsonb;
  v_total numeric;
begin
  v_user := coalesce(auth.uid(), (select user_id from public.payments where id = p_payment_id));
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;
  if p_payment_id is null then raise exception 'Paiement requis.'; end if;

  if not exists (
    select 1 from public.savings_goals where id = p_goal_id and user_id = v_user
  ) then raise exception 'Objectif introuvable.'; end if;

  select * into v_pay from public.payments
    where id = p_payment_id and user_id = v_user and status = 'succeeded';
  if not found then raise exception 'Paiement non validé.'; end if;

  v_meta := public._payment_meta(v_pay.description);
  if v_meta->>'kind' <> 'savings_deposit' then raise exception 'Type de paiement invalide.'; end if;
  if (v_meta->>'goal_id')::uuid is distinct from p_goal_id then
    raise exception 'Objectif non correspondant.';
  end if;
  if v_pay.amount < p_amount then raise exception 'Montant incompatible.'; end if;

  insert into public.savings_transactions (goal_id, user_id, amount, note)
  values (p_goal_id, v_user, p_amount, coalesce(p_note, 'Dépôt CinetPay'));

  select coalesce(sum(amount), 0) into v_total
    from public.savings_transactions where goal_id = p_goal_id;
  update public.savings_goals set current_amount = greatest(0, v_total) where id = p_goal_id;
end $$;

create or replace function public.contribute_tontine_paid(
  p_tontine_id uuid, p_amount numeric, p_payment_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_pay public.payments;
  v_meta jsonb;
  v_tontine public.tontines;
  v_cycle int;
  v_reserve numeric;
  v_net numeric;
  v_paid_count int;
begin
  v_user := coalesce(auth.uid(), (select user_id from public.payments where id = p_payment_id));
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;
  if p_payment_id is null then raise exception 'Paiement requis.'; end if;

  select * into v_pay from public.payments
    where id = p_payment_id and user_id = v_user and status = 'succeeded';
  if not found then raise exception 'Paiement non validé.'; end if;

  v_meta := public._payment_meta(v_pay.description);
  if v_meta->>'kind' <> 'tontine_contribution' then raise exception 'Type de paiement invalide.'; end if;
  if (v_meta->>'tontine_id')::uuid is distinct from p_tontine_id then
    raise exception 'Tontine non correspondante.';
  end if;
  if v_pay.amount < p_amount then raise exception 'Montant incompatible.'; end if;

  if not exists (
    select 1 from public.tontine_members
    where tontine_id = p_tontine_id and user_id = v_user
  ) then raise exception 'Non membre de cette tontine.'; end if;

  if exists (
    select 1 from public.tontine_contributions tc
    where tc.tontine_id = p_tontine_id and tc.user_id = v_user
      and tc.cycle = (select current_cycle from public.tontines where id = p_tontine_id)
  ) then raise exception 'Cotisation déjà payée pour ce cycle.'; end if;

  select * into v_tontine from public.tontines where id = p_tontine_id;
  if not found then raise exception 'Tontine introuvable.'; end if;

  v_cycle := coalesce(v_tontine.current_cycle, 1);
  v_reserve := round(p_amount * 0.02);
  v_net := p_amount - v_reserve;

  insert into public.tontine_contributions (tontine_id, user_id, amount, cycle)
  values (p_tontine_id, v_user, v_net, v_cycle);

  update public.tontines
    set reserve_fund = coalesce(reserve_fund, 0) + v_reserve
    where id = p_tontine_id;

  update public.tontine_members
    set status = 'a_jour', last_paid_cycle = v_cycle
    where tontine_id = p_tontine_id and user_id = v_user;

  if v_cycle = 1 then
    select count(*)::int into v_paid_count
      from public.tontine_contributions
      where tontine_id = p_tontine_id and cycle = 1;
    if v_paid_count >= coalesce(v_tontine.max_members, 12) - 1 then
      insert into public.tontine_escrow (tontine_id, cycle, amount, release_at, status, dispute_count)
      values (
        p_tontine_id, 1, v_net * coalesce(v_tontine.max_members, 12),
        now() + interval '72 hours', 'held', 0
      )
      on conflict (tontine_id, cycle) do nothing;
    end if;
  end if;

  return jsonb_build_object('detail', 'Contribution enregistrée', 'net_amount', v_net, 'reserve_deducted', v_reserve);
end $$;

create or replace function public.wallet_topup(
  p_amount numeric,
  p_currency text,
  p_provider text,
  p_phone text,
  p_amount_xaf numeric,
  p_payment_id uuid
) returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_tx public.wallet_transactions;
  v_pay public.payments;
  v_meta jsonb;
begin
  v_user := coalesce(auth.uid(), (select user_id from public.payments where id = p_payment_id));
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_payment_id is null then raise exception 'Paiement requis pour recharger le wallet.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 5000000 then raise exception 'Montant invalide.'; end if;
  if p_currency not in ('XAF','USD','EUR') then raise exception 'Devise invalide.'; end if;

  select * into v_pay from public.payments
    where id = p_payment_id and user_id = v_user and status = 'succeeded';
  if not found then raise exception 'Paiement non validé.'; end if;
  if v_pay.amount < p_amount then raise exception 'Montant incompatible avec le paiement.'; end if;

  v_meta := public._payment_meta(v_pay.description);
  if coalesce(v_meta->>'kind', '') <> 'wallet_topup' then
    raise exception 'Type de paiement invalide pour recharge wallet.';
  end if;

  if exists (
    select 1 from public.wallet_transactions
    where user_id = v_user and type = 'topup' and note like '%' || p_payment_id::text || '%'
  ) then
    select * into v_tx from public.wallet_transactions
      where user_id = v_user and type = 'topup' and note like '%' || p_payment_id::text || '%'
      order by created_at desc limit 1;
    return v_tx;
  end if;

  insert into public.wallets (user_id) values (v_user) on conflict (user_id) do nothing;

  if p_currency = 'XAF' then
    update public.wallets set balance_xaf = balance_xaf + p_amount, updated_at = now() where user_id = v_user;
  elsif p_currency = 'EUR' then
    update public.wallets set balance_eur = balance_eur + p_amount, updated_at = now() where user_id = v_user;
  else
    update public.wallets set balance_usd = balance_usd + p_amount, updated_at = now() where user_id = v_user;
  end if;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, amount_xaf, reference, status, mobile_money_provider, mobile_money_number, note)
  values
    (v_user, 'topup', p_amount, p_currency, coalesce(p_amount_xaf, p_amount),
     'TUP-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     'completed', p_provider, p_phone,
     'Recharge via ' || coalesce(p_provider, 'Mobile Money') || ' · pay:' || p_payment_id::text)
  returning * into v_tx;
  return v_tx;
end $$;

create or replace function public.contribute_association_paid(
  p_association_id uuid, p_amount numeric, p_payment_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_pay public.payments;
  v_meta jsonb;
begin
  v_user := coalesce(auth.uid(), (select user_id from public.payments where id = p_payment_id));
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;

  select * into v_pay from public.payments
    where id = p_payment_id and user_id = v_user and status = 'succeeded';
  if not found then raise exception 'Paiement non validé.'; end if;

  v_meta := public._payment_meta(v_pay.description);
  if v_meta->>'kind' <> 'association_contribution' then raise exception 'Type de paiement invalide.'; end if;
  if (v_meta->>'association_id')::uuid is distinct from p_association_id then
    raise exception 'Association non correspondante.';
  end if;
  if v_pay.amount < p_amount then raise exception 'Montant incompatible.'; end if;

  if not exists (
    select 1 from public.association_members
    where association_id = p_association_id and user_id = v_user
  ) then raise exception 'Non membre de cette association.'; end if;

  insert into public.association_contributions (association_id, user_id, amount)
  values (p_association_id, v_user, p_amount);
end $$;

create or replace function public.contribute_cooperative_paid(
  p_cooperative_id uuid, p_amount numeric, p_payment_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_pay public.payments;
  v_meta jsonb;
begin
  v_user := coalesce(auth.uid(), (select user_id from public.payments where id = p_payment_id));
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;

  select * into v_pay from public.payments
    where id = p_payment_id and user_id = v_user and status = 'succeeded';
  if not found then raise exception 'Paiement non validé.'; end if;

  v_meta := public._payment_meta(v_pay.description);
  if v_meta->>'kind' <> 'cooperative_contribution' then raise exception 'Type de paiement invalide.'; end if;
  if (v_meta->>'cooperative_id')::uuid is distinct from p_cooperative_id then
    raise exception 'Coopérative non correspondante.';
  end if;
  if v_pay.amount < p_amount then raise exception 'Montant incompatible.'; end if;

  if not exists (
    select 1 from public.cooperative_members
    where cooperative_id = p_cooperative_id and user_id = v_user
  ) then raise exception 'Non membre de cette coopérative.'; end if;

  insert into public.cooperative_contributions (cooperative_id, user_id, amount)
  values (p_cooperative_id, v_user, p_amount);
end $$;

create or replace function public.contribute_fund_paid(
  p_fund_id uuid, p_amount numeric, p_payment_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_pay public.payments;
  v_meta jsonb;
  v_total numeric;
begin
  v_user := coalesce(auth.uid(), (select user_id from public.payments where id = p_payment_id));
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;

  select * into v_pay from public.payments
    where id = p_payment_id and user_id = v_user and status = 'succeeded';
  if not found then raise exception 'Paiement non validé.'; end if;

  v_meta := public._payment_meta(v_pay.description);
  if v_meta->>'kind' <> 'fund_contribution' then raise exception 'Type de paiement invalide.'; end if;
  if (v_meta->>'fund_id')::uuid is distinct from p_fund_id then
    raise exception 'Fonds non correspondant.';
  end if;
  if v_pay.amount < p_amount then raise exception 'Montant incompatible.'; end if;

  if not exists (
    select 1 from public.fund_members where fund_id = p_fund_id and user_id = v_user
  ) then raise exception 'Non membre de ce fonds.'; end if;

  insert into public.fund_contributions (fund_id, user_id, amount)
  values (p_fund_id, v_user, p_amount);

  select coalesce(sum(amount), 0) into v_total
    from public.fund_contributions where fund_id = p_fund_id;
  update public.community_funds set current_balance = v_total where id = p_fund_id;
end $$;

grant execute on function public.confirm_cinetpay_payment(uuid, text) to service_role;
