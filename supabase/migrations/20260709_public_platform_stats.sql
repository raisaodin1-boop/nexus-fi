-- Public aggregate stats for landing / investor narrative (no PII)

create or replace function public.public_platform_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_users bigint;
  v_groups bigint;
  v_savings numeric;
  v_contributors_90d bigint;
  v_members bigint;
  v_payments_ok bigint;
  v_payments_done bigint;
begin
  select count(*) into v_users from public.profiles;
  select count(*) into v_groups from public.tontines;
  v_groups := v_groups
    + (select count(*) from public.associations)
    + (select count(*) from public.cooperatives);

  select coalesce(sum(current_amount), 0) into v_savings from public.savings_goals;

  select count(distinct user_id) into v_contributors_90d
    from public.tontine_contributions
    where created_at > now() - interval '90 days';

  select count(distinct user_id) into v_members from public.tontine_members;

  select count(*) into v_payments_ok from public.payments where status = 'succeeded';
  select count(*) into v_payments_done
    from public.payments
    where status in ('succeeded', 'failed', 'cancelled');

  return jsonb_build_object(
    'users_count', v_users,
    'groups_count', v_groups,
    'savings_volume_xaf', v_savings,
    'participation_rate_pct',
      case when v_members > 0
        then least(100, round((v_contributors_90d::numeric / v_members) * 100))
        else null end,
    'repayment_rate_pct',
      case when v_payments_done > 0
        then round((v_payments_ok::numeric / v_payments_done) * 100)
        else null end
  );
end;
$$;

revoke all on function public.public_platform_stats() from public;
grant execute on function public.public_platform_stats() to anon, authenticated;
