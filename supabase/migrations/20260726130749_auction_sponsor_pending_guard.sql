-- Auction (tour anticipé), diaspora sponsor (payer pour un proche),
-- helpers for pending-payment UX (app-side guard; schema support).

-- ── Auction columns on tontines ─────────────────────────────
alter table public.tontines
  add column if not exists auction_ends_at timestamptz;

alter table public.tontines
  add column if not exists auction_closed boolean not null default true;

comment on column public.tontines.auction_ends_at is 'Fin de la fenêtre d''enchères du cycle courant';
comment on column public.tontines.auction_closed is 'true = pas d''enchère ouverte (défaut)';

-- ── Auction bids ────────────────────────────────────────────
create table if not exists public.tontine_auction_bids (
  id          uuid primary key default gen_random_uuid(),
  tontine_id  uuid not null references public.tontines(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  cycle       int not null default 1,
  bid_amount  numeric not null check (bid_amount > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tontine_id, user_id, cycle)
);

create index if not exists idx_auction_bids_tontine_cycle
  on public.tontine_auction_bids (tontine_id, cycle, bid_amount desc);

alter table public.tontine_auction_bids enable row level security;

drop policy if exists "auction_bids_select_member" on public.tontine_auction_bids;
create policy "auction_bids_select_member" on public.tontine_auction_bids
  for select to authenticated
  using (
    public.is_tontine_member(tontine_id)
    or public.is_admin()
  );

drop policy if exists "auction_bids_upsert_own" on public.tontine_auction_bids;
create policy "auction_bids_upsert_own" on public.tontine_auction_bids
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_tontine_member(tontine_id)
  );

drop policy if exists "auction_bids_update_own" on public.tontine_auction_bids;
create policy "auction_bids_update_own" on public.tontine_auction_bids
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── Auction results ─────────────────────────────────────────
create table if not exists public.tontine_auction_results (
  id                uuid primary key default gen_random_uuid(),
  tontine_id        uuid not null references public.tontines(id) on delete cascade,
  cycle             int not null,
  winner_id         uuid not null references auth.users(id),
  premium_paid      numeric not null default 0,
  share_per_member  numeric not null default 0,
  created_at        timestamptz not null default now(),
  unique (tontine_id, cycle)
);

alter table public.tontine_auction_results enable row level security;

drop policy if exists "auction_results_select_member" on public.tontine_auction_results;
create policy "auction_results_select_member" on public.tontine_auction_results
  for select to authenticated
  using (
    public.is_tontine_member(tontine_id)
    or public.is_admin()
  );

drop policy if exists "auction_results_insert_admin" on public.tontine_auction_results;
create policy "auction_results_insert_admin" on public.tontine_auction_results
  for insert to authenticated
  with check (
    public.is_tontine_admin(tontine_id)
    or public.is_admin()
  );

