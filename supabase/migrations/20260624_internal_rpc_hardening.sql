-- HODIX — Revoke public execute on internal SECURITY DEFINER helpers (Supabase advisor)

revoke all on function public._check_emoney_limits(uuid, numeric) from public, anon, authenticated;
revoke all on function public._enforce_wallet_outbound(uuid, numeric, boolean) from public, anon, authenticated;
revoke all on function public.audit_kyc_status_change() from public, anon;

create or replace function public.prevent_compliance_audit_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'compliance_audit_log is append-only (COBAC/CEMAC retention).';
end;
$$;
