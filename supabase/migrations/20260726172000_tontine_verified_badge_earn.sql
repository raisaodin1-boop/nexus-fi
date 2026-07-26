-- Verified HODIX badge: earn via clean cycles (auto) or paid acceleration.
-- Does not replace fraud/moderation gates. Admin grant path kept.

alter table public.tontines
  add column if not exists verified_source text
    check (verified_source is null or verified_source in ('auto', 'paid', 'admin'));

alter table public.tontines
  add column if not exists verified_at timestamptz;

alter table public.tontines
  add column if not exists verified_payment_id uuid references public.payments(id);

comment on column public.tontines.verified_source is
  'How badge was granted: auto (cycles), paid (accelerate), admin.';

-- Allow SECURITY DEFINER grant RPCs (non-admin callers) via session GUC
create or replace function public.enforce_tontine_risk_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_flags text[];
  v_fp text;
  v_created timestamptz;
  v_prior_public int;
  v_sibling int;
  v_amount numeric;
  v_is_admin boolean;
  v_reasons text[] := '{}';
  v_grant_ok boolean := coalesce(current_setting('hodix.grant_verified', true), '') = '1';
begin
  v_is_admin := coalesce(public.is_admin(), false);

  if tg_op = 'UPDATE' then
    if not v_is_admin and not v_grant_ok then
      if coalesce(new.is_hodix_verified, false) is distinct from coalesce(old.is_hodix_verified, false)
         and coalesce(new.is_hodix_verified, false) = true then
        raise exception 'Seul un admin HODIX peut accorder le badge Vérifié.';
      end if;
      if coalesce(new.moderation_status, 'approved') is distinct from coalesce(old.moderation_status, 'approved') then
        raise exception 'Le statut de modération est réservé à l''administration.';
      end if;
      new.moderation_reviewed_at := old.moderation_reviewed_at;
      new.moderation_reviewed_by := old.moderation_reviewed_by;
    end if;
    return new;
  end if;

  if not v_is_admin then
    new.is_hodix_verified := false;
  end if;

  if v_uid is null then
    return new;
  end if;

  select coalesce(trust_flags, '{}'), device_fingerprint, created_at
    into v_flags, v_fp, v_created
  from public.profiles
  where id = v_uid;

  if 'blacklisted' = any(v_flags) or 'fraud_confirmed' = any(v_flags) then
    raise exception 'Compte suspendu pour fraude. Contactez le support.';
  end if;

  if v_fp is not null and exists (
    select 1 from public.flagged_devices fd where fd.fingerprint = v_fp
  ) then
    raise exception 'Appareil signalé pour activité frauduleuse.';
  end if;

  if v_fp is not null then
    select count(*)::int into v_sibling
    from public.profiles p
    where p.device_fingerprint = v_fp and p.id <> v_uid;
    if coalesce(v_sibling, 0) >= 1 then
      raise exception 'Multi-comptes détectés sur cet appareil. Contactez le support.';
    end if;
  end if;

  if coalesce(new.is_personal, false) = true then
    new.moderation_status := 'approved';
    new.moderation_reason := null;
    return new;
  end if;

  if v_is_admin then
    new.moderation_status := coalesce(new.moderation_status, 'approved');
    return new;
  end if;

  v_amount := coalesce(new.amount_per_cycle, new.contribution_amount, 0);

  if v_amount >= 50000 then
    v_reasons := array_append(v_reasons, 'montant élevé (≥ 50 000 XAF/cycle)');
  end if;

  select count(*)::int into v_prior_public
  from public.tontines t
  where t.owner_id = v_uid
    and coalesce(t.is_personal, false) = false;

  if coalesce(v_prior_public, 0) = 0
     and v_created is not null
     and v_created > now() - interval '7 days' then
    v_reasons := array_append(v_reasons, '1ère tontine publique d''un compte neuf');
  end if;

  if cardinality(v_reasons) > 0 then
    new.moderation_status := 'pending_review';
    new.moderation_reason := array_to_string(v_reasons, ' · ');
    new.is_public := false;
  else
    new.moderation_status := 'approved';
    new.moderation_reason := null;
  end if;

  return new;
end;
$$;

-- Pricing (XAF) — bumped vs initial guide
create or replace function public.verified_badge_price_xaf(p_amount_per_cycle numeric)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_amount_per_cycle, 0) <= 10000 then 5000::numeric
    when p_amount_per_cycle <= 50000 then 10000::numeric
    else least(35000::numeric, greatest(15000::numeric, round(p_amount_per_cycle * 0.02)))
  end;
