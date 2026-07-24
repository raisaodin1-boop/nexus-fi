-- Server-side OTP storage for transaction 2FA.
-- Applied to project hodixemergent (lrbhojxlofweotajnrhh) on 2026-06-10.
-- Codes are generated and verified ONLY by the send-otp edge function
-- (service role). Clients can never read or write this table.
create table if not exists public.otp_codes (
  user_id      uuid primary key references auth.users,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     int not null default 0,
  last_sent_at timestamptz not null default now()
);
alter table public.otp_codes enable row level security;
-- no policies: deny-all for anon/authenticated; service role bypasses RLS.
