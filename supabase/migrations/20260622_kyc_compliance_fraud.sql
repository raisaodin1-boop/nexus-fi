-- HODIX — KYC enforcement, COBAC/CEMAC audit trail, server-side wallet security

-- ── 1. Immutable compliance audit log (LCB-FT / COBAC traceability) ──
create table if not exists public.compliance_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  actor_id uuid,
  event_category text not null check (event_category in ('financial', 'kyc', 'fraud', 'auth', 'admin', 'security')),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  amount_xaf numeric,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists compliance_audit_log_user_idx on public.compliance_audit_log (user_id, created_at desc);
create index if not exists compliance_audit_log_category_idx on public.compliance_audit_log (event_category, created_at desc);

alter table public.compliance_audit_log enable row level security;

drop policy if exists "compliance_audit_admin_read" on public.compliance_audit_log;
create policy "compliance_audit_admin_read" on public.compliance_audit_log
  for select to authenticated using (public.is_admin());

drop policy if exists "compliance_audit_own_read" on public.compliance_audit_log;
create policy "compliance_audit_own_read" on public.compliance_audit_log
  for select to authenticated using (user_id = auth.uid());

create or replace function public.prevent_compliance_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'compliance_audit_log is append-only (COBAC/CEMAC retention).';
end;
$$;

drop trigger if exists compliance_audit_no_update on public.compliance_audit_log;
create trigger compliance_audit_no_update
  before update or delete on public.compliance_audit_log
  for each row execute function public.prevent_compliance_audit_mutation();

create or replace function public.log_compliance_event(
  p_user_id uuid,
  p_category text,
  p_event_type text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_amount_xaf numeric default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  insert into public.compliance_audit_log
    (user_id, actor_id, event_category, event_type, entity_type, entity_id, amount_xaf, metadata)
  values
    (p_user_id, coalesce(p_actor_id, auth.uid()), p_category, p_event_type,
     p_entity_type, p_entity_id, p_amount_xaf, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.log_compliance_event(uuid, text, text, text, uuid, numeric, jsonb, uuid) from public, anon;
grant execute on function public.log_compliance_event(uuid, text, text, text, uuid, numeric, jsonb, uuid) to authenticated, service_role;

-- ── 2. Fraud alerts queue (ops / compliance dashboard) ─────────────
create table if not exists public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  alert_type text not null,
  amount_xaf numeric,
  flags text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'confirmed')),
  metadata jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  reviewed_by uuid
);

create index if not exists fraud_alerts_status_idx on public.fraud_alerts (status, created_at desc);

alter table public.fraud_alerts enable row level security;

drop policy if exists "fraud_alerts_admin" on public.fraud_alerts;
create policy "fraud_alerts_admin" on public.fraud_alerts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.create_fraud_alert(
  p_user_id uuid,
  p_alert_type text,
  p_severity text default 'medium',
  p_amount_xaf numeric default null,
  p_flags text[] default '{}',
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id and not public.is_admin() then
    raise exception 'Non autorise.';
  end if;

  insert into public.fraud_alerts (user_id, alert_type, severity, amount_xaf, flags, metadata)
  values (p_user_id, p_alert_type, coalesce(p_severity, 'medium'), p_amount_xaf, coalesce(p_flags, '{}'), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  perform public.log_compliance_event(
    p_user_id, 'fraud', p_alert_type, 'fraud_alert', v_id, p_amount_xaf,
    jsonb_build_object('severity', p_severity, 'flags', p_flags) || coalesce(p_metadata, '{}'::jsonb)
  );
  return v_id;
end;
$$;

revoke all on function public.create_fraud_alert(uuid, text, text, numeric, text[], jsonb) from public, anon;
grant execute on function public.create_fraud_alert(uuid, text, text, numeric, text[], jsonb) to authenticated, service_role;

-- ── 3. Server-side wallet outbound guards ─────────────────────────
create or replace function public._enforce_wallet_outbound(
  p_user uuid,
  p_amount_xaf numeric,
  p_require_kyc boolean default false
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
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
  where user_id = p_user
    and type in ('withdraw', 'transfer_out')
    and created_at >= date_trunc('day', now());

  if v_daily_total + p_amount_xaf > v_daily_limit then
    raise exception 'Plafond journalier depasse (% XAF/jour).', v_daily_limit;
  end if;
end;
$$;

-- wallet_withdraw: KYC + limits + pending_disbursement (from cinetpay migration)
create or replace function public.wallet_withdraw(
  p_amount numeric, p_currency text, p_provider text, p_phone text, p_amount_xaf numeric
) returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
  v_xaf numeric := coalesce(p_amount_xaf, p_amount);
begin
  perform public._enforce_wallet_outbound(v_user, v_xaf, true);

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

-- wallet_transfer: limits + freeze (no KYC required for P2P under limits)
create or replace function public.wallet_transfer(
  p_recipient uuid, p_amount numeric, p_currency text, p_amount_xaf numeric, p_note text
) returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
  v_ref text := 'TRF-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
  v_sender_name text;
  v_recipient_name text;
  v_xaf numeric := coalesce(p_amount_xaf, p_amount);
begin
  perform public._enforce_wallet_outbound(v_user, v_xaf, false);

  if p_currency not in ('XAF','USD','EUR') then raise exception 'Devise invalide.'; end if;
  if p_recipient is null or p_recipient = v_user then raise exception 'Destinataire invalide.'; end if;

  select full_name into v_recipient_name from public.profiles where id = p_recipient;
  if v_recipient_name is null then raise exception 'Membre introuvable.'; end if;
  select full_name into v_sender_name from public.profiles where id = v_user;

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

  insert into public.wallets (user_id) values (p_recipient) on conflict (user_id) do nothing;
  if p_currency = 'XAF' then
    update public.wallets set balance_xaf = balance_xaf + p_amount, updated_at = now() where user_id = p_recipient;
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

-- KYC audit on submission status change
create or replace function public.audit_kyc_status_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform public.log_compliance_event(
      new.user_id, 'kyc', 'kyc_status_' || new.status, 'kyc_submission', new.id, null,
      jsonb_build_object('old_status', old.status, 'new_status', new.status, 'provider', new.provider)
    );
    if new.status = 'approved' then
      insert into public.identity_events (user_id, event_type, points_delta)
      values (new.user_id, 'kyc_completed', 5);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists kyc_submissions_audit on public.kyc_submissions;
create trigger kyc_submissions_audit
  after update on public.kyc_submissions
  for each row execute function public.audit_kyc_status_change();
