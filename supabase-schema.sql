-- ============================================================
-- HODIX — Schéma Supabase complet
-- Exécuter dans Supabase > SQL Editor > New query
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── PROFILES ────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid references auth.users on delete cascade primary key,
  full_name     text not null default '',
  phone         text,
  gender        text,
  country       text,
  city          text,
  occupation    text,
  photo_url     text,
  role          text not null default 'member', -- member | tontine_manager | super_admin
  is_active     boolean not null default true,
  kyc_status    text not null default 'not_submitted',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- ── TONTINES ────────────────────────────────────────────────
create table if not exists public.tontines (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid references auth.users not null,
  name                text not null,
  description         text,
  invite_code         text unique not null,
  contribution_amount numeric not null default 0,
  currency            text not null default 'XAF',
  frequency           text not null default 'monthly',
  max_members         int not null default 10,
  rotation_mode       text not null default 'rotation',
  current_cycle       int not null default 1,
  is_active           boolean not null default true,
  is_public           boolean not null default false,
  created_at          timestamptz not null default now()
);

create table if not exists public.tontine_members (
  id                uuid primary key default gen_random_uuid(),
  tontine_id        uuid references public.tontines on delete cascade not null,
  user_id           uuid references auth.users not null,
  role              text not null default 'member', -- admin | member
  rotation_position int,
  has_received      boolean not null default false,
  status            text not null default 'a_jour',
  cycles_paid       int not null default 0,
  joined_at         timestamptz not null default now(),
  unique(tontine_id, user_id)
);

create table if not exists public.tontine_contributions (
  id         uuid primary key default gen_random_uuid(),
  tontine_id uuid references public.tontines on delete cascade not null,
  user_id    uuid references auth.users not null,
  amount     numeric not null,
  cycle      int not null default 1,
  created_at timestamptz not null default now()
);

alter table public.tontines enable row level security;
alter table public.tontine_members enable row level security;
alter table public.tontine_contributions enable row level security;

create or replace function public.is_tontine_owner(p_tontine_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.tontines where id = p_tontine_id and owner_id = auth.uid());
$$;

create or replace function public.is_tontine_member(p_tontine_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.tontine_members where tontine_id = p_tontine_id and user_id = auth.uid());
$$;

create policy "tontines_select" on public.tontines for select using (
  is_public = true or owner_id = auth.uid() or public.is_tontine_member(id)
);
create policy "tontines_insert" on public.tontines for insert with check (auth.uid() = owner_id);
create policy "tontines_update" on public.tontines for update using (auth.uid() = owner_id);

create policy "tontine_members_select" on public.tontine_members for select using (
  user_id = auth.uid() or public.is_tontine_owner(tontine_id)
);
create policy "tontine_members_insert" on public.tontine_members for insert with check (
  public.is_tontine_owner(tontine_id)
  or (user_id = auth.uid() and coalesce(role, 'member') = 'member')
);

create policy "tontine_contributions_select" on public.tontine_contributions for select using (
  user_id = auth.uid() or public.is_tontine_owner(tontine_id)
);
create policy "tontine_contributions_insert" on public.tontine_contributions for insert with check (auth.uid() = user_id);

