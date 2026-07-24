-- Tables for routes migrated from legacy FastAPI backend

create or replace function public.is_tontine_admin(p_tontine_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_tontine_owner(p_tontine_id) or exists (
    select 1 from public.tontine_members
    where tontine_id = p_tontine_id and user_id = auth.uid() and role = 'admin'
  );
$$;

create table if not exists public.tontine_disbursements (
  id uuid primary key default gen_random_uuid(),
  tontine_id uuid references public.tontines on delete cascade not null,
  beneficiary_id uuid references auth.users not null,
  beneficiary_name text not null,
  amount numeric not null check (amount > 0),
  cycle int not null default 1,
  note text,
  recorded_by uuid references auth.users not null,
  disbursed_at timestamptz not null default now()
);

alter table public.tontine_disbursements enable row level security;

create policy "disbursements_select_member" on public.tontine_disbursements
  for select using (
    public.is_tontine_member(tontine_id) or public.is_tontine_admin(tontine_id)
  );

create policy "disbursements_insert_admin" on public.tontine_disbursements
  for insert with check (public.is_tontine_admin(tontine_id));

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  amount_xaf numeric not null check (amount_xaf >= 500),
  commission_xaf numeric not null default 0,
  net_xaf numeric not null,
  method text not null,
  phone text,
  reason text,
  goal_id uuid references public.savings_goals on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.withdrawal_requests enable row level security;
create policy "withdrawals_own" on public.withdrawal_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.payment_config (
  id text primary key default 'global',
  stripe_fee_rate numeric not null default 0.029,
  stripe_fixed_fee_usd numeric not null default 0.30,
  stripe_reserve_rate numeric not null default 0.005,
  hodix_commission_pct numeric not null default 1.5,
  mm_fee_rate numeric not null default 0,
  xaf_to_usd_rate numeric not null default 0.0018,
  xaf_to_eur_rate numeric not null default 0.0015,
  updated_at timestamptz not null default now()
);

insert into public.payment_config (id) values ('global') on conflict (id) do nothing;

alter table public.payment_config enable row level security;
create policy "payment_config_read" on public.payment_config for select using (auth.role() = 'authenticated');
create policy "payment_config_admin" on public.payment_config for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.certificate_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  kind text not null,
  amount_xaf numeric not null default 10000,
  status text not null default 'pending',
  payment_id uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.certificate_purchases enable row level security;
create policy "cert_purchases_own" on public.certificate_purchases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
