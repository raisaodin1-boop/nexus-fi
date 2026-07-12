-- Instant dashboard sync: publish membership / join / money tables to Realtime.
-- Safe to re-run (guards on existing publication membership).

do $$ begin
  alter publication supabase_realtime add table public.tontine_members;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.tontine_join_requests;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.tontine_contributions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.association_members;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.association_join_requests;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.cooperative_members;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.fund_members;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.savings_goals;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.savings_transactions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.wallet_transactions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.payments;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.associations;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.diaspora_contribution_requests;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.diaspora_enrollments;
exception when duplicate_object then null;
end $$;

-- Return requester_id so client can invalidate the accepted user's caches
create or replace function public.respond_association_join(p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.association_join_requests%rowtype;
  v_owner uuid;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  select * into v_req from public.association_join_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Demande introuvable'; end if;
  if v_req.status <> 'pending' then raise exception 'Demande déjà traitée'; end if;

  select owner_id into v_owner from public.associations where id = v_req.association_id;
  if v_owner is distinct from v_uid and not public.is_admin() then
    raise exception 'Non autorisé';
  end if;

  update public.association_join_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = v_uid,
      reviewed_at = now()
  where id = p_request_id;

  if p_approve then
    insert into public.association_members (association_id, user_id, role)
    values (v_req.association_id, v_req.requester_id, 'member')
    on conflict do nothing;

    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.requester_id,
      'Demande acceptée',
      'Votre demande d''adhésion a été acceptée.',
      'association_join_approved',
      jsonb_build_object('association_id', v_req.association_id)
    );
  else
    insert into public.notifications (user_id, title, body, type, metadata)
    values (
      v_req.requester_id,
      'Demande refusée',
      'Votre demande d''adhésion a été refusée.',
      'association_join_rejected',
      jsonb_build_object('association_id', v_req.association_id)
    );
  end if;

  return jsonb_build_object(
    'status', case when p_approve then 'approved' else 'rejected' end,
    'requester_id', v_req.requester_id
  );
end;
$$;
