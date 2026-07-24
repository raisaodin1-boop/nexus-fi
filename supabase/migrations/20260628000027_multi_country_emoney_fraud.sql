-- HODIX — Multi-country wallets, e-money license, real-time fraud snapshots

-- ── 1. Multi-country wallet balances ─────────────────────────────
alter table public.wallets
  add column if not exists balance_xof numeric(15,2) not null default 0 check (balance_xof >= 0),
  add column if not exists balance_ngn numeric(15,2) not null default 0 check (balance_ngn >= 0),
  add column if not exists balance_ghs numeric(15,2) not null default 0 check (balance_ghs >= 0);

alter table public.profiles
  add column if not exists country_code text,
  add column if not exists native_currency text default 'XAF';

-- Extend wallet currency check
alter table public.wallet_transactions drop constraint if exists wallet_transactions_currency_check;
alter table public.wallet_transactions add constraint wallet_transactions_currency_check
  check (currency in ('XAF','XOF','NGN','GHS','USD','EUR','KES','ZAR'));

-- ── 2. E-money issuer license (COBAC/CEMAC framework) ────────────
create table if not exists public.emoney_license_config (
  id int primary key default 1 check (id = 1),
  license_number text,
  license_status text not null default 'sandbox'
    check (license_status in ('sandbox', 'application', 'licensed', 'suspended')),
  issuer_country text not null default 'CM',
  regulator text not null default 'COBAC',
  max_float_xaf numeric not null default 100000000,
  max_user_balance_xaf numeric not null default 2000000,
  max_daily_outflow_xaf numeric not null default 1000000,
  max_single_tx_xaf numeric not null default 500000,
  effective_from timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.emoney_license_config (id, license_status, regulator)
values (1, 'sandbox', 'COBAC')
on conflict (id) do nothing;

alter table public.emoney_license_config enable row level security;
drop policy if exists "emoney_license_read" on public.emoney_license_config;
create policy "emoney_license_read" on public.emoney_license_config
  for select to authenticated using (true);
drop policy if exists "emoney_license_admin" on public.emoney_license_config;
create policy "emoney_license_admin" on public.emoney_license_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── 3. Real-time fraud score snapshots ───────────────────────────
create table if not exists public.fraud_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tx_type text not null,
  amount_xaf numeric,
  score int not null check (score >= 0 and score <= 100),
  risk text not null check (risk in ('low', 'medium', 'high', 'critical')),
  flags text[] not null default '{}',
  model_version text not null default 'hodix-fraud-v1',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists fraud_score_snapshots_user_idx
  on public.fraud_score_snapshots (user_id, created_at desc);

alter table public.fraud_score_snapshots enable row level security;
drop policy if exists "fraud_score_own_read" on public.fraud_score_snapshots;
create policy "fraud_score_own_read" on public.fraud_score_snapshots
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "fraud_score_admin" on public.fraud_score_snapshots;
create policy "fraud_score_admin" on public.fraud_score_snapshots
  for select to authenticated using (public.is_admin());

-- ── 4. E-money limits in wallet enforcement ──────────────────────
create or replace function public._check_emoney_limits(p_user uuid, p_amount_xaf numeric)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cfg public.emoney_license_config;
  v_wallet public.wallets;
  v_daily numeric;
begin
  select * into v_cfg from public.emoney_license_config where id = 1;
  if not found then return; end if;
  if v_cfg.license_status = 'suspended' then
    raise exception 'Licence e-money suspendue — operations indisponibles.';
  end if;

  if p_amount_xaf > v_cfg.max_single_tx_xaf then
    raise exception 'Plafond licence e-money par transaction (% XAF).', v_cfg.max_single_tx_xaf;
  end if;

  select coalesce(sum(amount_xaf), 0) into v_daily
  from public.wallet_transactions
  where user_id = p_user and type in ('withdraw', 'transfer_out')
    and created_at >= date_trunc('day', now());

  if v_daily + p_amount_xaf > v_cfg.max_daily_outflow_xaf then
    raise exception 'Plafond journalier licence e-money depasse.';
  end if;

  select * into v_wallet from public.wallets where user_id = p_user;
  if found and v_wallet.balance_xaf > v_cfg.max_user_balance_xaf then
    raise exception 'Solde maximum par utilisateur depasse (licence e-money).';
  end if;
end;
$$;

-- Patch _enforce_wallet_outbound to call emoney limits
create or replace function public._enforce_wallet_outbound(
  p_user uuid, p_amount_xaf numeric, p_require_kyc boolean default false
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_profile public.profiles;
  v_daily_total numeric;
  v_per_tx_limit numeric := 500000;
  v_daily_limit numeric := 1000000;
begin
  if p_user is null then raise exception 'Non authentifie.'; end if;
  if p_amount_xaf is null or p_amount_xaf <= 0 then raise exception 'Montant invalide.'; end if;
  if p_amount_xaf > v_per_tx_limit then
    raise exception 'Plafond par transaction depasse (% XAF max).', v_per_tx_limit;
  end if;

  perform public._check_emoney_limits(p_user, p_amount_xaf);

  select * into v_profile from public.profiles where id = p_user;
  if not found then raise exception 'Profil introuvable.'; end if;

  if coalesce(v_profile.is_blacklisted, false)
     or 'blacklisted' = any(coalesce(v_profile.trust_flags, '{}'))
     or 'fraud_confirmed' = any(coalesce(v_profile.trust_flags, '{}')) then
    raise exception 'Compte suspendu — contactez le support.';
  end if;

  if coalesce(v_profile.wallet_frozen, false) then
    raise exception 'Wallet gele — activite suspecte detectee.';
  end if;

  if p_require_kyc and coalesce(v_profile.kyc_status, 'not_submitted') <> 'approved' then
    raise exception 'KYC approuve requis pour les retraits (reglementation LCB-FT).';
  end if;

  select coalesce(sum(amount_xaf), 0) into v_daily_total
  from public.wallet_transactions
  where user_id = p_user and type in ('withdraw', 'transfer_out')
    and created_at >= date_trunc('day', now());

  if v_daily_total + p_amount_xaf > v_daily_limit then
    raise exception 'Plafond journalier depasse (% XAF/jour).', v_daily_limit;
  end if;
end;
$$;

-- wallet_withdraw with XOF/NGN/GHS native balances
create or replace function public.wallet_withdraw(
  p_amount numeric, p_currency text, p_provider text, p_phone text, p_amount_xaf numeric
) returns public.wallet_transactions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
  v_xaf numeric := coalesce(p_amount_xaf, p_amount);
begin
  perform public._enforce_wallet_outbound(v_user, v_xaf, true);
  if p_currency not in ('XAF','XOF','NGN','GHS','USD','EUR') then raise exception 'Devise invalide.'; end if;

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
