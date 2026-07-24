-- Paynote: reliable refs + instant credit path
alter table public.payments
  add column if not exists provider_ref text;

create index if not exists payments_provider_ref_idx
  on public.payments (provider_ref)
  where provider_ref is not null;

create index if not exists payments_pending_paynote_idx
  on public.payments (created_at desc)
  where status = 'pending_paynote';

comment on column public.payments.provider_ref is
  'Paynote MessageId / paymentRef for status polling and webhook matching';
