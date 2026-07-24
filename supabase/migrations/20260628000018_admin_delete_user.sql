-- Suppression complète d'un utilisateur (auth + données liées).
-- Le dashboard Supabase Auth échoue sans cela : ~40 FK sans ON DELETE CASCADE.

create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $$
declare
  v_role text;
  v_tontine_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_id requis';
  end if;

  -- SQL Editor Supabase (pas de JWT) ou service_role ou admin connecté
  if auth.uid() is not null then
    if not public.is_admin() then
      raise exception 'Accès refusé';
    end if;
    if auth.uid() = p_user_id then
      raise exception 'Impossible de supprimer votre propre compte';
    end if;
  end if;

  select role into v_role from public.profiles where id = p_user_id;
  if v_role = 'super_admin' then
    raise exception 'Impossible de supprimer un super_admin';
  end if;

  -- Documents KYC Storage (Supabase bloque DELETE direct → best-effort)
  begin
    delete from storage.objects
    where bucket_id = 'kyc-documents'
      and (storage.foldername(name))[1] = p_user_id::text;
  exception when others then
    null;
  end;

  -- Portefeuille
  delete from public.wallet_transactions
  where user_id = p_user_id or counterpart_id = p_user_id;
  delete from public.wallet_security where user_id = p_user_id;
  delete from public.wallets where user_id = p_user_id;
  delete from public.otp_codes where user_id = p_user_id;

  -- Tontines dont l'utilisateur est propriétaire
  for v_tontine_id in select id from public.tontines where owner_id = p_user_id loop
    delete from public.exclusion_votes where tontine_id = v_tontine_id;
    delete from public.creator_ratings where tontine_id = v_tontine_id;
    delete from public.tontine_disbursements where tontine_id = v_tontine_id;
    delete from public.tontine_contributions where tontine_id = v_tontine_id;
    delete from public.tontine_escrow where tontine_id = v_tontine_id;
    delete from public.escrow_records where tontine_id = v_tontine_id;
    delete from public.tontine_members where tontine_id = v_tontine_id;
    delete from public.tontine_consent where tontine_id = v_tontine_id;
    delete from public.messages where tontine_id = v_tontine_id;
    delete from public.tontines where id = v_tontine_id;
  end loop;

  -- Références profiles (sans CASCADE)
  delete from public.creator_ratings
  where creator_id = p_user_id or rater_id = p_user_id;
  delete from public.exclusion_votes
  where target_user_id = p_user_id or voter_id = p_user_id;
  update public.transactions set recipient_id = null where recipient_id = p_user_id;
  update public.tontines set creator_id = null where creator_id = p_user_id;

  -- Participations tontines
  delete from public.tontine_members where user_id = p_user_id;
  delete from public.tontine_contributions where user_id = p_user_id;
  delete from public.tontine_disbursements
  where beneficiary_id = p_user_id or recorded_by = p_user_id;

  -- Associations
  delete from public.association_contributions
  where association_id in (select id from public.associations where owner_id = p_user_id);
  delete from public.association_members
  where association_id in (select id from public.associations where owner_id = p_user_id);
  delete from public.associations where owner_id = p_user_id;
  delete from public.association_members where user_id = p_user_id;
  delete from public.association_contributions where user_id = p_user_id;

  -- Coopératives
  delete from public.cooperative_contributions
  where cooperative_id in (select id from public.cooperatives where owner_id = p_user_id);
  delete from public.cooperative_members
  where cooperative_id in (select id from public.cooperatives where owner_id = p_user_id);
  delete from public.cooperatives where owner_id = p_user_id;
  delete from public.cooperative_members where user_id = p_user_id;
  delete from public.cooperative_contributions where user_id = p_user_id;

  -- Fonds communautaires
  delete from public.fund_contributions
  where fund_id in (select id from public.community_funds where owner_id = p_user_id);
  delete from public.fund_members
  where fund_id in (select id from public.community_funds where owner_id = p_user_id);
  delete from public.community_funds where owner_id = p_user_id;
  delete from public.fund_members where user_id = p_user_id;
  delete from public.fund_contributions where user_id = p_user_id;

  -- Épargne
  delete from public.savings_transactions
  where user_id = p_user_id
     or goal_id in (select id from public.savings_goals where user_id = p_user_id);
  delete from public.withdrawal_requests where user_id = p_user_id;
  delete from public.savings_goals where user_id = p_user_id;

  -- Identité, KYC, notifications
  delete from public.notifications where user_id = p_user_id;
  delete from public.kyc_submissions where user_id = p_user_id;
  delete from public.identity_events where user_id = p_user_id;
  delete from public.identity_scores where user_id = p_user_id;
  delete from public.identity_certificates where user_id = p_user_id;
  delete from public.loan_applications where user_id = p_user_id;
  delete from public.certificate_purchases where user_id = p_user_id;
  delete from public.payments where user_id = p_user_id;
  delete from public.push_tokens where user_id = p_user_id;
  delete from public.flagged_devices where user_id = p_user_id;
  delete from public.smart_alert_dismissals where user_id = p_user_id;

  -- Messages
  delete from public.messages where sender_id = p_user_id;
  update public.messages set recipient_id = null where recipient_id = p_user_id;

  -- Compte auth (cascade → profiles)
  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'Utilisateur introuvable';
  end if;

  return jsonb_build_object('ok', true, 'deleted_user_id', p_user_id);
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_delete_user(uuid) to service_role;
