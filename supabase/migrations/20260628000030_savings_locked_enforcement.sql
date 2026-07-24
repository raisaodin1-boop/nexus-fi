-- Locked savings: guardian, early unlock window, penalty, secure withdraw RPC

alter table public.savings_goals
  add column if not exists lock_guardian_id uuid references auth.users on delete set null,
  add column if not exists early_unlock_until timestamptz,
  add column if not exists early_withdraw_penalty_pct numeric not null default 5;

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
    where id = p_goal_id and user_id = v_user and is_active = true;
  if not found then raise exception 'Objectif introuvable.'; end if;
  if v_goal.current_amount < p_amount then raise exception 'Solde insuffisant sur cet objectif.'; end if;

  if v_goal.savings_type = 'locked' and v_goal.deadline is not null and v_today < v_goal.deadline then
    if v_goal.early_unlock_until is not null and v_goal.early_unlock_until > now() then
      null; -- guardian approved window
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

create or replace function public.savings_grant_early_unlock(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_goal public.savings_goals%rowtype;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;

  select * into v_goal from public.savings_goals where id = p_goal_id and is_active = true;
  if not found then raise exception 'Objectif introuvable.'; end if;
  if v_goal.lock_guardian_id is distinct from v_user then
    raise exception 'Seul le tuteur d''épargne peut approuver un déblocage anticipé.';
  end if;

  update public.savings_goals
    set early_unlock_until = now() + interval '48 hours'
    where id = p_goal_id;
end;
$$;

revoke all on function public.savings_withdraw_goal(uuid, numeric, boolean) from public;
grant execute on function public.savings_withdraw_goal(uuid, numeric, boolean) to authenticated;
revoke all on function public.savings_grant_early_unlock(uuid) from public;
grant execute on function public.savings_grant_early_unlock(uuid) to authenticated;
