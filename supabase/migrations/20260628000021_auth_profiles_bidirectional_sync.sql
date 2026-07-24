-- Sync bidirectionnel entre auth.users et public.profiles
-- 1) Backfill des profils manquants depuis auth.users
-- 2) Trigger auth -> profiles (insert/update)
-- 3) Trigger profiles -> auth (delete)

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Helper: upsert profile from auth.users row
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_full_name text;
  v_role text;
begin
  v_full_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, ''), '@', 1),
    'Utilisateur'
  );

  v_role := coalesce(new.raw_app_meta_data ->> 'role', 'member');

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    kyc_status
  )
  values (
    new.id,
    new.email,
    v_full_name,
    v_role,
    'not_submitted'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = coalesce(public.profiles.role, excluded.role);

  return new;
end;
$$;

revoke all on function public.sync_profile_from_auth_user() from public;
grant execute on function public.sync_profile_from_auth_user() to service_role;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
after insert or update of email, raw_user_meta_data, raw_app_meta_data
on auth.users
for each row
execute function public.sync_profile_from_auth_user();

-- Backfill: tous les users Auth doivent exister dans profiles
insert into public.profiles (id, email, full_name, role, kyc_status)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(coalesce(u.email, ''), '@', 1),
    'Utilisateur'
  ) as full_name,
  coalesce(u.raw_app_meta_data ->> 'role', 'member') as role,
  'not_submitted'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is distinct from u.email;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. profiles -> auth.users delete sync
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_auth_user_from_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  -- Si le compte auth existe encore, on le supprime aussi.
  delete from auth.users where id = old.id;
  return old;
end;
$$;

revoke all on function public.delete_auth_user_from_profile_delete() from public;
grant execute on function public.delete_auth_user_from_profile_delete() to service_role;

drop trigger if exists on_profile_delete_auth_sync on public.profiles;
create trigger on_profile_delete_auth_sync
after delete on public.profiles
for each row
execute function public.delete_auth_user_from_profile_delete();
