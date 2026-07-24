-- HODIX — Security bugfixes (wallet_topup abuse, kyc_status, contribution RLS)

-- ── 1. wallet_topup: require validated CinetPay payment ─────────
drop function if exists public.wallet_topup(numeric, text, text, text, numeric);

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
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
  v_pay public.payments;
  v_meta jsonb;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_payment_id is null then raise exception 'Paiement requis pour recharger le wallet.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 5000000 then raise exception 'Montant invalide.'; end if;
  if p_currency not in ('XAF','USD','EUR') then raise exception 'Devise invalide.'; end if;

  select * into v_pay from public.payments
    where id = p_payment_id and user_id = v_user and status = 'succeeded';
  if not found then raise exception 'Paiement non validé.'; end if;
  if v_pay.amount < p_amount then raise exception 'Montant incompatible avec le paiement.'; end if;

  v_meta := (split_part(coalesce(v_pay.description, ''), ' · ref:', 1))::jsonb;
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

revoke all on function public.wallet_topup(numeric, text, text, text, numeric, uuid) from public, anon;
grant execute on function public.wallet_topup(numeric, text, text, text, numeric, uuid) to authenticated;

-- ── 2. profiles: block self kyc_status escalation ───────────────
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.role is distinct from old.role or new.is_blacklisted is distinct from old.is_blacklisted
      or new.kyc_status is distinct from old.kyc_status)
     and not public.is_admin() then
    raise exception 'Modification non autorisée (champ protégé).';
  end if;
  return new;
end $$;

-- ── 3. Paid contributions only (no free client inserts) ─────────
drop policy if exists "assoc_contribs_insert" on public.association_contributions;
drop policy if exists "coop_contribs_insert" on public.cooperative_contributions;
drop policy if exists "fund_contribs_insert" on public.fund_contributions;

create or replace function public._payment_meta(p_description text) returns jsonb
language sql immutable as $$
  select coalesce((split_part(coalesce(p_description, ''), ' · ref:', 1))::jsonb, '{}'::jsonb);
$$;

create or replace function public.contribute_association_paid(
  p_association_id uuid, p_amount numeric, p_payment_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_pay public.payments;
  v_meta jsonb;
begin
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
  v_user uuid := auth.uid();
  v_pay public.payments;
  v_meta jsonb;
begin
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
  v_user uuid := auth.uid();
  v_pay public.payments;
  v_meta jsonb;
  v_total numeric;
begin
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

revoke all on function public.contribute_association_paid(uuid, numeric, uuid) from public, anon;
revoke all on function public.contribute_cooperative_paid(uuid, numeric, uuid) from public, anon;
revoke all on function public.contribute_fund_paid(uuid, numeric, uuid) from public, anon;
grant execute on function public.contribute_association_paid(uuid, numeric, uuid) to authenticated;
grant execute on function public.contribute_cooperative_paid(uuid, numeric, uuid) to authenticated;
grant execute on function public.contribute_fund_paid(uuid, numeric, uuid) to authenticated;
