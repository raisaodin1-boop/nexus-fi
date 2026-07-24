-- ═══════════════════════════════════════════════════════════════
-- HODIX — Security hardening + wallet infrastructure
-- Applied to project hodixemergent (lrbhojxlofweotajnrhh) on 2026-06-10.
--
-- 1) Missing columns referenced by the app (email, device_fingerprint,
--    trust_flags, notifications.type/metadata, contributions.paid_at)
-- 2) Wallets + wallet_transactions tables (previously missing!)
-- 3) Atomic server-side wallet operations (no client balance writes)
-- 4) RLS hardening: profiles, tontine_members, associations,
--    cooperatives, community funds
-- 5) Private wallet_security table for PIN hashes
-- ═══════════════════════════════════════════════════════════════

-- ── Helper: admin check without RLS recursion ──────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')) $$;

-- ── A. profiles: missing columns + backfill ─────────────────────
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists device_fingerprint text;
alter table public.profiles add column if not exists trust_flags text[] not null default '{}';
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;
create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_phone_idx on public.profiles (phone);

-- ── B. profiles: granular RLS (old policy allowed DELETE of any profile) ──
drop policy if exists "allow_authenticated" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- no DELETE policy: profiles cannot be deleted from the client.

-- ── C. block self-privilege-escalation on protected columns ────
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.role is distinct from old.role or new.is_blacklisted is distinct from old.is_blacklisted)
     and not public.is_admin() then
    raise exception 'Modification non autorisée (champ protégé).';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_columns_trg on public.profiles;
create trigger protect_profile_columns_trg before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ── D. notifications: columns required by OTP + security flows ──
alter table public.notifications add column if not exists type text;
alter table public.notifications add column if not exists metadata jsonb;

-- ── E. tontine_contributions: columns used by wallet payments ───
alter table public.tontine_contributions add column if not exists paid_at timestamptz;
alter table public.tontine_contributions add column if not exists payment_method text;

-- ── F. flagged_devices (referenced by fraud engine, was missing) ─
create table if not exists public.flagged_devices (
  id          uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  user_id     uuid references auth.users,
  reason      text,
  flagged_at  timestamptz not null default now()
);
alter table public.flagged_devices enable row level security;
drop policy if exists "flagged_devices_select" on public.flagged_devices;
drop policy if exists "flagged_devices_write" on public.flagged_devices;
create policy "flagged_devices_select" on public.flagged_devices for select to authenticated using (true);
create policy "flagged_devices_write" on public.flagged_devices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── G. WALLETS (table was completely missing in production) ─────
create table if not exists public.wallets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null unique,
  balance_xaf numeric(15,2) not null default 0 check (balance_xaf >= 0),
  balance_usd numeric(15,4) not null default 0 check (balance_usd >= 0),
  balance_eur numeric(15,4) not null default 0 check (balance_eur >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.wallets enable row level security;
drop policy if exists "wallets_select" on public.wallets;
drop policy if exists "wallets_insert" on public.wallets;
create policy "wallets_select" on public.wallets for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "wallets_insert" on public.wallets for insert to authenticated with check (user_id = auth.uid());
-- NO update/delete policies: balances move ONLY through the functions below.

create table if not exists public.wallet_transactions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users not null,
  counterpart_id        uuid references auth.users,
  counterpart_name      text,
  type                  text not null check (type in ('topup','withdraw','transfer_in','transfer_out','contribution')),
  amount                numeric(15,2) not null check (amount > 0),
  currency              text not null default 'XAF' check (currency in ('XAF','USD','EUR')),
  amount_xaf            numeric(15,2) not null,
  reference             text,
  tontine_id            uuid,
  balance_after         numeric(15,2),
  note                  text,
  status                text not null default 'completed',
  mobile_money_provider text,
  mobile_money_number   text,
  created_at            timestamptz not null default now()
);
alter table public.wallet_transactions enable row level security;
drop policy if exists "wallet_tx_select" on public.wallet_transactions;
create policy "wallet_tx_select" on public.wallet_transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- NO insert policy: rows are written only by the security-definer functions.
create index if not exists wallet_tx_user_created_idx on public.wallet_transactions (user_id, created_at desc);

