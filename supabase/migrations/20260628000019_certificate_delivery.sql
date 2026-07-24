-- Certificate delivery email tracking
alter table public.certificate_purchases
  add column if not exists delivery_email text;

alter table public.identity_events
  add column if not exists metadata jsonb;
