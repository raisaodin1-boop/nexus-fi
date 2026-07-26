-- Diaspora contributions: store expected amount in member local currency (+ keep XAF ledger).
alter table public.diaspora_contribution_requests
  add column if not exists amount_local numeric,
  add column if not exists local_currency text;

comment on column public.diaspora_contribution_requests.amount_expected is
  'Canonical amount in XAF (tontine ledger).';
comment on column public.diaspora_contribution_requests.amount_local is
  'Indicative amount in member local currency at request creation.';
comment on column public.diaspora_contribution_requests.local_currency is
  'ISO currency code for amount_local (EUR, USD, GBP, …).';
