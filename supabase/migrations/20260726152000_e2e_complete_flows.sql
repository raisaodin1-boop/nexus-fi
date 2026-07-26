-- Close end-to-end gaps: join reply, diaspora sponsor RPC, auction premium pay,
-- public discover counts, stale pending expire, association notif deep links.

-- ── 1. Public discover: members/contribs readable for public tontines ──
drop policy if exists "tontine_members_select" on public.tontine_members;
create policy "tontine_members_select" on public.tontine_members
  for select to authenticated using (
    public.is_tontine_member(tontine_id)
    or public.is_tontine_owner(tontine_id)
    or public.is_admin()
    or exists (
      select 1 from public.tontines t
      where t.id = tontine_id and coalesce(t.is_public, false) = true
    )
  );

drop policy if exists "tontine_contributions_select" on public.tontine_contributions;
create policy "tontine_contributions_select" on public.tontine_contributions
  for select to authenticated using (
    public.is_tontine_member(tontine_id)
    or public.is_tontine_owner(tontine_id)
    or public.is_admin()
    or exists (
      select 1 from public.tontines t
      where t.id = tontine_id and coalesce(t.is_public, false) = true
    )
  );

-- ── 2. Requester replies to needs_info ──────────────────────────
create or replace function public.reply_tontine_join_info(
  p_request_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.tontine_join_requests%rowtype;
  v_t public.tontines%rowtype;
  v_msg text := nullif(trim(coalesce(p_message, '')), '');
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if v_msg is null then raise exception 'Réponse requise.'; end if;

  select * into v_req from public.tontine_join_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Demande introuvable'; end if;
  if v_req.requester_id is distinct from v_uid then raise exception 'Non autorisé'; end if;
  if v_req.status <> 'needs_info' then
    raise exception 'Aucune information n''est demandée pour cette demande.';
  end if;

  select * into v_t from public.tontines where id = v_req.tontine_id;

  update public.tontine_join_requests
  set status = 'pending',
      message = v_msg,
      reviewed_by = null,
      reviewed_at = null,
      created_at = now()
  where id = p_request_id;
  -- keep owner_note so admin still sees what was asked

  if v_t.owner_id is not null then
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_t.owner_id,
      'Réponse à votre demande d''infos',
      'Le candidat a répondu pour « ' || coalesce(v_t.name, 'la tontine') || ' ». Vous pouvez accepter ou refuser.',
      'join_request',
      jsonb_build_object(
        'tontine_id', v_t.id,
        'request_id', p_request_id,
        'requester_id', v_uid,
        'action_url', '/manage'
      )
    );
  end if;

  return jsonb_build_object('status', 'pending', 'request_id', p_request_id);
end;
$$;

revoke all on function public.reply_tontine_join_info(uuid, text) from public;
grant execute on function public.reply_tontine_join_info(uuid, text) to authenticated;