-- ── H. Atomic wallet operations ─────────────────────────────────
-- All money movements are single-statement atomic updates with
-- balance guards → no race conditions, no negative balances.

create or replace function public.wallet_topup(
  p_amount numeric, p_currency text, p_provider text, p_phone text, p_amount_xaf numeric
) returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 5000000 then raise exception 'Montant invalide.'; end if;
  if p_currency not in ('XAF','USD','EUR') then raise exception 'Devise invalide.'; end if;

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
     'completed', p_provider, p_phone, 'Recharge via ' || coalesce(p_provider, 'Mobile Money'))
  returning * into v_tx;
  return v_tx;
end $$;

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
    (user_id, type, amount, currency, amount_xaf, reference, status, mobile_money_provider, mobile_money_number, note)
  values
    (v_user, 'withdraw', p_amount, p_currency, coalesce(p_amount_xaf, p_amount),
     'WDR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     'completed', p_provider, p_phone, 'Retrait vers ' || coalesce(p_provider, 'Mobile Money'))
  returning * into v_tx;
  return v_tx;
end $$;

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
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;
  if p_currency not in ('XAF','USD','EUR') then raise exception 'Devise invalide.'; end if;
  if p_recipient is null or p_recipient = v_user then raise exception 'Destinataire invalide.'; end if;

  select full_name into v_recipient_name from public.profiles where id = p_recipient;
  if v_recipient_name is null then raise exception 'Membre introuvable.'; end if;
  select full_name into v_sender_name from public.profiles where id = v_user;

  -- Debit sender (atomic, balance-guarded)
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

  -- Credit recipient (wallet auto-created), same transaction → all-or-nothing
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
    (v_user, p_recipient, v_recipient_name, 'transfer_out', p_amount, p_currency, coalesce(p_amount_xaf, p_amount), v_ref, p_note, 'completed')
  returning * into v_tx;

  insert into public.wallet_transactions
    (user_id, counterpart_id, counterpart_name, type, amount, currency, amount_xaf, reference, note, status)
  values
    (p_recipient, v_user, coalesce(v_sender_name, 'Hodix User'), 'transfer_in', p_amount, p_currency, coalesce(p_amount_xaf, p_amount), v_ref, p_note, 'completed');

  return v_tx;
end $$;

create or replace function public.wallet_pay_contribution(
  p_tontine uuid, p_amount numeric, p_cycle int
) returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
  v_name text;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;

  update public.wallets set balance_xaf = balance_xaf - p_amount, updated_at = now()
    where user_id = v_user and balance_xaf >= p_amount;
  if not found then raise exception 'Solde XAF insuffisant.'; end if;

  select name into v_name from public.tontines where id = p_tontine;

  insert into public.tontine_contributions (tontine_id, user_id, amount, cycle, paid_at, payment_method)
  values (p_tontine, v_user, p_amount, p_cycle, now(), 'wallet');

  insert into public.wallet_transactions
    (user_id, type, amount, currency, amount_xaf, reference, tontine_id, note, status)
  values
    (v_user, 'contribution', p_amount, 'XAF', p_amount,
     'CTB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     p_tontine, 'Cotisation tontine' || coalesce(' — ' || v_name, '') || ' (cycle ' || p_cycle || ')', 'completed')
  returning * into v_tx;
  return v_tx;
end $$;

revoke all on function public.wallet_topup(numeric, text, text, text, numeric) from public, anon;
revoke all on function public.wallet_withdraw(numeric, text, text, text, numeric) from public, anon;
revoke all on function public.wallet_transfer(uuid, numeric, text, numeric, text) from public, anon;
revoke all on function public.wallet_pay_contribution(uuid, numeric, int) from public, anon;
grant execute on function public.wallet_topup(numeric, text, text, text, numeric) to authenticated;
grant execute on function public.wallet_withdraw(numeric, text, text, text, numeric) to authenticated;
grant execute on function public.wallet_transfer(uuid, numeric, text, numeric, text) to authenticated;
grant execute on function public.wallet_pay_contribution(uuid, numeric, int) to authenticated;

-- ── I. RLS hardening: tontine members ───────────────────────────
drop policy if exists "tontine_members_insert" on public.tontine_members;
create policy "tontine_members_insert" on public.tontine_members for insert to authenticated with check (
  exists (select 1 from public.tontines t where t.id = tontine_id and t.owner_id = auth.uid())
  or (user_id = auth.uid() and coalesce(role, 'member') = 'member')
);

-- ── J. RLS hardening: associations ──────────────────────────────
drop policy if exists "assoc_members_all" on public.association_members;
create policy "assoc_members_select" on public.association_members for select to authenticated using (true);
create policy "assoc_members_insert" on public.association_members for insert to authenticated with check (
  user_id = auth.uid()
  or exists (select 1 from public.associations a where a.id = association_id and a.owner_id = auth.uid())
);
create policy "assoc_members_delete" on public.association_members for delete to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.associations a where a.id = association_id and a.owner_id = auth.uid())
);

