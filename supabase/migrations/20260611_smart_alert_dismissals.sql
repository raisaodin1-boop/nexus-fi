-- Persist smart alert dismissals per user (7-day snooze by default)

create table if not exists public.smart_alert_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_id text not null,
  dismissed_until timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, alert_id)
);

alter table public.smart_alert_dismissals enable row level security;

drop policy if exists "smart_alert_dismissals_own" on public.smart_alert_dismissals;
create policy "smart_alert_dismissals_own" on public.smart_alert_dismissals
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists smart_alert_dismissals_until_idx
  on public.smart_alert_dismissals (user_id, dismissed_until);
