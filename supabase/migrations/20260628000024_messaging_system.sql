-- HODIX — Système de messagerie complet (direct, tontine, broadcast publicitaire)

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid references auth.users on delete cascade not null,
  recipient_id  uuid references auth.users on delete set null,
  tontine_id    uuid references public.tontines on delete cascade,
  message_type  text not null default 'direct'
    check (message_type in ('direct', 'tontine', 'broadcast')),
  title         text,
  content       text not null check (char_length(content) between 1 and 2000),
  is_read       boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint messages_context_check check (
    (message_type = 'broadcast')
    or (message_type = 'tontine' and tontine_id is not null)
    or (message_type = 'direct')
  )
);

alter table public.messages add column if not exists message_type text not null default 'direct';
alter table public.messages add column if not exists title text;

create table if not exists public.message_reads (
  message_id uuid references public.messages on delete cascade not null,
  user_id    uuid references auth.users on delete cascade not null,
  read_at    timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);
create index if not exists messages_recipient_created_idx on public.messages (recipient_id, created_at desc)
  where recipient_id is not null;
create index if not exists messages_tontine_created_idx on public.messages (tontine_id, created_at desc)
  where tontine_id is not null;
create index if not exists messages_broadcast_created_idx on public.messages (created_at desc)
  where message_type = 'broadcast';

alter table public.messages enable row level security;
alter table public.message_reads enable row level security;

-- ── messages SELECT ─────────────────────────────────────────────
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select to authenticated using (
  message_type = 'broadcast'
  or (message_type = 'tontine' and public.is_tontine_member(tontine_id))
  or (message_type = 'direct' and (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or (recipient_id is null and sender_id = auth.uid())
    or public.is_admin()
  ))
);

-- ── messages INSERT ─────────────────────────────────────────────
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated with check (
  sender_id = auth.uid()
  and (
    (message_type = 'broadcast' and public.is_admin())
    or (message_type = 'tontine' and public.is_tontine_member(tontine_id))
    or (message_type = 'direct' and (recipient_id is null or recipient_id <> auth.uid()))
  )
);

-- ── messages UPDATE (mark read on direct) ───────────────────────
drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages for update to authenticated
  using (
    recipient_id = auth.uid()
    or public.is_admin()
  )
  with check (
    recipient_id = auth.uid()
    or public.is_admin()
  );

-- ── message_reads ───────────────────────────────────────────────
drop policy if exists "message_reads_select" on public.message_reads;
create policy "message_reads_select" on public.message_reads for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "message_reads_insert" on public.message_reads;
create policy "message_reads_insert" on public.message_reads for insert to authenticated
  with check (user_id = auth.uid());

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
