-- Public certificate verification RPC (was defined in 20260701 but missing in prod)

create or replace function public.verify_certificate(p_hash text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.identity_certificates%rowtype;
  v_name text;
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

  select coalesce(full_name, 'Titulaire HODIX') into v_name
  from public.profiles where id = v_row.user_id;

  return json_build_object(
    'valid', true,
    'content_hash', v_row.content_hash,
    'doc_type', v_row.doc_type,
    'doc_id', v_row.doc_id,
    'holder_name', coalesce(v_name, 'Titulaire HODIX'),
    'issued_at', v_row.created_at,
    'chain_ref', v_row.chain_ref,
    'verify_url', v_row.verify_url
  );
end;
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
