-- Demandes de promotion Tontine Manager (table dédiée + RLS admin)

create table if not exists public.promotion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promotion_requests_user_id_idx on public.promotion_requests (user_id);
create index if not exists promotion_requests_status_idx on public.promotion_requests (status);

create unique index if not exists promotion_requests_one_pending_per_user
  on public.promotion_requests (user_id)
  where status = 'pending';

-- Backfill depuis les anciennes notifications (membres encore "member" → pending)
insert into public.promotion_requests (user_id, reason, status, created_at)
select
  n.user_id,
  coalesce(nullif(trim(n.body), ''), 'Demande de promotion Manager'),
  case
    when p.role = 'tontine_manager' then 'approved'
    else 'pending'
  end,
  n.created_at
from public.notifications n
join public.profiles p on p.id = n.user_id
where n.type = 'promotion_request'
  and not exists (
    select 1 from public.promotion_requests pr
    where pr.user_id = n.user_id
      and pr.created_at = n.created_at
  );

-- Riane ESSofack (abms.roche@gmail.com) — demande toujours en attente
update public.promotion_requests pr
set status = 'pending', decided_by = null, decided_at = null, decision_note = null, updated_at = now()
from public.profiles p
where pr.user_id = p.id
  and lower(p.email) = 'abms.roche@gmail.com'
  and p.role = 'member';

alter table public.promotion_requests enable row level security;

drop policy if exists "promotion_requests_select_own" on public.promotion_requests;
create policy "promotion_requests_select_own" on public.promotion_requests
  for select using (auth.uid() = user_id);

drop policy if exists "promotion_requests_insert_own" on public.promotion_requests;
create policy "promotion_requests_insert_own" on public.promotion_requests
  for insert with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role <> 'member'
    )
  );

drop policy if exists "promotion_requests_admin_all" on public.promotion_requests;
create policy "promotion_requests_admin_all" on public.promotion_requests
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );
