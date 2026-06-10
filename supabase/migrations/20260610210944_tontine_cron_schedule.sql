-- Schedule tontine-cron Edge Function (hourly reminders, auto-advance, escrow release).
-- Requires vault secrets: project_url, tontine_cron_secret (see .env.example).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'hodix-tontine-cron') then
    perform cron.unschedule('hodix-tontine-cron');
  end if;
end $do$;

select cron.schedule(
  'hodix-tontine-cron',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
      || '/functions/v1/tontine-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tontine_cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
