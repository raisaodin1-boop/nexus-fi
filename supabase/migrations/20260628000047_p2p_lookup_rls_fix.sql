-- Harden P2P member lookup: email/phone must work even when profiles RLS
-- hides other members, and when profiles.email is out of sync with auth.users.

update public.profiles p
set email = lower(trim(u.email))
from auth.users u
where u.id = p.id
  and u.email is not null
  and (p.email is null or lower(trim(p.email)) <> lower(trim(u.email)));

create or replace function public.lookup_profile_by_email(p_email text)
returns table(id uuid, full_name text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email = '' then
    return;
  end if;

  return query
  select p.id, coalesce(nullif(trim(p.full_name), ''), 'Membre HODIX')
  from public.profiles p
  where p.email is not null
    and lower(trim(p.email)) = v_email
  limit 1;

  if found then
    return;
  end if;

  -- Fallback: auth.users (covers profiles with missing/stale email)
  return query
  select u.id, coalesce(nullif(trim(p.full_name), ''), 'Membre HODIX')
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.email is not null
    and lower(trim(u.email)) = v_email
  limit 1;
end;
$$;

revoke all on function public.lookup_profile_by_email(text) from public;
grant execute on function public.lookup_profile_by_email(text) to authenticated, service_role;

create or replace function public.lookup_profile_by_phone(p_phone text)
returns table(id uuid, full_name text)
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  with needle as (
    select regexp_replace(trim(p_phone), '[^0-9+]', '', 'g') as phone
  )
  select p.id, coalesce(nullif(trim(p.full_name), ''), 'Membre HODIX')
  from public.profiles p
  cross join needle n
  where p.phone is not null
    and n.phone <> ''
    and (
      regexp_replace(trim(p.phone), '[^0-9+]', '', 'g') = n.phone
      or right(regexp_replace(trim(p.phone), '[^0-9]', '', 'g'), 9)
         = right(regexp_replace(n.phone, '[^0-9]', '', 'g'), 9)
    )
  limit 1;
$$;

revoke all on function public.lookup_profile_by_phone(text) from public;
grant execute on function public.lookup_profile_by_phone(text) to authenticated, service_role;