-- Fix join_request_sent deep link + preserve owner_note on re-request
create or replace function public.request_join_tontine(p_tontine_id uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tontines%rowtype;
  v_id uuid;
  v_count int;
  v_admin record;
  v_prev_status text;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  select * into v_t from public.tontines where id = p_tontine_id;
  if v_t.id is null then raise exception 'Tontine introuvable'; end if;
  if not coalesce(v_t.is_public, false) then
    raise exception 'Cette tontine est privée — utilisez un code d''invitation';
  end if;
  if coalesce(v_t.is_active, true) is false then
    raise exception 'Cette tontine n''est plus active';
  end if;

  if exists (
    select 1 from public.tontine_members
    where tontine_id = p_tontine_id and user_id = v_uid
  ) then
    raise exception 'Vous êtes déjà membre de cette tontine';
  end if;

  select count(*)::int into v_count
  from public.tontine_members
  where tontine_id = p_tontine_id and coalesce(status, '') <> 'exclu';

  if v_t.max_members is not null and v_count >= v_t.max_members then
    raise exception 'La tontine est complète';
  end if;

  select status into v_prev_status
  from public.tontine_join_requests
  where tontine_id = p_tontine_id and requester_id = v_uid;

  insert into public.tontine_join_requests (tontine_id, requester_id, message, status)
  values (p_tontine_id, v_uid, nullif(trim(coalesce(p_message, '')), ''), 'pending')
  on conflict (tontine_id, requester_id) do update
    set status = 'pending',
        message = coalesce(excluded.message, public.tontine_join_requests.message),
        reviewed_by = null,
        reviewed_at = null,
        created_at = now()
        -- owner_note preserved
  returning id into v_id;

  -- Only notify owner/admins on fresh / new pending (not silent reply path)
  if v_prev_status is distinct from 'needs_info' then
    if v_t.owner_id is not null then
      insert into public.notifications (user_id, title, body, type, metadata)
      values (
        v_t.owner_id,
        'Demande d''adhésion',
        'Quelqu''un souhaite rejoindre « ' || v_t.name || ' ». Acceptez, refusez ou demandez plus d''infos.',
        'join_request',
        jsonb_build_object(
          'tontine_id', p_tontine_id,
          'request_id', v_id,
          'requester_id', v_uid,
          'group_type', 'tontine',
          'action_url', '/manage'
        )
      );
    end if;

    for v_admin in
      select id from public.profiles
      where role in ('admin', 'super_admin')
        and id is distinct from v_t.owner_id
    loop
      insert into public.notifications (user_id, title, body, type, metadata)
      values (
        v_admin.id,
        'Demande d''adhésion tontine',
        'Nouvelle demande pour « ' || v_t.name || ' ».',
        'join_request',
        jsonb_build_object(
          'tontine_id', p_tontine_id,
          'request_id', v_id,
          'requester_id', v_uid,
          'group_type', 'tontine',
          'action_url', '/manage'
        )
      );
    end loop;
  end if;

  insert into public.notifications (user_id, title, body, type, metadata)
  values (
    v_uid,
    'Demande envoyée',
    'Votre demande pour « ' || v_t.name || ' » a été transmise au manager.',
    'join_request_sent',
    jsonb_build_object(
      'tontine_id', p_tontine_id,
      'request_id', v_id,
      'action_url', '/tontines/' || p_tontine_id::text || '/profile'
    )
  );

  return jsonb_build_object('status', 'pending', 'request_id', v_id, 'tontine_id', p_tontine_id);
end;
$$;

-- needs_info action_url → profile with reply mode
create or replace function public.request_tontine_join_info(
  p_request_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.tontine_join_requests%rowtype;
  v_t public.tontines%rowtype;
  v_note text := nullif(trim(coalesce(p_message, '')), '');
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if v_note is null then raise exception 'Indiquez les informations demandées.'; end if;

  select * into v_req from public.tontine_join_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Demande introuvable'; end if;
  if v_req.status not in ('pending', 'needs_info') then
    raise exception 'Demande déjà traitée';
  end if;

  select * into v_t from public.tontines where id = v_req.tontine_id;
  if v_t.id is null then raise exception 'Tontine introuvable'; end if;

  if v_t.owner_id is distinct from v_uid
     and not public.is_admin()
     and not exists (
       select 1 from public.tontine_members m
       where m.tontine_id = v_t.id and m.user_id = v_uid and m.role = 'admin'
     )
  then
    raise exception 'Non autorisé';
  end if;

  update public.tontine_join_requests
  set status = 'needs_info',
      owner_note = v_note,
      reviewed_by = v_uid,
      reviewed_at = now()
  where id = p_request_id;

  insert into public.notifications (user_id, title, body, type, metadata)
  values (
    v_req.requester_id,
    'Informations demandées',
    'Pour rejoindre « ' || v_t.name || ' » : ' || v_note,
    'join_request_needs_info',
    jsonb_build_object(
      'tontine_id', v_t.id,
      'request_id', p_request_id,
      'action_url', '/tontines/' || v_t.id::text || '/profile?reply=1'
    )
  );

  return jsonb_build_object(
    'status', 'needs_info',
    'request_id', p_request_id,
    'requester_id', v_req.requester_id
  );
end;
$$;

-- ── 3. Diaspora sponsor create (SECURITY DEFINER — bypass RLS) ──
create or replace function public.create_diaspora_sponsor_request(
  p_invite_code text,
  p_beneficiary_phone text,
  p_relation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_invite_code, '')));
  v_digits text := regexp_replace(coalesce(p_beneficiary_phone, ''), '\D', '', 'g');
  v_last9 text;
  v_t public.tontines%rowtype;
  v_ben uuid;
  v_ben_name text;
  v_cycle int;
  v_amount numeric;
  v_ref text;
  v_due timestamptz;
  v_existing public.diaspora_contribution_requests%rowtype;
  v_id uuid;
  v_enrolled boolean;