-- Advance winner to next receive slot (tour anticipé)
create or replace function public.close_tontine_auction(p_tontine_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cycle int;
  v_winner uuid;
  v_premium numeric;
  v_bid_count int;
  v_share numeric;
begin
  if v_uid is null then raise exception 'Non authentifié.'; end if;
  if not (public.is_tontine_admin(p_tontine_id) or public.is_admin()) then
    raise exception 'Seul l''admin de la tontine peut clôturer.';
  end if;

  select current_cycle into v_cycle from public.tontines where id = p_tontine_id;
  if v_cycle is null then raise exception 'Tontine introuvable.'; end if;

  select user_id, bid_amount into v_winner, v_premium
  from public.tontine_auction_bids
  where tontine_id = p_tontine_id and cycle = v_cycle
  order by bid_amount desc, created_at asc
  limit 1;

  if v_winner is null then raise exception 'Aucune enchère soumise.'; end if;

  select count(*)::int into v_bid_count
  from public.tontine_auction_bids
  where tontine_id = p_tontine_id and cycle = v_cycle;

  v_share := floor(v_premium / greatest(v_bid_count, 1));

  update public.tontines
  set auction_closed = true
  where id = p_tontine_id;

  insert into public.tontine_auction_results (
    tontine_id, cycle, winner_id, premium_paid, share_per_member
  ) values (p_tontine_id, v_cycle, v_winner, v_premium, v_share)
  on conflict (tontine_id, cycle) do update set
    winner_id = excluded.winner_id,
    premium_paid = excluded.premium_paid,
    share_per_member = excluded.share_per_member;

  -- Tour anticipé: gagnant en position 1, les autres décalés
  update public.tontine_members
  set rotation_position = coalesce(rotation_position, 99) + 1
  where tontine_id = p_tontine_id
    and coalesce(status, '') <> 'exclu'
    and user_id <> v_winner;

  update public.tontine_members
  set rotation_position = 1
  where tontine_id = p_tontine_id and user_id = v_winner;

  insert into public.notifications (user_id, title, body, type, is_read, metadata)
  values (
    v_winner,
    'Tour anticipé gagné',
    'Vous remportez les enchères — vous recevez la cagnotte en priorité (prime à régler).',
    'success',
    false,
    jsonb_build_object('action_url', '/tontines/' || p_tontine_id, 'premium', v_premium)
  );

  return jsonb_build_object(
    'winner_id', v_winner,
    'premium', v_premium,
    'share_per_member', v_share,
    'cycle', v_cycle
  );
end;
$$;

revoke all on function public.close_tontine_auction(uuid) from public;
grant execute on function public.close_tontine_auction(uuid) to authenticated;

-- Open auction window (admin)
create or replace function public.open_tontine_auction(
  p_tontine_id uuid,
  p_hours int default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hours int := greatest(coalesce(p_hours, 24), 1);
  v_ends timestamptz;
begin
  if v_uid is null then raise exception 'Non authentifié.'; end if;
  if not (public.is_tontine_admin(p_tontine_id) or public.is_admin()) then
    raise exception 'Seul l''admin de la tontine peut ouvrir les enchères.';
  end if;

  v_ends := now() + make_interval(hours => v_hours);

  update public.tontines
  set auction_closed = false,
      auction_ends_at = v_ends
  where id = p_tontine_id;

  if not found then raise exception 'Tontine introuvable.'; end if;

  return jsonb_build_object(
    'tontine_id', p_tontine_id,
    'auction_closed', false,
    'auction_ends_at', v_ends
  );
end;
$$;

revoke all on function public.open_tontine_auction(uuid, int) from public;
grant execute on function public.open_tontine_auction(uuid, int) to authenticated;

grant select, insert, update on public.tontine_auction_bids to authenticated;
grant select, insert on public.tontine_auction_results to authenticated;

-- ── Diaspora: payer pour un proche (bénéficiaire) ───────────
alter table public.diaspora_contribution_requests
  add column if not exists beneficiary_user_id uuid references auth.users(id);

alter table public.diaspora_contribution_requests
  add column if not exists sponsor_user_id uuid references auth.users(id);

comment on column public.diaspora_contribution_requests.beneficiary_user_id is
  'Membre local qui reçoit la cotisation; null = user_id (self)';
comment on column public.diaspora_contribution_requests.sponsor_user_id is
  'Diaspora qui paie pour le bénéficiaire; null = self-pay';

update public.diaspora_contribution_requests
set beneficiary_user_id = user_id
where beneficiary_user_id is null;

-- Allow service_role fulfillment (Paynote confirm) to set validated
create or replace function public.protect_diaspora_contribution_updates()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.status in ('validated', 'under_review') and old.status is distinct from new.status then
    if new.status = 'under_review' and old.status in ('pending_payment', 'proof_submitted', 'rejected', 'needs_info') then
      null;
    else
      raise exception 'Transition de statut non autorisée.';
    end if;
  end if;

  if new.status = 'validated' then
    raise exception 'Validation réservée aux administrateurs.';
  end if;

  if new.amount_expected is distinct from old.amount_expected then
    raise exception 'Montant attendu non modifiable.';
  end if;

  if new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by
     or new.receipt_id is distinct from old.receipt_id then
    raise exception 'Champs admin non modifiables.';
  end if;

  return new;
end $$;

-- Credit beneficiary after MoMo Paynote success (sponsor path)
create or replace function public.fulfill_diaspora_sponsor_payment(
  p_request_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.diaspora_contribution_requests%rowtype;
  v_beneficiary uuid;
  v_tontine public.tontines%rowtype;
  v_reserve numeric;
  v_net numeric;
  v_pay public.payments%rowtype;
begin
  select * into v_req from public.diaspora_contribution_requests where id = p_request_id;
  if not found then raise exception 'Demande diaspora introuvable.'; end if;
  if v_req.status = 'validated' then
    return jsonb_build_object('already_fulfilled', true);
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found or v_pay.status <> 'succeeded' then
    raise exception 'Paiement non confirmé.';
  end if;

  -- Sponsor must own the payment
  if v_pay.user_id <> coalesce(v_req.sponsor_user_id, v_req.user_id) then
    raise exception 'Paiement non lié à cette demande.';
  end if;

  v_beneficiary := coalesce(v_req.beneficiary_user_id, v_req.user_id);

  if exists (
    select 1 from public.tontine_contributions tc
    where tc.tontine_id = v_req.tontine_id
      and tc.user_id = v_beneficiary
      and tc.cycle = v_req.cycle
  ) then
    update public.diaspora_contribution_requests set
      status = 'validated',
      payment_id = p_payment_id,
      reviewed_at = now(),
      updated_at = now()
    where id = p_request_id;
    return jsonb_build_object('already_contributed', true);
  end if;

  select * into v_tontine from public.tontines where id = v_req.tontine_id;
  v_reserve := round(v_req.amount_expected * 0.02);
  v_net := v_req.amount_expected - v_reserve;

  insert into public.tontine_contributions (tontine_id, user_id, amount, cycle, payment_method)
  values (v_req.tontine_id, v_beneficiary, v_net, v_req.cycle, 'diaspora_sponsor_momo');

  update public.tontines
  set reserve_fund = coalesce(reserve_fund, 0) + v_reserve
  where id = v_req.tontine_id;

  update public.tontine_members
  set status = 'a_jour', last_paid_cycle = v_req.cycle
  where tontine_id = v_req.tontine_id and user_id = v_beneficiary;

  update public.diaspora_contribution_requests set
    status = 'validated',
    payment_id = p_payment_id,
    receipt_id = coalesce(receipt_id, 'HDX-RCP-' || upper(substr(replace(id::text, '-', ''), 1, 10))),
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id;

  insert into public.notifications (user_id, title, body, type, is_read, metadata)
  values (
    v_beneficiary,
    'Cotisation payée par la diaspora',
    'Un proche a réglé votre cotisation via HODIX.',
    'payment',
    false,
    jsonb_build_object('action_url', '/tontines/' || v_req.tontine_id)
  );

  return jsonb_build_object(
    'ok', true,
    'beneficiary_user_id', v_beneficiary,
    'net_amount', v_net
  );
end;
$$;

revoke all on function public.fulfill_diaspora_sponsor_payment(uuid, uuid) from public;
grant execute on function public.fulfill_diaspora_sponsor_payment(uuid, uuid) to service_role;

-- Extend confirm_cinetpay_payment for diaspora_sponsor kind
create or replace function public.confirm_cinetpay_payment(
  p_payment_id uuid,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
  v_user uuid;
  v_meta jsonb;
  v_amount numeric;
  v_kind text;
  v_locked uuid;
  v_roundup jsonb;
  v_result jsonb;
  v_pending text;
  v_plan text;
  v_req_id uuid;
begin
  if p_payment_id is null then raise exception 'payment_id requis.'; end if;
  if coalesce(trim(p_reference), '') = '' then raise exception 'Référence requise.'; end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Paiement introuvable.'; end if;

  if auth.uid() is not null and auth.uid() <> v_pay.user_id and not public.is_admin() then
    raise exception 'Non autorisé.';
  end if;

  if v_pay.status = 'succeeded' then
    return jsonb_build_object(
      'payment_id', p_payment_id, 'status', 'succeeded', 'already_fulfilled', true
    );
  end if;

  v_pending := v_pay.status;
  if v_pending not in ('pending_cinetpay', 'pending_paynote') then
    raise exception 'Ce paiement n''est plus en attente.';
  end if;

  v_user := v_pay.user_id;
  v_meta := public._payment_meta(v_pay.description);
  if v_meta is null or v_meta = '{}'::jsonb then
    raise exception 'Métadonnées de paiement invalides.';
  end if;

  v_amount := coalesce((v_meta->>'amount_xaf')::numeric, v_pay.amount);
  v_kind := coalesce(v_meta->>'kind', '');

  update public.payments
    set status = 'succeeded',
        description = split_part(v_pay.description, ' · ref:', 1) || ' · ref:' || p_reference
    where id = p_payment_id and status = v_pending
    returning id into v_locked;

  if v_locked is null then
    return jsonb_build_object(
      'payment_id', p_payment_id, 'status', 'succeeded', 'already_fulfilled', true
    );
  end if;

  case v_kind
    when 'tontine_contribution' then
      perform public.contribute_tontine_paid(
        (v_meta->>'tontine_id')::uuid, v_amount, p_payment_id
      );
    when 'diaspora_sponsor' then
      v_req_id := (v_meta->>'diaspora_request_id')::uuid;
      if v_req_id is null then raise exception 'diaspora_request_id requis.'; end if;
      v_result := public.fulfill_diaspora_sponsor_payment(v_req_id, p_payment_id);
    when 'savings_deposit' then
      perform public.savings_deposit_paid(
        (v_meta->>'goal_id')::uuid, v_amount, p_payment_id,
        case when coalesce(v_meta->>'gateway', '') = 'paynote' then 'Dépôt MTN Paynote' else 'Dépôt CinetPay' end
      );
    when 'association_contribution' then
      perform public.contribute_association_paid(
        (v_meta->>'association_id')::uuid, v_amount, p_payment_id
      );
    when 'cooperative_contribution' then
      perform public.contribute_cooperative_paid(
        (v_meta->>'cooperative_id')::uuid, v_amount, p_payment_id
      );
    when 'fund_contribution' then
      perform public.contribute_fund_paid(
        (v_meta->>'fund_id')::uuid, v_amount, p_payment_id
      );
    when 'wallet_topup' then
      perform public.wallet_topup(
        v_amount, 'XAF',
        case when coalesce(v_meta->>'gateway', '') = 'paynote' then 'MTN MoMo (Paynote)' else coalesce(v_meta->>'provider', 'CinetPay') end,
        coalesce(v_meta->>'phone', ''),
        v_amount, p_payment_id
      );
      insert into public.identity_events (user_id, event_type, points_delta)
      values (v_user, 'wallet_topup', 1);
      v_roundup := public.apply_momo_roundup(v_user, v_amount, p_payment_id);
    when 'certified_report' then
      if not exists (
        select 1 from public.certificate_purchases
        where user_id = v_user
          and kind = coalesce(v_meta->>'cert_kind', 'identity')
          and status = 'paid'
      ) then
        insert into public.certificate_purchases
          (user_id, kind, amount_xaf, status, payment_id, paid_at)
        values (
          v_user,
          coalesce(v_meta->>'cert_kind', 'identity'),
          10000, 'paid', p_payment_id, now()
        );
      end if;
    when 'manager_pro_subscription' then
      update public.profiles
      set manager_pro_plan = 'pro',
          manager_pro_until = case
            when manager_pro_until is not null and manager_pro_until > now()
              then manager_pro_until + interval '30 days'
            else now() + interval '30 days'
          end
      where id = v_user;
    when 'subscription' then
      v_plan := coalesce(v_meta->>'plan_id', '');
      insert into public.notifications (user_id, title, body, type, is_read)
      values (
        v_user,
        'Paiement abonnement reçu',
        'Votre paiement d''abonnement a été confirmé.' || case when v_plan <> '' then ' Plan: ' || v_plan else '' end,
        'success',
        false
      );
    else
      raise exception 'Type de paiement inconnu: %', v_kind;
  end case;

  if v_kind <> 'subscription' then
    insert into public.notifications (user_id, title, body, type, is_read)
    values (
      v_user,
      'Paiement confirmé',
      to_char(v_amount, 'FM999G999G999') || ' XAF — opération enregistrée après validation du paiement.',
      'success',
      false
    );
  end if;

  v_result := jsonb_build_object(
    'payment_id', p_payment_id,
    'status', 'succeeded',
    'kind', v_kind,
    'amount_xaf', v_amount,
    'roundup', v_roundup
  );
  return v_result;
end;
$$;

revoke all on function public.confirm_cinetpay_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_cinetpay_payment(uuid, text) to service_role;