-- ── ASSOCIATIONS ─────────────────────────────────────────────
create table if not exists public.associations (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid references auth.users not null,
  name                text not null,
  description         text,
  invite_code         text unique not null,
  contribution_amount numeric not null default 0,
  currency            text not null default 'XAF',
  frequency           text not null default 'monthly',
  total_collected     numeric not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

create table if not exists public.association_members (
  id             uuid primary key default gen_random_uuid(),
  association_id uuid references public.associations on delete cascade not null,
  user_id        uuid references auth.users not null,
  role           text not null default 'member',
  joined_at      timestamptz not null default now(),
  unique(association_id, user_id)
);

create table if not exists public.association_contributions (
  id             uuid primary key default gen_random_uuid(),
  association_id uuid references public.associations on delete cascade not null,
  user_id        uuid references auth.users not null,
  amount         numeric not null,
  created_at     timestamptz not null default now()
);

alter table public.associations enable row level security;
alter table public.association_members enable row level security;
alter table public.association_contributions enable row level security;

create policy "associations_select" on public.associations for select using (
  owner_id = auth.uid() or
  exists (select 1 from public.association_members where association_id = id and user_id = auth.uid())
);
create policy "associations_insert" on public.associations for insert with check (auth.uid() = owner_id);
create policy "associations_update" on public.associations for update using (auth.uid() = owner_id);
create policy "assoc_members_all" on public.association_members for all using (true);
create policy "assoc_contribs_all" on public.association_contributions for all using (true);

-- ── COOPERATIVES ──────────────────────────────────────────────
create table if not exists public.cooperatives (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references auth.users not null,
  name            text not null,
  description     text,
  invite_code     text unique not null,
  current_balance numeric not null default 0,
  currency        text not null default 'XAF',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.cooperative_members (
  id             uuid primary key default gen_random_uuid(),
  cooperative_id uuid references public.cooperatives on delete cascade not null,
  user_id        uuid references auth.users not null,
  role           text not null default 'member',
  joined_at      timestamptz not null default now(),
  unique(cooperative_id, user_id)
);

create table if not exists public.cooperative_contributions (
  id             uuid primary key default gen_random_uuid(),
  cooperative_id uuid references public.cooperatives on delete cascade not null,
  user_id        uuid references auth.users not null,
  amount         numeric not null,
  created_at     timestamptz not null default now()
);

alter table public.cooperatives enable row level security;
alter table public.cooperative_members enable row level security;
alter table public.cooperative_contributions enable row level security;

create policy "coops_select" on public.cooperatives for select using (
  owner_id = auth.uid() or
  exists (select 1 from public.cooperative_members where cooperative_id = id and user_id = auth.uid())
);
create policy "coops_insert" on public.cooperatives for insert with check (auth.uid() = owner_id);
create policy "coops_update" on public.cooperatives for update using (auth.uid() = owner_id);
create policy "coop_members_all" on public.cooperative_members for all using (true);
create policy "coop_contribs_all" on public.cooperative_contributions for all using (true);

-- ── COMMUNITY FUNDS ───────────────────────────────────────────
create table if not exists public.community_funds (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references auth.users not null,
  name            text not null,
  description     text,
  target_amount   numeric,
  current_balance numeric not null default 0,
  currency        text not null default 'XAF',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.fund_contributions (
  id         uuid primary key default gen_random_uuid(),
  fund_id    uuid references public.community_funds on delete cascade not null,
  user_id    uuid references auth.users not null,
  amount     numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.fund_members (
  id         uuid primary key default gen_random_uuid(),
  fund_id    uuid references public.community_funds on delete cascade not null,
  user_id    uuid references auth.users not null,
  joined_at  timestamptz not null default now(),
  unique(fund_id, user_id)
);

alter table public.community_funds enable row level security;
alter table public.fund_contributions enable row level security;
alter table public.fund_members enable row level security;

create policy "funds_select" on public.community_funds for select using (true);
create policy "funds_insert" on public.community_funds for insert with check (auth.uid() = owner_id);
create policy "funds_update" on public.community_funds for update using (auth.uid() = owner_id);
create policy "fund_contribs_all" on public.fund_contributions for all using (true);
create policy "fund_members_all" on public.fund_members for all using (true);

-- ── SAVINGS ───────────────────────────────────────────────────
create table if not exists public.savings_goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  name           text not null,
  savings_type   text not null default 'flexible', -- flexible | locked | recurring
  target_amount  numeric not null,
  current_amount numeric not null default 0,
  currency       text not null default 'XAF',
  deadline       date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.savings_transactions (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid references public.savings_goals on delete cascade not null,
  user_id    uuid references auth.users not null,
  amount     numeric not null,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.savings_goals enable row level security;
alter table public.savings_transactions enable row level security;

create policy "savings_goals_own" on public.savings_goals for all using (auth.uid() = user_id);
create policy "savings_tx_own" on public.savings_transactions for all using (auth.uid() = user_id);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  title      text not null,
  body       text not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
create policy "notifs_own" on public.notifications for all using (auth.uid() = user_id);

-- ── KYC ───────────────────────────────────────────────────────
create table if not exists public.kyc_submissions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null unique,
  status       text not null default 'pending', -- pending | approved | rejected
  notes        text,
  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz
);

alter table public.kyc_submissions enable row level security;
create policy "kyc_own" on public.kyc_submissions for all using (auth.uid() = user_id);

-- ── IDENTITY EVENTS (trust score) ────────────────────────────
create table if not exists public.identity_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  event_type  text not null,
  points_delta numeric not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.identity_events enable row level security;
create policy "identity_events_own" on public.identity_events for all using (auth.uid() = user_id);

-- Auto-award signup bonus when profile is created
create or replace function public.award_signup_bonus()
returns trigger language plpgsql security definer as $$
begin
  insert into public.identity_events (user_id, event_type, points_delta)
  values (new.id, 'signup_bonus', 5)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute procedure public.award_signup_bonus();

-- ── PAYMENTS ──────────────────────────────────────────────────
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  amount      numeric not null,
  currency    text not null default 'XAF',
  direction   text not null default 'out', -- in | out
  description text,
  status      text not null default 'completed',
  created_at  timestamptz not null default now()
);

alter table public.payments enable row level security;
create policy "payments_own" on public.payments for all using (auth.uid() = user_id);

-- ── PUSH TOKENS ───────────────────────────────────────────────
create table if not exists public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null unique,
  token      text not null,
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;
create policy "push_tokens_own" on public.push_tokens for all using (auth.uid() = user_id);

-- ── HELPER: members count view ────────────────────────────────
create or replace view public.tontines_with_count as
  select t.*, count(tm.id)::int as members_count
  from public.tontines t
  left join public.tontine_members tm on tm.tontine_id = t.id
  group by t.id;

create or replace view public.associations_with_count as
  select a.*, count(am.id)::int as members_count
  from public.associations a
  left join public.association_members am on am.association_id = a.id
  group by a.id;

create or replace view public.cooperatives_with_count as
  select c.*, count(cm.id)::int as members_count
  from public.cooperatives c
  left join public.cooperative_members cm on cm.cooperative_id = c.id
  group by c.id;
