-- HODIX — Audit RLS hardening: paid-only contributions/deposits, revoke dangerous grants

-- ── 1. Fix _payment_meta search_path ────────────────────────────
create or replace function public._payment_meta(p_description text) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select coalesce((split_part(coalesce(p_description, ''), ' · ref:', 1))::jsonb, '{}'::jsonb);
$$;

-- ── 2. Revoke anon execute on sensitive SECURITY DEFINER functions ─
revoke all on function public.admin_delete_user(uuid) from anon;
revoke all on function public.dispatch_notification_push() from anon;

-- ── 3. Tontine contributions: paid RPC only ─────────────────────
drop policy if exists "tontine_contributions_insert" on public.tontine_contributions;

create or replace function public.contribute_tontine_paid(
  p_tontine_id uuid, p_amount numeric, p_payment_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_pay public.payments;
  v_meta jsonb;
  v_tontine public.tontines;
  v_cycle int;
  v_reserve numeric;
  v_net numeric;
  v_paid_count int;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;
  if p_payment_id is null then raise exception 'Paiement requis.'; end if;

  select * into v_pay from public.payments
    where id = p_payment_id and user_id = v_user and status = 'succeeded';
  if not found then raise exception 'Paiement non validé.'; end if;

  v_meta := public._payment_meta(v_pay.description);
  if v_meta->>'kind' <> 'tontine_contribution' then raise exception 'Type de paiement invalide.'; end if;
  if (v_meta->>'tontine_id')::uuid is distinct from p_tontine_id then
    raise exception 'Tontine non correspondante.';
  end if;
  if v_pay.amount < p_amount then raise exception 'Montant incompatible.'; end if;

  if not exists (
    select 1 from public.tontine_members
    where tontine_id = p_tontine_id and user_id = v_user
  ) then raise exception 'Non membre de cette tontine.'; end if;

  if exists (
    select 1 from public.tontine_contributions tc
    where tc.tontine_id = p_tontine_id and tc.user_id = v_user
      and tc.cycle = (select current_cycle from public.tontines where id = p_tontine_id)
  ) then raise exception 'Cotisation déjà payée pour ce cycle.'; end if;

  select * into v_tontine from public.tontines where id = p_tontine_id;
  if not found then raise exception 'Tontine introuvable.'; end if;

  v_cycle := coalesce(v_tontine.current_cycle, 1);
  v_reserve := round(p_amount * 0.02);
  v_net := p_amount - v_reserve;

  insert into public.tontine_contributions (tontine_id, user_id, amount, cycle)
  values (p_tontine_id, v_user, v_net, v_cycle);

  update public.tontines
    set reserve_fund = coalesce(reserve_fund, 0) + v_reserve
    where id = p_tontine_id;

  update public.tontine_members
    set status = 'a_jour', last_paid_cycle = v_cycle
    where tontine_id = p_tontine_id and user_id = v_user;

  if v_cycle = 1 then
    select count(*)::int into v_paid_count
      from public.tontine_contributions
      where tontine_id = p_tontine_id and cycle = 1;
    if v_paid_count >= coalesce(v_tontine.max_members, 12) - 1 then
      insert into public.tontine_escrow (tontine_id, cycle, amount, release_at, status, dispute_count)
      values (
        p_tontine_id, 1, v_net * coalesce(v_tontine.max_members, 12),
        now() + interval '72 hours', 'held', 0
      )
      on conflict (tontine_id, cycle) do nothing;
    end if;
  end if;

  return jsonb_build_object('detail', 'Contribution enregistrée', 'net_amount', v_net, 'reserve_deducted', v_reserve);
end $$;

revoke all on function public.contribute_tontine_paid(uuid, numeric, uuid) from public, anon;
grant execute on function public.contribute_tontine_paid(uuid, numeric, uuid) to authenticated;

-- ── 4. Savings deposits: paid RPC + wallet auto-savings RPC ─────
drop policy if exists "savings_tx_own" on public.savings_transactions;

create policy "savings_tx_select" on public.savings_transactions
  for select to authenticated using (auth.uid() = user_id);

create policy "savings_tx_withdraw_insert" on public.savings_transactions
  for insert to authenticated with check (auth.uid() = user_id and amount < 0);

create or replace function public.savings_deposit_paid(
  p_goal_id uuid, p_amount numeric, p_payment_id uuid, p_note text default 'Dépôt CinetPay'
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_pay public.payments;
  v_meta jsonb;
  v_total numeric;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;
  if p_payment_id is null then raise exception 'Paiement requis.'; end if;

  if not exists (
    select 1 from public.savings_goals where id = p_goal_id and user_id = v_user
  ) then raise exception 'Objectif introuvable.'; end if;

  select * into v_pay from public.payments
    where id = p_payment_id and user_id = v_user and status = 'succeeded';
  if not found then raise exception 'Paiement non validé.'; end if;

  v_meta := public._payment_meta(v_pay.description);
  if v_meta->>'kind' <> 'savings_deposit' then raise exception 'Type de paiement invalide.'; end if;
  if (v_meta->>'goal_id')::uuid is distinct from p_goal_id then
    raise exception 'Objectif non correspondant.';
  end if;
  if v_pay.amount < p_amount then raise exception 'Montant incompatible.'; end if;

  insert into public.savings_transactions (goal_id, user_id, amount, note)
  values (p_goal_id, v_user, p_amount, coalesce(p_note, 'Dépôt CinetPay'));

  select coalesce(sum(amount), 0) into v_total
    from public.savings_transactions where goal_id = p_goal_id;
  update public.savings_goals set current_amount = greatest(0, v_total) where id = p_goal_id;
end $$;

create or replace function public.auto_savings_execute(
  p_goal_id uuid, p_amount numeric, p_note text default 'Auto-épargne'
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_total numeric;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;

  if not exists (
    select 1 from public.savings_goals where id = p_goal_id and user_id = v_user
  ) then raise exception 'Objectif introuvable.'; end if;

  update public.wallets set balance_xaf = balance_xaf - p_amount, updated_at = now()
    where user_id = v_user and balance_xaf >= p_amount;
  if not found then raise exception 'Solde insuffisant pour l''auto-épargne.'; end if;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, amount_xaf, reference, note, status)
  values
    (v_user, 'withdraw', p_amount, 'XAF', p_amount,
     'ASV-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     coalesce(p_note, 'Auto-épargne'), 'completed');

  insert into public.savings_transactions (goal_id, user_id, amount, note)
  values (p_goal_id, v_user, p_amount, coalesce(p_note, 'Auto-épargne'));

  select coalesce(sum(amount), 0) into v_total
    from public.savings_transactions where goal_id = p_goal_id;
  update public.savings_goals set current_amount = greatest(0, v_total) where id = p_goal_id;
end $$;

revoke all on function public.savings_deposit_paid(uuid, numeric, uuid, text) from public, anon;
revoke all on function public.auto_savings_execute(uuid, numeric, text) from public, anon;
grant execute on function public.savings_deposit_paid(uuid, numeric, uuid, text) to authenticated;
grant execute on function public.auto_savings_execute(uuid, numeric, text) to authenticated;

-- ── 5. Tighten group creation policies ──────────────────────────
drop policy if exists "associations_insert" on public.associations;
create policy "associations_insert" on public.associations
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "coops_insert" on public.cooperatives;
create policy "coops_insert" on public.cooperatives
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "funds_insert" on public.community_funds;
create policy "funds_insert" on public.community_funds
  for insert to authenticated with check (owner_id = auth.uid());

-- Block direct contribution inserts (paid RPCs only)
drop policy if exists "assoc_contribs_insert" on public.association_contributions;
drop policy if exists "coop_contribs_insert" on public.cooperative_contributions;
drop policy if exists "fund_contribs_insert" on public.fund_contributions;