drop policy if exists "assoc_contribs_all" on public.association_contributions;
create policy "assoc_contribs_select" on public.association_contributions for select to authenticated using (true);
create policy "assoc_contribs_insert" on public.association_contributions for insert to authenticated with check (user_id = auth.uid());

-- ── K. RLS hardening: cooperatives ──────────────────────────────
drop policy if exists "coop_members_all" on public.cooperative_members;
create policy "coop_members_select" on public.cooperative_members for select to authenticated using (true);
create policy "coop_members_insert" on public.cooperative_members for insert to authenticated with check (
  user_id = auth.uid()
  or exists (select 1 from public.cooperatives c where c.id = cooperative_id and c.owner_id = auth.uid())
);
create policy "coop_members_delete" on public.cooperative_members for delete to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.cooperatives c where c.id = cooperative_id and c.owner_id = auth.uid())
);

drop policy if exists "coop_contribs_all" on public.cooperative_contributions;
create policy "coop_contribs_select" on public.cooperative_contributions for select to authenticated using (true);
create policy "coop_contribs_insert" on public.cooperative_contributions for insert to authenticated with check (user_id = auth.uid());

-- ── L. RLS hardening: community funds ───────────────────────────
drop policy if exists "fund_members_all" on public.fund_members;
create policy "fund_members_select" on public.fund_members for select to authenticated using (true);
create policy "fund_members_insert" on public.fund_members for insert to authenticated with check (
  user_id = auth.uid()
  or exists (select 1 from public.community_funds f where f.id = fund_id and f.owner_id = auth.uid())
);
create policy "fund_members_delete" on public.fund_members for delete to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.community_funds f where f.id = fund_id and f.owner_id = auth.uid())
);

drop policy if exists "fund_contribs_all" on public.fund_contributions;
create policy "fund_contribs_select" on public.fund_contributions for select to authenticated using (true);
create policy "fund_contribs_insert" on public.fund_contributions for insert to authenticated with check (user_id = auth.uid());

-- ── M. Private PIN-hash storage ──────────────────────────────────
-- PIN hashes must not live in the publicly-selectable profiles table.
create table if not exists public.wallet_security (
  user_id    uuid primary key references auth.users,
  pin_hash   text,
  updated_at timestamptz not null default now()
);
alter table public.wallet_security enable row level security;
drop policy if exists "wallet_security_own" on public.wallet_security;
create policy "wallet_security_own" on public.wallet_security for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into public.wallet_security (user_id, pin_hash)
  select id, wallet_pin_hash from public.profiles where wallet_pin_hash is not null
  on conflict (user_id) do update set pin_hash = excluded.pin_hash;
update public.profiles set wallet_pin_hash = null where wallet_pin_hash is not null;