begin
  if v_uid is null then raise exception 'Non authentifié.'; end if;
  if v_code = '' then raise exception 'Code d''invitation requis.'; end if;
  v_last9 := right(v_digits, 9);
  if length(v_last9) < 9 then raise exception 'Numéro du proche au Cameroun invalide.'; end if;

  select exists (
    select 1 from public.diaspora_enrollments e
    where e.user_id = v_uid and e.status = 'approved'
  ) into v_enrolled;
  if not coalesce(v_enrolled, false) then
    raise exception 'Accès Diaspora requis — complétez votre inscription.';
  end if;

  select * into v_t from public.tontines where invite_code = v_code;
  if v_t.id is null then raise exception 'Tontine introuvable pour ce code.'; end if;

  select p.id, coalesce(p.full_name, 'Proche')
    into v_ben, v_ben_name
  from public.profiles p
  where regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') like '%' || v_last9
  order by case when right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = v_last9 then 0 else 1 end
  limit 1;

  if v_ben is null then
    raise exception 'Aucun membre HODIX trouvé avec ce numéro. Le proche doit avoir un compte.';
  end if;
  if v_ben = v_uid then
    raise exception 'Pour vous-même, utilisez « Payer une cotisation ».';
  end if;

  if not exists (
    select 1 from public.tontine_members m
    where m.tontine_id = v_t.id and m.user_id = v_ben and coalesce(m.status, '') <> 'exclu'
  ) then
    raise exception 'Ce proche n''est pas membre de cette tontine.';
  end if;

  v_cycle := coalesce(v_t.current_cycle, 1);
  if exists (
    select 1 from public.tontine_contributions tc
    where tc.tontine_id = v_t.id and tc.user_id = v_ben and tc.cycle = v_cycle
  ) then
    raise exception 'Cotisation déjà validée pour ce cycle.';
  end if;

  select * into v_existing
  from public.diaspora_contribution_requests
  where sponsor_user_id = v_uid
    and beneficiary_user_id = v_ben
    and tontine_id = v_t.id
    and cycle = v_cycle
    and status <> 'validated'
  order by created_at desc
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'id', v_existing.id,
      'tontine_id', v_t.id,
      'tontine_name', v_t.name,
      'amount_expected', v_existing.amount_expected,
      'currency', coalesce(v_existing.currency, 'XAF'),
      'cycle', v_cycle,
      'status', v_existing.status,
      'reference_code', v_existing.reference_code,
      'beneficiary_user_id', v_ben,
      'beneficiary_name', v_ben_name,
      'sponsor_user_id', v_uid
    );
  end if;

  v_amount := coalesce(v_t.amount_per_cycle, v_t.contribution_amount, 0);
  if v_amount <= 0 then raise exception 'Montant de cotisation invalide.'; end if;
  v_ref := 'HDX-SP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_due := coalesce(v_t.cycle_deadline, now() + interval '30 days');

  insert into public.diaspora_contribution_requests (
    user_id, tontine_id, reference_code, amount_expected, currency, cycle, due_date,
    status, payer_type, payer_relation, payer_phone, beneficiary_user_id, sponsor_user_id
  ) values (
    v_uid, v_t.id, v_ref, v_amount, coalesce(v_t.currency, 'XAF'), v_cycle, v_due,
    'pending_payment', 'relative', nullif(trim(coalesce(p_relation, 'proche')), ''),
    v_last9, v_ben, v_uid
  ) returning id into v_id;

  insert into public.notifications (user_id, title, body, type, metadata)
  values (
    v_ben,
    'Un proche va payer votre cotisation',
    'Un membre diaspora prépare le paiement de votre cotisation « ' || v_t.name || ' ».',
    'info',
    jsonb_build_object('action_url', '/tontines/' || v_t.id::text)
  );

  return jsonb_build_object(
    'id', v_id,
    'tontine_id', v_t.id,
    'tontine_name', v_t.name,
    'amount_expected', v_amount,
    'currency', coalesce(v_t.currency, 'XAF'),
    'cycle', v_cycle,
    'status', 'pending_payment',
    'reference_code', v_ref,
    'beneficiary_user_id', v_ben,
    'beneficiary_name', v_ben_name,
    'sponsor_user_id', v_uid
  );
