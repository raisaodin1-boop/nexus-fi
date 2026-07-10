-- Stable per-profile identity certificates + real holder name on public verify

-- 1) Backfill profile name/email from auth
update public.profiles p
set
  full_name = coalesce(
    nullif(trim(p.full_name), ''),
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    initcap(replace(split_part(coalesce(u.email, ''), '@', 1), '.', ' '))
  ),
  email = coalesce(nullif(trim(p.email), ''), lower(trim(u.email)))
from auth.users u
where u.id = p.id
  and (
    p.full_name is null or trim(p.full_name) = ''
    or p.email is null or trim(p.email) = ''
  );

-- 2) Public verify RPC — resolve real profile name (never generic if known)
create or replace function public.verify_certificate(p_hash text)
returns json
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_row public.identity_certificates%rowtype;
  v_name text;
  v_country text;
  v_city text;
  v_kyc text;
  v_member_since timestamptz;
  v_trust numeric;
begin
  if coalesce(trim(p_hash), '') = '' then
    return json_build_object('valid', false);
  end if;

  select * into v_row
  from public.identity_certificates
  where lower(content_hash) = lower(trim(p_hash))
  limit 1;

  if not found then
    return json_build_object('valid', false);
  end if;

  select
    coalesce(
      nullif(trim(p.full_name), ''),
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      initcap(replace(split_part(coalesce(u.email, p.email, ''), '@', 1), '.', ' ')),
      'Membre HODIX'
    ),
    p.country,
    p.city,
    coalesce(p.kyc_status, 'not_submitted'),
    coalesce(p.created_at, u.created_at),
    p.trust_score
  into v_name, v_country, v_city, v_kyc, v_member_since, v_trust
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_row.user_id;

  return json_build_object(
    'valid', true,
    'content_hash', v_row.content_hash,
    'doc_type', v_row.doc_type,
    'doc_id', v_row.doc_id,
    'holder_name', coalesce(v_name, 'Membre HODIX'),
    'issued_at', v_row.created_at,
    'chain_ref', v_row.chain_ref,
    'verify_url', v_row.verify_url,
    'country', v_country,
    'city', v_city,
    'kyc_status', v_kyc,
    'member_since', v_member_since,
    'trust_score', v_trust,
    'profile_bound', true
  );
end;
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated, service_role;

-- Refresh stale verify URLs to query form (same hash, stable profile link)
update public.identity_certificates
set verify_url = 'https://www.hodix.app/verify?h=' || content_hash
where verify_url not like '%?h=%';

notify pgrst, 'reload schema';