$$;

revoke all on function public.verified_badge_price_xaf(numeric) from public;
grant execute on function public.verified_badge_price_xaf(numeric) to authenticated, service_role;

-- Eligibility / progress for badge
create or replace function public.get_tontine_verified_eligibility(p_tontine_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tontines%rowtype;
  v_members int := 0;
  v_completed int := 0;
  v_compliance numeric := 0;
  v_fraud_open int := 0;
  v_flags text[] := '{}';
  v_price numeric;
  v_auto boolean := false;
  v_path text := null;
  v_reasons text[] := '{}';
begin
  if v_uid is null then raise exception 'Non authentifié.'; end if;

  select * into v_t from public.tontines where id = p_tontine_id;
  if v_t.id is null then raise exception 'Tontine introuvable.'; end if;

  if not (
    public.is_tontine_member(p_tontine_id)
    or public.is_tontine_owner(p_tontine_id)
    or public.is_admin()
  ) then
    raise exception 'Accès réservé aux membres.';
  end if;

  select count(*)::int into v_members
  from public.tontine_members
  where tontine_id = p_tontine_id
    and coalesce(status, 'a_jour') <> 'exclu';

  -- Completed cycles = distinct past cycles where enough members paid (≥ 80% of roster)
  select count(*)::int into v_completed
  from (
    select c.cycle
    from public.tontine_contributions c
    where c.tontine_id = p_tontine_id
      and c.cycle is not null
      and c.cycle < coalesce(v_t.current_cycle, 1)
    group by c.cycle
    having count(distinct c.user_id) >= greatest(1, ceil(v_members * 0.8))
  ) x;

  if v_completed = 0 and coalesce(v_t.current_cycle, 1) > 1 then
    v_completed := greatest(0, coalesce(v_t.current_cycle, 1) - 1);
  end if;

  if v_members > 0 and v_completed > 0 then
    select least(100, round(
      100.0 * count(*)::numeric
      / nullif(v_members * v_completed, 0)
    )) into v_compliance
    from public.tontine_contributions c
    where c.tontine_id = p_tontine_id
      and c.cycle is not null
      and c.cycle < coalesce(v_t.current_cycle, 1);
  else
    v_compliance := 0;
  end if;

  if v_t.owner_id is not null then
    select count(*)::int into v_fraud_open
    from public.fraud_alerts
    where user_id = v_t.owner_id and status = 'open';

    select coalesce(trust_flags, '{}') into v_flags
    from public.profiles where id = v_t.owner_id;
  end if;

  v_price := public.verified_badge_price_xaf(coalesce(v_t.amount_per_cycle, v_t.contribution_amount, 0));

  if coalesce(v_t.is_hodix_verified, false) then
    return jsonb_build_object(
      'tontine_id', p_tontine_id,
      'already_verified', true,
      'verified_source', v_t.verified_source,
      'verified_at', v_t.verified_at,
      'completed_cycles', v_completed,
      'compliance_pct', v_compliance,
      'members_count', v_members,
      'price_xaf', v_price,
      'auto_eligible', false,
      'paid_eligible', false,
      'can_claim_auto', false,
      'blockers', '[]'::jsonb
    );
  end if;

  if coalesce(v_t.is_personal, false) or not coalesce(v_t.is_public, false) then
    v_reasons := array_append(v_reasons, 'Tontine publique requise (Découvrir)');
  end if;
  if coalesce(v_t.moderation_status, 'approved') <> 'approved' then
    v_reasons := array_append(v_reasons, 'Publication Découvrir non validée');
  end if;
  if v_fraud_open > 0 then
    v_reasons := array_append(v_reasons, 'Alerte fraude ouverte sur le gestionnaire');
  end if;
  if 'blacklisted' = any(v_flags) or 'fraud_confirmed' = any(v_flags) then
    v_reasons := array_append(v_reasons, 'Compte gestionnaire suspendu / fraude');
  end if;

  if cardinality(v_reasons) = 0 then
    if v_completed >= 10 and v_compliance >= 90 then
      v_auto := true; v_path := '10_cycles_90';
    elsif v_completed >= 6 and v_compliance >= 95 then
      v_auto := true; v_path := '6_cycles_95';
    end if;
  end if;

  return jsonb_build_object(
    'tontine_id', p_tontine_id,
    'already_verified', false,
    'completed_cycles', v_completed,
    'target_cycles', 10,
    'compliance_pct', v_compliance,
    'members_count', v_members,
    'open_fraud_alerts', v_fraud_open,
    'price_xaf', v_price,
    'auto_eligible', v_auto,
    'auto_path', v_path,
    'paid_eligible', cardinality(v_reasons) = 0,
    'can_claim_auto', v_auto
      and (public.is_tontine_admin(p_tontine_id) or public.is_tontine_owner(p_tontine_id) or public.is_admin()),
    'blockers', to_jsonb(v_reasons),
    'rules', jsonb_build_object(
      'auto_standard', '10 cycles complets + conformité ≥ 90 %',
      'auto_fast', '6 cycles complets + conformité ≥ 95 %',
      'paid', 'Accélération Découvrir — ne remplace pas les contrôles anti-fraude'
    )
  );
end;
$$;

revoke all on function public.get_tontine_verified_eligibility(uuid) from public;
grant execute on function public.get_tontine_verified_eligibility(uuid) to authenticated;

create or replace function public.claim_tontine_verified_badge_auto(p_tontine_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_elig jsonb;
  v_t public.tontines%rowtype;
begin
  if v_uid is null then raise exception 'Non authentifié.'; end if;
  if not (public.is_tontine_admin(p_tontine_id) or public.is_tontine_owner(p_tontine_id) or public.is_admin()) then
    raise exception 'Seul le gestionnaire peut réclamer le badge.';
  end if;

  v_elig := public.get_tontine_verified_eligibility(p_tontine_id);
  if coalesce((v_elig->>'already_verified')::boolean, false) then
    return jsonb_build_object('status', 'already_verified');
  end if;
  if not coalesce((v_elig->>'can_claim_auto')::boolean, false) then
    raise exception 'Conditions non remplies pour le badge gratuit (10 cycles ≥90%% ou 6 cycles ≥95%%, sans alerte fraude).';
  end if;

  perform set_config('hodix.grant_verified', '1', true);

  update public.tontines set
    is_hodix_verified = true,
    verified_source = 'auto',
    verified_at = now(),
    verified_payment_id = null
  where id = p_tontine_id
  returning * into v_t;

  -- Close pending badge requests
  update public.tontine_verified_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = v_uid
  where tontine_id = p_tontine_id and status = 'pending';

  insert into public.notifications (user_id, title, body, type, metadata)
  values (
    v_uid,
    'Badge Vérifié HODIX obtenu',
    '« ' || v_t.name || ' » a gagné le badge grâce à sa régularité ('
      || coalesce(v_elig->>'completed_cycles', '0') || ' cycles, '
      || coalesce(v_elig->>'compliance_pct', '0') || '% conformité).',
    'success',
    jsonb_build_object('action_url', '/tontines/' || p_tontine_id::text, 'source', 'auto')
  );

  return jsonb_build_object(
    'status', 'verified',
    'source', 'auto',
    'eligibility', v_elig
  );
end;
$$;

revoke all on function public.claim_tontine_verified_badge_auto(uuid) from public;
grant execute on function public.claim_tontine_verified_badge_auto(uuid) to authenticated;

create or replace function public.fulfill_verified_badge_payment(
  p_tontine_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
  v_t public.tontines%rowtype;
  v_meta jsonb;
  v_amount numeric;
  v_expected numeric;
  v_elig jsonb;
  v_flags text[];
begin
  if p_tontine_id is null or p_payment_id is null then
    raise exception 'tontine_id et payment_id requis.';
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if v_pay.id is null then raise exception 'Paiement introuvable.'; end if;
  if v_pay.status <> 'succeeded' then raise exception 'Paiement non confirmé.'; end if;

  select * into v_t from public.tontines where id = p_tontine_id;
  if v_t.id is null then raise exception 'Tontine introuvable.'; end if;

  if coalesce(v_t.is_hodix_verified, false) then
    return jsonb_build_object('already_fulfilled', true, 'tontine_id', p_tontine_id);
  end if;

  v_meta := public._payment_meta(v_pay.description);
  if coalesce(v_meta->>'kind', '') <> 'verified_badge' then
    raise exception 'Type de paiement invalide pour le badge.';
  end if;
  if (v_meta->>'tontine_id')::uuid is distinct from p_tontine_id then
    raise exception 'Paiement non lié à cette tontine.';
  end if;

  -- Fraud / visibility gates still apply for paid path
  if coalesce(v_t.is_personal, false) or not coalesce(v_t.is_public, false) then
    raise exception 'Badge réservé aux tontines publiques.';
  end if;
  if coalesce(v_t.moderation_status, 'approved') <> 'approved' then
    raise exception 'Publication Découvrir non validée.';
  end if;
  if exists (
    select 1 from public.fraud_alerts
    where user_id = v_t.owner_id and status = 'open'
  ) then
    raise exception 'Alerte fraude ouverte — badge refusé.';
  end if;
  select coalesce(trust_flags, '{}') into v_flags from public.profiles where id = v_t.owner_id;
  if 'blacklisted' = any(v_flags) or 'fraud_confirmed' = any(v_flags) then
    raise exception 'Compte gestionnaire non éligible.';
  end if;

  v_expected := public.verified_badge_price_xaf(coalesce(v_t.amount_per_cycle, v_t.contribution_amount, 0));
  v_amount := coalesce((v_meta->>'amount_xaf')::numeric, v_pay.amount);
  if v_amount < v_expected then
    raise exception 'Montant insuffisant pour le badge (attendu % XAF).', v_expected;
  end if;

  if v_pay.user_id is distinct from v_t.owner_id
     and not exists (
       select 1 from public.tontine_members
       where tontine_id = p_tontine_id and user_id = v_pay.user_id and role = 'admin'
     ) then
    raise exception 'Seul le gestionnaire peut payer le badge.';
  end if;

  perform set_config('hodix.grant_verified', '1', true);

  update public.tontines set
    is_hodix_verified = true,
    verified_source = 'paid',
    verified_at = now(),
    verified_payment_id = p_payment_id
  where id = p_tontine_id;

  update public.tontine_verified_requests
  set status = 'approved', reviewed_at = now()
  where tontine_id = p_tontine_id and status = 'pending';

  insert into public.notifications (user_id, title, body, type, metadata)
  values (
    v_pay.user_id,
    'Badge Vérifié HODIX activé',
    'Votre paiement accélère la crédibilité de « ' || v_t.name || ' » sur Découvrir.',
    'success',
    jsonb_build_object('action_url', '/tontines/' || p_tontine_id::text, 'source', 'paid', 'payment_id', p_payment_id)
  );

  return jsonb_build_object(
    'already_fulfilled', false,
    'tontine_id', p_tontine_id,
    'source', 'paid',
    'amount_xaf', v_amount
  );
end;
$$;

revoke all on function public.fulfill_verified_badge_payment(uuid, uuid) from public;
grant execute on function public.fulfill_verified_badge_payment(uuid, uuid) to service_role;

-- Patch confirm_cinetpay_payment to fulfill verified_badge
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
  v_tontine_id uuid;
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
    when 'auction_premium' then
      v_tontine_id := (v_meta->>'tontine_id')::uuid;
      if v_tontine_id is null then raise exception 'tontine_id requis.'; end if;
      v_result := public.fulfill_auction_premium(v_tontine_id, p_payment_id);
    when 'verified_badge' then
      v_tontine_id := (v_meta->>'tontine_id')::uuid;
      if v_tontine_id is null then raise exception 'tontine_id requis.'; end if;
      v_result := public.fulfill_verified_badge_payment(v_tontine_id, p_payment_id);
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

-- Admin grant sets source
create or replace function public.admin_review_tontine_verified(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.tontine_verified_requests%rowtype;
  v_t public.tontines%rowtype;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  select * into v_req from public.tontine_verified_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Demande introuvable.'; end if;
  if v_req.status <> 'pending' then raise exception 'Demande déjà traitée.'; end if;

  select * into v_t from public.tontines where id = v_req.tontine_id;

  update public.tontine_verified_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    rejection_reason = case when p_approve then null else coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Refusé') end,
    reviewed_by = v_uid,
    reviewed_at = now()
  where id = p_request_id;

  if p_approve then
    perform set_config('hodix.grant_verified', '1', true);
    update public.tontines set
      is_hodix_verified = true,
      verified_source = 'admin',
      verified_at = now()
    where id = v_req.tontine_id;
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.requester_id,
      'Badge Vérifié HODIX accordé',
      '« ' || coalesce(v_t.name, 'Votre tontine') || ' » porte désormais le badge officiel.',
      'success',
      jsonb_build_object('action_url', '/tontines/' || v_req.tontine_id::text)
    );
  else
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.requester_id,
      'Badge Vérifié refusé',
      'La demande pour « ' || coalesce(v_t.name, 'votre tontine') || ' » a été refusée.'
        || case when p_note is not null and trim(p_note) <> '' then ' Motif : ' || trim(p_note) else '' end,
      'warning',
      jsonb_build_object('action_url', '/tontines/' || v_req.tontine_id::text)
    );
  end if;

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', case when p_approve then 'approved' else 'rejected' end
  );
end;
$$;