end;
$$;

revoke all on function public.create_diaspora_sponsor_request(text, text, text) from public;
grant execute on function public.create_diaspora_sponsor_request(text, text, text) to authenticated;

-- ── 4. Auction: close = pending premium; pay = rotate + redistribute ──
alter table public.tontine_auction_results
  add column if not exists premium_status text not null default 'pending'
    check (premium_status in ('pending', 'paid'));

alter table public.tontine_auction_results
  add column if not exists payment_id uuid references public.payments(id);

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
  v_closed boolean;
begin
  if v_uid is null then raise exception 'Non authentifié.'; end if;
  if not (public.is_tontine_admin(p_tontine_id) or public.is_admin()) then
    raise exception 'Seul l''admin de la tontine peut clôturer.';
  end if;

  select current_cycle, auction_closed into v_cycle, v_closed
  from public.tontines where id = p_tontine_id;
  if v_cycle is null then raise exception 'Tontine introuvable.'; end if;
  if coalesce(v_closed, true) then
    -- allow re-fetch of pending result if already closed this cycle
    if exists (
      select 1 from public.tontine_auction_results
      where tontine_id = p_tontine_id and cycle = v_cycle
    ) then
      raise exception 'Enchères déjà clôturées pour ce cycle.';
    end if;
  end if;

  select user_id, bid_amount into v_winner, v_premium
  from public.tontine_auction_bids
  where tontine_id = p_tontine_id and cycle = v_cycle
  order by bid_amount desc, created_at asc
  limit 1;

  if v_winner is null then raise exception 'Aucune enchère soumise.'; end if;

  select count(*)::int into v_bid_count
  from public.tontine_auction_bids
  where tontine_id = p_tontine_id and cycle = v_cycle;

  v_share := floor(v_premium / greatest(v_bid_count - 1, 1));

  update public.tontines
  set auction_closed = true
  where id = p_tontine_id;

  insert into public.tontine_auction_results (
    tontine_id, cycle, winner_id, premium_paid, share_per_member, premium_status
  ) values (p_tontine_id, v_cycle, v_winner, v_premium, v_share, 'pending')
  on conflict (tontine_id, cycle) do update set
    winner_id = excluded.winner_id,
    premium_paid = excluded.premium_paid,
    share_per_member = excluded.share_per_member,
    premium_status = case
      when public.tontine_auction_results.premium_status = 'paid' then 'paid'
      else 'pending'
    end;

  -- DO NOT rotate yet — wait for premium MoMo payment
  insert into public.notifications (user_id, title, body, type, is_read, metadata)
  values (
    v_winner,
    'Tour anticipé — payez la prime',
    'Vous avez remporté les enchères. Payez la prime de '
      || to_char(v_premium, 'FM999G999G999')
      || ' XAF pour avancer votre tour.',
    'warning',
    false,
    jsonb_build_object(
      'action_url', '/pay?kind=auction_premium&tontine_id=' || p_tontine_id::text
        || '&amount=' || v_premium::text
        || '&label=' || 'Prime tour anticipé',
      'tontine_id', p_tontine_id,
      'premium', v_premium
    )
  );

  return jsonb_build_object(
    'winner_id', v_winner,
    'premium', v_premium,
    'share_per_member', v_share,
    'cycle', v_cycle,
    'premium_status', 'pending',
    'rotated', false
  );
