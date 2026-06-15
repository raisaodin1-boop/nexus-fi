-- Email de bienvenue à l'inscription
alter table public.profiles add column if not exists welcome_email_sent_at timestamptz;
