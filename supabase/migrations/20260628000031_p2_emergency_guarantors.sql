-- P2: Caisse secours (collective goals + votes) & Giga-Garant (tontine guarantors)

create table if not exists public.collective_goals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users not null,
  name text not null,
  description text,
  target_amount numeric not null check (target_amount > 0),
  current_amount numeric not null default 0,
  deadline date,
  goal_type text not null default 'standard' check (goal_type in ('standard', 'emergency')),
  vote_threshold_pct int not null default 60 check (vote_threshold_pct between 50 and 100),
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.collective_goal_members (
  goal_id uuid references public.collective_goals on delete cascade not null,
  user_id uuid references auth.users not null,
  joined_at timestamptz not null default now(),
  primary key (goal_id, user_id)
);

create table if not exists public.collective_goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references public.collective_goals on delete cascade not null,
  user_id uuid references auth.users not null,
  amount numeric not null check (amount > 0),
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.collective_goal_contributions
  add column if not exists is_anonymous boolean not null default false;

alter table public.collective_goals
  add column if not exists goal_type text not null default 'standard',
  add column if not exists vote_threshold_pct int not null default 60;

create table if not exists public.collective_fund_requests (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references public.collective_goals on delete cascade not null,
  requester_id uuid references auth.users not null,
  amount numeric not null check (amount > 0),
  reason text not null,
  event_type text not null default 'urgence' check (event_type in ('mariage', 'deuil', 'urgence', 'autre')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'released')),
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create table if not exists public.collective_fund_votes (
  request_id uuid references public.collective_fund_requests on delete cascade not null,
  voter_id uuid references auth.users not null,
  approve boolean not null,
  created_at timestamptz not null default now(),
  primary key (request_id, voter_id)
);

create table if not exists public.tontine_guarantors (
  id uuid primary key default gen_random_uuid(),
  tontine_id uuid references public.tontines on delete cascade not null,
  member_id uuid references auth.users not null,
  guarantor_id uuid references auth.users not null,
  status text not null default 'active' check (status in ('active', 'claimed', 'released')),
  created_at timestamptz not null default now(),
  unique (tontine_id, member_id, guarantor_id),
  check (member_id <> guarantor_id)
);

alter table public.collective_goals enable row level security;
alter table public.collective_goal_members enable row level security;
alter table public.collective_goal_contributions enable row level security;
alter table public.collective_fund_requests enable row level security;
alter table public.collective_fund_votes enable row level security;
alter table public.tontine_guarantors enable row level security;

drop policy if exists "collective_goals_member_read" on public.collective_goals;
create policy "collective_goals_member_read" on public.collective_goals for select using (
  exists (select 1 from public.collective_goal_members m where m.goal_id = id and m.user_id = auth.uid())
  or creator_id = auth.uid()
);

drop policy if exists "collective_goals_insert" on public.collective_goals;
create policy "collective_goals_insert" on public.collective_goals for insert with check (auth.uid() = creator_id);

drop policy if exists "collective_goals_update_creator" on public.collective_goals;
create policy "collective_goals_update_creator" on public.collective_goals for update using (auth.uid() = creator_id);

drop policy if exists "collective_members_all" on public.collective_goal_members;
create policy "collective_members_all" on public.collective_goal_members for all using (
  auth.uid() = user_id
  or exists (select 1 from public.collective_goal_members m where m.goal_id = goal_id and m.user_id = auth.uid())
);

drop policy if exists "collective_contrib_member" on public.collective_goal_contributions;
create policy "collective_contrib_member" on public.collective_goal_contributions for all using (
  auth.uid() = user_id
  or exists (select 1 from public.collective_goal_members m where m.goal_id = goal_id and m.user_id = auth.uid())
);

drop policy if exists "collective_requests_member" on public.collective_fund_requests;
create policy "collective_requests_member" on public.collective_fund_requests for all using (
  exists (select 1 from public.collective_goal_members m where m.goal_id = goal_id and m.user_id = auth.uid())
);

drop policy if exists "collective_votes_member" on public.collective_fund_votes;
create policy "collective_votes_member" on public.collective_fund_votes for all using (auth.uid() = voter_id);

drop policy if exists "guarantors_tontine_read" on public.tontine_guarantors;
create policy "guarantors_tontine_read" on public.tontine_guarantors for select using (
  public.is_tontine_member(tontine_id) or public.is_tontine_admin(tontine_id)
);

drop policy if exists "guarantors_member_insert" on public.tontine_guarantors;
create policy "guarantors_member_insert" on public.tontine_guarantors for insert with check (
  auth.uid() = member_id and public.is_tontine_member(tontine_id)
);

drop policy if exists "guarantors_admin_update" on public.tontine_guarantors;
create policy "guarantors_admin_update" on public.tontine_guarantors for update using (
  public.is_tontine_admin(tontine_id)
);
