-- Sprint 1: validate tontine cycle + membership in wallet_pay_contribution

create or replace function public.wallet_pay_contribution(
  p_tontine uuid, p_amount numeric, p_cycle int
) returns public.wallet_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_tx public.wallet_transactions;
  v_name text;
  v_current_cycle int;
  v_last_paid int;
begin
  if v_user is null then raise exception 'Non authentifié.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide.'; end if;
  if p_cycle is null or p_cycle < 1 then raise exception 'Cycle invalide.'; end if;

  select name, coalesce(current_cycle, 1)
    into v_name, v_current_cycle
    from public.tontines
   where id = p_tontine;
  if not found then raise exception 'Tontine introuvable.'; end if;

  if p_cycle is distinct from v_current_cycle then
    raise exception 'Cycle invalide : cotisation attendue pour le cycle %.', v_current_cycle;
  end if;

  select coalesce(last_paid_cycle, 0)
    into v_last_paid
    from public.tontine_members
   where tontine_id = p_tontine and user_id = v_user;
  if not found then raise exception 'Vous n''êtes pas membre de cette tontine.'; end if;

  if v_last_paid >= v_current_cycle then
    raise exception 'Cotisation déjà payée pour ce cycle.';
  end if;

  if exists (
    select 1 from public.tontine_contributions
     where tontine_id = p_tontine and user_id = v_user and cycle = p_cycle
  ) then
    raise exception 'Cotisation déjà enregistrée pour ce cycle.';
  end if;

  update public.wallets set balance_xaf = balance_xaf - p_amount, updated_at = now()
    where user_id = v_user and balance_xaf >= p_amount;
  if not found then raise exception 'Solde XAF insuffisant.'; end if;

  insert into public.tontine_contributions (tontine_id, user_id, amount, cycle, paid_at, payment_method)
  values (p_tontine, v_user, p_amount, p_cycle, now(), 'wallet');

  update public.tontine_members
     set status = 'a_jour', last_paid_cycle = p_cycle
   where tontine_id = p_tontine and user_id = v_user;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, amount_xaf, reference, tontine_id, note, status)
  values
    (v_user, 'contribution', p_amount, 'XAF', p_amount,
     'CTB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
     p_tontine, 'Cotisation tontine' || coalesce(' — ' || v_name, '') || ' (cycle ' || p_cycle || ')', 'completed')
  returning * into v_tx;
  return v_tx;
end $$;