end;
$$;

create or replace function public.fulfill_auction_premium(
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
  v_res public.tontine_auction_results%rowtype;
  v_member record;
  v_share numeric;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found or v_pay.status <> 'succeeded' then
    raise exception 'Paiement non confirmé.';
  end if;

  select * into v_res
  from public.tontine_auction_results
  where tontine_id = p_tontine_id
  order by cycle desc
  limit 1;

  if v_res.id is null then raise exception 'Résultat d''enchère introuvable.'; end if;
  if v_res.premium_status = 'paid' then
    return jsonb_build_object('already_fulfilled', true);
  end if;
  if v_pay.user_id is distinct from v_res.winner_id then
    raise exception 'Seul le gagnant doit payer la prime.';
  end if;
  if v_pay.amount < v_res.premium_paid then
    raise exception 'Montant de prime insuffisant.';
  end if;

  update public.tontine_auction_results
  set premium_status = 'paid', payment_id = p_payment_id
  where id = v_res.id;

  -- Rotate winner to position 1
  update public.tontine_members
  set rotation_position = coalesce(rotation_position, 99) + 1
  where tontine_id = p_tontine_id
    and coalesce(status, '') <> 'exclu'
    and user_id <> v_res.winner_id;

  update public.tontine_members
  set rotation_position = 1
  where tontine_id = p_tontine_id and user_id = v_res.winner_id;

  v_share := coalesce(v_res.share_per_member, 0);
  if v_share > 0 then
    for v_member in
      select user_id from public.tontine_members
      where tontine_id = p_tontine_id
        and coalesce(status, '') <> 'exclu'
        and user_id <> v_res.winner_id
    loop
      insert into public.wallets (user_id) values (v_member.user_id)
      on conflict (user_id) do nothing;
      update public.wallets
      set balance_xaf = coalesce(balance_xaf, 0) + v_share, updated_at = now()
      where user_id = v_member.user_id;
      insert into public.wallet_transactions
        (user_id, type, amount, currency, amount_xaf, reference, status, note)
      values (
        v_member.user_id, 'topup', v_share, 'XAF', v_share,
        'AUC-' || upper(substr(replace(p_payment_id::text, '-', ''), 1, 8)),
        'completed',
        'Part de prime enchère (tour anticipé)'
      );
      insert into public.notifications (user_id, title, body, type, is_read, metadata)
      values (
        v_member.user_id,
        'Part de prime reçue',
        to_char(v_share, 'FM999G999G999') || ' XAF crédités (enchère tour anticipé).',
        'success', false,
        jsonb_build_object('action_url', '/wallet', 'tontine_id', p_tontine_id)
      );
    end loop;
  end if;

  insert into public.notifications (user_id, title, body, type, is_read, metadata)
  values (
    v_res.winner_id,
    'Tour anticipé confirmé',
    'Prime payée — vous êtes en position 1 pour la prochaine cagnotte.',
    'success', false,
    jsonb_build_object('action_url', '/tontines/' || p_tontine_id::text)
  );

  return jsonb_build_object(
    'ok', true,
    'winner_id', v_res.winner_id,
    'share_per_member', v_share,
    'rotated', true
  );
end;
$$;

revoke all on function public.fulfill_auction_premium(uuid, uuid) from public;
grant execute on function public.fulfill_auction_premium(uuid, uuid) to service_role;

-- Bid only while auction open
drop policy if exists "auction_bids_upsert_own" on public.tontine_auction_bids;
create policy "auction_bids_upsert_own" on public.tontine_auction_bids
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_tontine_member(tontine_id)
    and exists (
      select 1 from public.tontines t
      where t.id = tontine_id
        and coalesce(t.auction_closed, true) = false
        and (t.auction_ends_at is null or t.auction_ends_at > now())
    )
  );

