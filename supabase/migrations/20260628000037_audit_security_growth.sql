-- Audit P1/P3: savings race condition, escrow idempotence, manager overview RPC

-- ── 1. Savings withdraw: row lock prevents double-spend ───────────
create or replace function public.savings_withdraw_goal(
  p_goal_id uuid,
  p_amount numeric,
  p_early boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_goal public.savings_goals%rowtype;
  v_total numeric;
  v_penalty numeric := 0;
  v_net numeric;
  v_today date := current_date;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;

  select * into v_goal
    from public.savings_goals
    where id = p_goal_id and user_id = v_user and is_active = true
    for update;
  if not found then raise exception 'Objectif introuvable.'; end if;
  if v_goal.current_amount < p_amount then raise exception 'Solde insuffisant sur cet objectif.'; end if;

  if v_goal.savings_type = 'locked' and v_goal.deadline is not null and v_today < v_goal.deadline then
    if v_goal.early_unlock_until is not null and v_goal.early_unlock_until > now() then
      null;
    elsif v_goal.lock_guardian_id is not null and not p_early then
      raise exception 'Retrait bloqué jusqu''à la date cible. Demandez l''approbation de votre tuteur d''épargne ou un retrait anticipé avec pénalité.';
    elsif not p_early then
      raise exception 'Compte verrouillé jusqu''au %. Retrait anticipé possible avec pénalité de % %%.', v_goal.deadline, v_goal.early_withdraw_penalty_pct;
    else
      v_penalty := greatest(
        round(p_amount * coalesce(v_goal.early_withdraw_penalty_pct, 5) / 100),
        500
      );
      if v_goal.lock_guardian_id is not null then
        raise exception 'Tuteur requis : votre tuteur d''épargne doit approuver le déblocage anticipé.';
      end if;
    end if;
  end if;

  v_net := p_amount - v_penalty;

  insert into public.savings_transactions (goal_id, user_id, amount, note)
  values (
    p_goal_id,
    v_user,
    -p_amount,
    case when v_penalty > 0 then format('Retrait anticipé (pénalité %s XAF)', v_penalty) else 'Retrait' end
  );

  if v_penalty > 0 then
    insert into public.savings_transactions (goal_id, user_id, amount, note)
    values (p_goal_id, v_user, 0, format('Pénalité discipline épargne : %s XAF retenus', v_penalty));
  end if;

  select coalesce(sum(amount), 0) into v_total
    from public.savings_transactions where goal_id = p_goal_id;
  update public.savings_goals set current_amount = greatest(0, v_total) where id = p_goal_id;

  return jsonb_build_object(
    'detail', 'Retrait enregistré',
    'amount_withdrawn', p_amount,
    'penalty_xaf', v_penalty,
    'net_xaf', v_net
  );
end;
$$;

-- ── 2. Escrow release idempotence ─────────────────────────────────
alter table public.tontine_escrow
  add column if not exists release_notified boolean not null default false;

-- ── 3. Manager overview — single RPC instead of N+1 queries ─────
create or replace function public.get_manager_overview(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_tontines jsonb;
  v_total_members int := 0;
  v_total_collected numeric := 0;
  v_new_members_30d int := 0;
  v_compliance_sum numeric := 0;
  v_compliance_count int := 0;
  v_tontine_count int := 0;
  v_assoc_count int := 0;
  v_coop_count int := 0;
  v_fund_count int := 0;
  v_row record;
begin
  if p_user_id is null then raise exception 'Non authentifié.'; end if;
  if auth.uid() is not null and auth.uid() <> p_user_id and not public.is_admin() then
    raise exception 'Non autorisé.';
  end if;

  select role into v_role from public.profiles where id = p_user_id;
  if v_role not in ('tontine_manager', 'super_admin', 'admin') then
    return jsonb_build_object(
      'groups', jsonb_build_object('tontines', 0, 'associations', 0, 'cooperatives', 0, 'funds', 0),
      'total_members', 0, 'total_collected', 0, 'avg_compliance', 0,
      'health_score', 0, 'new_members_30d', 0, 'tontines', '[]'::jsonb, 'currency', 'XAF'
    );
  end if;

  select count(*) into v_assoc_count from public.associations where owner_id = p_user_id;
  select count(*) into v_coop_count from public.cooperatives where owner_id = p_user_id;
  select count(*) into v_fund_count from public.community_funds where owner_id = p_user_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id, 'name', t.name, 'current_cycle', t.current_cycle,
      'max_members', t.max_members, 'amount_per_cycle', coalesce(t.amount_per_cycle, t.contribution_amount, 0),
      'members_count', coalesce(m.cnt, 0),
      'total_collected', coalesce(c.total, 0),
      'currency', coalesce(t.currency, 'XAF')
    ) order by t.created_at desc
  ), '[]'::jsonb)
  into v_tontines
  from public.tontines t
  left join lateral (
    select count(*)::int as cnt from public.tontine_members tm
    where tm.tontine_id = t.id and coalesce(tm.status, 'a_jour') <> 'exclu'
  ) m on true
  left join lateral (
    select coalesce(sum(amount), 0) as total from public.tontine_contributions tc where tc.tontine_id = t.id
  ) c on true
  where t.owner_id = p_user_id;

  for v_row in
    select t.id, coalesce(t.amount_per_cycle, t.contribution_amount, 0) as per_cycle,
           coalesce(m.cnt, 0) as members,
           coalesce(c.total, 0) as collected
    from public.tontines t
    left join lateral (
      select count(*)::int as cnt from public.tontine_members tm where tm.tontine_id = t.id
    ) m on true
    left join lateral (
      select coalesce(sum(amount), 0) as total from public.tontine_contributions tc where tc.tontine_id = t.id
    ) c on true
    where t.owner_id = p_user_id
  loop
    v_tontine_count := v_tontine_count + 1;
    v_total_members := v_total_members + v_row.members;
    v_total_collected := v_total_collected + v_row.collected;
    if v_row.per_cycle > 0 and v_row.members > 0 then
      v_compliance_sum := v_compliance_sum + least(100, (v_row.collected / (v_row.per_cycle * v_row.members)) * 100);
      v_compliance_count := v_compliance_count + 1;
    end if;
  end loop;

  select count(*) into v_new_members_30d
  from public.tontine_members tm
  join public.tontines t on t.id = tm.tontine_id
  where t.owner_id = p_user_id and tm.joined_at >= now() - interval '30 days';

  v_total_members := v_total_members
    + (select count(*) from public.association_members am join public.associations a on a.id = am.association_id where a.owner_id = p_user_id)
    + (select count(*) from public.cooperative_members cm join public.cooperatives c on c.id = cm.cooperative_id where c.owner_id = p_user_id);

  return jsonb_build_object(
    'groups', jsonb_build_object(
      'tontines', v_tontine_count,
      'associations', v_assoc_count,
      'cooperatives', v_coop_count,
      'funds', v_fund_count
    ),
    'total_members', v_total_members,
    'total_collected', v_total_collected,
    'avg_compliance', case when v_compliance_count > 0 then round(v_compliance_sum / v_compliance_count) else 0 end,
    'health_score', least(100, greatest(0,
      round((case when v_compliance_count > 0 then v_compliance_sum / v_compliance_count else 50 end) * 0.6
        + least(100, v_total_members * 2) * 0.4)
    )),
    'new_members_30d', v_new_members_30d,
    'tontines', v_tontines,
    'currency', 'XAF'
  );
end;
$$;

revoke all on function public.get_manager_overview(uuid) from public;
grant execute on function public.get_manager_overview(uuid) to authenticated, service_role;
