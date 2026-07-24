-- Allow server-side wallet freeze/unfreeze without client UPDATE on protected columns.
-- protect_profile_columns blocks wallet_frozen unless is_admin(); anomaly detection
-- needs a SECURITY DEFINER path gated by a session flag.

create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.role is distinct from old.role
      or new.is_blacklisted is distinct from old.is_blacklisted
      or new.kyc_status is distinct from old.kyc_status
      or coalesce(new.wallet_frozen, false) is distinct from coalesce(old.wallet_frozen, false))
     and not public.is_admin()
     and coalesce(current_setting('app.allow_wallet_freeze', true), '') <> '1' then
    -- Allow member → tontine_manager only within 15 min of profile creation (signup)
    if new.role is distinct from old.role
       and old.role = 'member'
       and new.role = 'tontine_manager'
       and old.created_at > now() - interval '15 minutes'
       and new.is_blacklisted is not distinct from old.is_blacklisted
       and new.kyc_status is not distinct from old.kyc_status
       and coalesce(new.wallet_frozen, false) is not distinct from coalesce(old.wallet_frozen, false) then
      return new;
    end if;
    raise exception 'Modification non autorisée (champ protégé).';
  end if;
  return new;
end $$;

create or replace function public.set_wallet_frozen(
  p_user_id uuid,
  p_frozen boolean,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  -- Self: can only freeze (anomaly path). Admins: freeze or unfreeze anyone.
  if p_user_id is distinct from v_uid then
    if not public.is_admin() then raise exception 'Non autorisé'; end if;
  elsif p_frozen is false and not public.is_admin() then
    raise exception 'Seul un administrateur peut dégeler le wallet';
  end if;

  perform set_config('app.allow_wallet_freeze', '1', true);
  update public.profiles
  set wallet_frozen = p_frozen
  where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'wallet_frozen', p_frozen,
    'reason', nullif(trim(coalesce(p_reason, '')), '')
  );
end;
$$;

revoke all on function public.set_wallet_frozen(uuid, boolean, text) from public;
grant execute on function public.set_wallet_frozen(uuid, boolean, text) to authenticated, service_role;