drop policy if exists "auction_bids_update_own" on public.tontine_auction_bids;
create policy "auction_bids_update_own" on public.tontine_auction_bids
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.tontines t
      where t.id = tontine_id
        and coalesce(t.auction_closed, true) = false
        and (t.auction_ends_at is null or t.auction_ends_at > now())
    )
  );

-- ── 5. confirm_cinetpay: diaspora_sponsor + auction_premium ──
-- Patch via replace of current function body (keep all prior kinds)
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

-- Harden diaspora protect: allow service_role OR null JWT with table owner (edge)
create or replace function public.protect_diaspora_contribution_updates()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;
  if auth.uid() is null and current_setting('role', true) in ('service_role', 'postgres', 'supabase_admin') then
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

-- ── 6. Expire stale pending_paynote (client-callable) ──────────
create or replace function public.expire_stale_pending_paynote(
  p_older_than_minutes int default 20
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
  v_mins int := greatest(coalesce(p_older_than_minutes, 20), 5);
begin
  if v_uid is null then raise exception 'Non authentifié.'; end if;

  update public.payments
  set status = 'failed',
      description = case
        when description like '%"paynote_failure"%' then description
        else left(description, 1800) || ' · expired_pending'
      end
  where user_id = v_uid
    and status = 'pending_paynote'
    and created_at < now() - make_interval(mins => v_mins);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.expire_stale_pending_paynote(int) from public;
grant execute on function public.expire_stale_pending_paynote(int) to authenticated;

-- ── 7. Association join notif → /manage ─────────────────────────
create or replace function public.request_join_association(p_association_id uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_a public.associations%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  select * into v_a from public.associations where id = p_association_id;
  if v_a.id is null then raise exception 'Association introuvable'; end if;
  if not coalesce(v_a.is_public, false) then
    raise exception 'Cette association est privée — utilisez un code d''invitation';
  end if;
  if exists (select 1 from public.association_members where association_id = p_association_id and user_id = v_uid) then
    raise exception 'Vous êtes déjà membre';
  end if;

  insert into public.association_join_requests (association_id, requester_id, message, status)
  values (p_association_id, v_uid, nullif(trim(coalesce(p_message, '')), ''), 'pending')
  on conflict (association_id, requester_id) do update
    set status = 'pending', message = excluded.message, created_at = now()
  returning id into v_id;

  if v_a.owner_id is not null then
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_a.owner_id,
      'Demande d''adhésion',
      'Quelqu''un souhaite rejoindre « ' || v_a.name || ' ».',
      'association_join_request',
      jsonb_build_object(
        'association_id', p_association_id,
        'request_id', v_id,
        'requester_id', v_uid,
        'action_url', '/manage'
      )
    );
  end if;

  return jsonb_build_object('status', 'pending', 'request_id', v_id);
end;
$$;

revoke all on function public.request_join_association(uuid, text) from public;
grant execute on function public.request_join_association(uuid, text) to authenticated;

-- Repair old association join notifs without action_url
update public.notifications
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('action_url', '/manage')
where type = 'association_join_request'
  and coalesce(metadata->>'action_url', '') = '';
