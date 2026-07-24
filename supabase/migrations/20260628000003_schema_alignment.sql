-- Align production schema with application code references.

-- profiles
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists birth_place text;
alter table public.profiles add column if not exists neighborhood text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists kyc_status text default 'not_submitted';
alter table public.profiles add column if not exists trust_score numeric default 0;
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by text;
alter table public.profiles add column if not exists referral_bonus numeric default 0;
alter table public.profiles add column if not exists wallet_frozen boolean not null default false;
alter table public.profiles add column if not exists is_blacklisted boolean not null default false;
alter table public.profiles add column if not exists push_consent boolean default false;
alter table public.profiles add column if not exists marketing_consent boolean default false;

-- tontines
alter table public.tontines add column if not exists amount_per_cycle numeric;
alter table public.tontines add column if not exists reserve_fund numeric not null default 0;
alter table public.tontines add column if not exists status text not null default 'active';
alter table public.tontines add column if not exists language text;
alter table public.tontines add column if not exists country text;
alter table public.tontines add column if not exists cycle_deadline timestamptz;
update public.tontines set amount_per_cycle = contribution_amount where amount_per_cycle is null and contribution_amount is not null;

-- tontine_members
alter table public.tontine_members add column if not exists last_paid_cycle int;
alter table public.tontine_members add column if not exists excluded_at timestamptz;
alter table public.tontine_members add column if not exists exclusion_reason text;

-- savings_transactions
alter table public.savings_transactions add column if not exists type text default 'deposit';

-- tontine_escrow
create table if not exists public.tontine_escrow (
  id uuid primary key default gen_random_uuid(),
  tontine_id uuid references public.tontines on delete cascade not null,
  cycle int not null default 1,
  amount numeric not null default 0,
  release_at timestamptz,
  status text not null default 'held',
  dispute_count int not null default 0,
  created_at timestamptz not null default now(),
  unique(tontine_id, cycle)
);
alter table public.tontine_escrow enable row level security;
drop policy if exists "tontine_escrow_member" on public.tontine_escrow;
create policy "tontine_escrow_member" on public.tontine_escrow for select to authenticated
  using (public.is_tontine_member(tontine_id) or public.is_tontine_owner(tontine_id));

-- exclusion_votes
create table if not exists public.exclusion_votes (
  id uuid primary key default gen_random_uuid(),
  tontine_id uuid references public.tontines on delete cascade not null,
  target_user_id uuid references auth.users not null,
  voter_id uuid references auth.users not null,
  reason text,
  voted_at timestamptz not null default now()
);
alter table public.exclusion_votes enable row level security;
drop policy if exists "exclusion_votes_select" on public.exclusion_votes;
create policy "exclusion_votes_select" on public.exclusion_votes for select to authenticated
  using (public.is_tontine_member(tontine_id));
drop policy if exists "exclusion_votes_insert" on public.exclusion_votes;
create policy "exclusion_votes_insert" on public.exclusion_votes for insert to authenticated
  with check (voter_id = auth.uid() and public.is_tontine_member(tontine_id));

-- creator_ratings
create table if not exists public.creator_ratings (
  id uuid primary key default gen_random_uuid(),
  tontine_id uuid references public.tontines on delete cascade not null,
  creator_id uuid references auth.users not null,
  rater_id uuid references auth.users not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
alter table public.creator_ratings enable row level security;
drop policy if exists "creator_ratings_select" on public.creator_ratings;
create policy "creator_ratings_select" on public.creator_ratings for select to authenticated using (true);
drop policy if exists "creator_ratings_insert" on public.creator_ratings;
create policy "creator_ratings_insert" on public.creator_ratings for insert to authenticated with check (rater_id = auth.uid());

-- tontine_consent (table name in production)
create table if not exists public.tontine_consent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  tontine_id uuid references public.tontines on delete cascade,
  version text not null default '1.0',
  signed_at timestamptz not null default now()
);
alter table public.tontine_consent enable row level security;
drop policy if exists "tontine_consent_own" on public.tontine_consent;
create policy "tontine_consent_own" on public.tontine_consent for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- identity_scores
create table if not exists public.identity_scores (
  user_id uuid primary key references auth.users,
  score numeric not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.identity_scores enable row level security;
drop policy if exists "identity_scores_select" on public.identity_scores;
create policy "identity_scores_select" on public.identity_scores for select to authenticated using (true);
drop policy if exists "identity_scores_own" on public.identity_scores;
create policy "identity_scores_own" on public.identity_scores for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
