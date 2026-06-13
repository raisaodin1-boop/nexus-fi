-- Track when a payment receipt email was sent (avoid duplicates).
alter table public.payments add column if not exists receipt_email_sent_at timestamptz;
