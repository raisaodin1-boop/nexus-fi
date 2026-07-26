-- Purge définitive des tontines ethniques / obsolètes de l'annuaire.
-- Elles avaient seulement été masquées (is_public=false) par 000049,
-- puis 000050/000053 les avaient réintroduites — d'où leur présence
-- encore visible dans la console admin.

create or replace function public._tmp_delete_tontine_cascade(p_id uuid)
returns void
language plpgsql
as $$
begin
  -- Best-effort cleanup across optional related tables
  begin delete from public.tontine_join_requests where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.diaspora_contribution_requests where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.exclusion_votes where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.creator_ratings where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.tontine_disbursements where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.tontine_contributions where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.tontine_escrow where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.escrow_records where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.tontine_consent where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.messages where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.emergency_guarantors where tontine_id = p_id; exception when undefined_table then null; end;
  begin delete from public.tontine_members where tontine_id = p_id; exception when undefined_table then null; end;
  delete from public.tontines where id = p_id;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select id, name
    from public.tontines
    where name in (
      'Tontine Femmes Akwa',
      'Tontine Femmes Bamiléké de Douala',
      'Tontine Générale Bamiléké de Douala',
      'Tontine Générale des Femmes de l''Est',
      'Tontine Générale Sawa de Yaoundé',
      'Tontine Générale Sawa de Douala',
      'Tontine Femmes de Bafoussam',
      'Tontine Générale Bamiléké de Bafoussam',
      'Tontine Générale des Femmes de l''Ouest',
      'Tontine Femmes Banen de Bafoussam',
      'Tontine Générale HODIX Yaoundé',
      'Solidarité Akwa Douala',
      'Njangi Bonanjo Entrepreneurs',
      'Épargne Familiale Deido',
      'Tontine Marché Central Yaoundé',
      'Soeurs Unies Bastos',
      'Njangi Melen Pro',
      'Bafoussam Commerce Vert',
      'Banen & Amis Bafoussam',
      'Étoiles de Dschang-Bafoussam',
      'Douala Portuaire Hebdo',
      'Yaoundé Cadres Mensuel',
      'Bafoussam Femmes Actives',
      'TONTINE GENERAL HODIX CAMEROUN'
    )
    or name ~* '(bamil[eé]k[eé]|sawa|banen)'
  loop
    perform public._tmp_delete_tontine_cascade(r.id);
    raise notice 'Deleted ethnic/obsolete tontine: %', r.name;
  end loop;
end;
$$;

drop function if exists public._tmp_delete_tontine_cascade(uuid);

-- Garantir que l'annuaire public ne contient que les génériques inclusives
update public.tontines
set is_public = true, is_active = true, status = 'active', is_hodix_verified = true
where name in (
  'Tontine Générale Hodix',
  'Tontine Yaoundé',
  'Tontine Douala',
  'Tontine Bafoussam',
  'Tontine Jeunes Entrepreneurs',
  'Tontine Femmes Leaders',
  'Tontine Business Plus',
  'Tontine Épargne Plus',
  'Tontine Horizon',
  'Tontine Solidarité',
  'Tontine Les Perles Corallines',
  'Tontine Débutant HODIX',
  'Tontine Générale Hodix Mensuelle'
);
