-- phone_verified, certificats, demandes de prêt, otp purpose

alter table public.profiles add column if not exists phone_verified boolean not null default false;

alter table public.otp_codes add column if not exists purpose text not null default 'transaction';
alter table public.otp_codes add column if not exists phone text;

create table if not exists public.identity_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  doc_id text not null,
  doc_type text not null,
  content_hash text not null unique,
  verify_url text not null,
  chain_ref text,
  created_at timestamptz not null default now()
);
alter table public.identity_certificates enable row level security;
drop policy if exists "identity_certs_own" on public.identity_certificates;
create policy "identity_certs_own" on public.identity_certificates
  for all to authenticated using (auth.uid() = user_id);

create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  amount_xaf numeric not null,
  duration_months int not null default 12,
  purpose text,
  credit_score int,
  status text not null default 'pending',
  partner_ref text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.loan_applications enable row level security;
drop policy if exists "loan_apps_own" on public.loan_applications;
create policy "loan_apps_own" on public.loan_applications
  for all to authenticated using (auth.uid() = user_id);

alter table public.tontines add column if not exists auto_advance boolean not null default true;
