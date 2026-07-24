-- HODIX — Push notifications fiables (app fermée) via trigger + pg_net

create extension if not exists pg_net with schema extensions;

-- Multi-appareils : un token par couple user + appareil
alter table public.push_tokens add column if not exists platform text;
alter table public.push_tokens drop constraint if exists push_tokens_user_id_key;
drop index if exists public.push_tokens_user_id_key;
create unique index if not exists push_tokens_user_token_uidx
  on public.push_tokens (user_id, token);

-- Dispatch automatique vers send-push à chaque notification in-app
create or replace function public.dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into service_key
  from vault.decrypted_secrets where name = 'service_role_key' limit 1;

  if project_url is null or service_key is null then
    return NEW;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'type', coalesce(NEW.type, 'info'),
      'notification_id', NEW.id,
      'action_url', NEW.metadata->>'action_url'
    )
  );
  return NEW;
exception when others then
  return NEW;
end;
$$;

drop trigger if exists notifications_push_after_insert on public.notifications;
create trigger notifications_push_after_insert
  after insert on public.notifications
  for each row
  execute function public.dispatch_notification_push();
