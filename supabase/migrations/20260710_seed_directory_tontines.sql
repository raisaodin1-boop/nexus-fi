-- Seed 12 public directory tontines (Douala / Yaoundé / Bafoussam)
-- Owner = platform admin (manager)

alter table public.tontines add column if not exists language text;
alter table public.tontines add column if not exists country text;

do $$
declare
  v_admin uuid;
  v_row record;
  v_id uuid;
  v_code text;
  v_deadline timestamptz;
begin
  select id into v_admin
  from public.profiles
  where role in ('admin', 'super_admin')
  order by created_at
  limit 1;

  if v_admin is null then
    raise exception 'Aucun profil admin trouvé pour créer les tontines annuaire.';
  end if;

  -- Avoid duplicating this seed batch
  if exists (
    select 1 from public.tontines
    where name in (
      'Tontine Femmes Akwa',
      'Tontine Les Perles Corallines',
      'Tontine Générale HODIX Yaoundé',
      'Tontine Femmes Bamiléké de Douala',
      'Tontine Générale Bamiléké de Douala',
      'Tontine Générale des Femmes de l''Est',
      'Tontine Générale Sawa de Yaoundé',
      'Tontine Générale Sawa de Douala',
      'Tontine Femmes de Bafoussam',
      'Tontine Générale Bamiléké de Bafoussam',
      'Tontine Générale des Femmes de l''Ouest',
      'Tontine Femmes Banen de Bafoussam'
    )
  ) then
    raise notice 'Seed annuaire déjà présent — aucune insertion.';
    return;
  end if;

  for v_row in
    select * from (values
      ('Tontine Femmes Akwa', 'Tontine de femmes du quartier Akwa à Douala. Cotisations transparentes, tours clairs, suivi HODIX.', 'Douala', 'weekly', 5000, 12, 'fr'),
      ('Tontine Les Perles Corallines', 'Tontine solidaire ouverte aux membres sérieux. Épargne régulière, règles simples, confiance et entraide.', 'Douala', 'weekly', 5000, 15, 'fr'),
      ('Tontine Générale HODIX Yaoundé', 'Tontine générale HODIX à Yaoundé. Cadre officiel, historique clair, reçus et rappels automatiques.', 'Yaoundé', 'monthly', 5000, 12, 'fr'),
      ('Tontine Femmes Bamiléké de Douala', 'Tontine de femmes bamiléké de Douala. Solidarité communautaire, cotisation accessible, discipline collective.', 'Douala', 'monthly', 5000, 10, 'fr'),
      ('Tontine Générale Bamiléké de Douala', 'Tontine générale de la communauté bamiléké à Douala. Ouverte aux nouveaux membres sérieux.', 'Douala', 'weekly', 5000, 12, 'fr'),
      ('Tontine Générale des Femmes de l''Est', 'Tontine générale des femmes de l''Est. Épargne solidaire pour projets familiaux et scolaires.', 'Yaoundé', 'weekly', 5000, 12, 'fr'),
      ('Tontine Générale Sawa de Yaoundé', 'Tontine générale de la communauté sawa à Yaoundé. Transparence des cotisations et tours équitables.', 'Yaoundé', 'weekly', 5000, 12, 'fr'),
      ('Tontine Générale Sawa de Douala', 'Tontine générale sawa de Douala. Entraide communautaire, suivi HODIX, cotisation 5 000 XAF.', 'Douala', 'monthly', 5000, 10, 'fr'),
      ('Tontine Femmes de Bafoussam', 'Tontine de femmes actives de Bafoussam. Épargne régulière, ambiance conviviale, règles claires.', 'Bafoussam', 'monthly', 5000, 15, 'fr'),
      ('Tontine Générale Bamiléké de Bafoussam', 'Tontine générale bamiléké de Bafoussam. Cadre structuré pour l''épargne collective dans l''Ouest.', 'Bafoussam', 'monthly', 5000, 12, 'fr'),
      ('Tontine Générale des Femmes de l''Ouest', 'Tontine générale des femmes de l''Ouest. Solidarité, discipline et transparence des tours.', 'Bafoussam', 'monthly', 5000, 10, 'fr'),
      ('Tontine Femmes Banen de Bafoussam', 'Tontine de femmes Banen et amies à Bafoussam. Ouverte aux membres sérieux de la communauté.', 'Bafoussam', 'weekly', 5000, 14, 'fr')
    ) as t(name, description, city, frequency, amount, max_members, lang)
  loop
    v_id := gen_random_uuid();
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    v_deadline := now() + (
      case v_row.frequency
        when 'weekly' then 7
        else 30
      end || ' days'
    )::interval;

    insert into public.tontines (
      id, owner_id, creator_id, name, description, invite_code,
      contribution_amount, amount_per_cycle, currency, frequency,
      max_members, rotation_mode, current_cycle, is_active, is_public,
      status, country, language, cycle_deadline, auto_advance, created_at
    ) values (
      v_id, v_admin, v_admin, v_row.name, v_row.description, v_code,
      v_row.amount, v_row.amount, 'XAF', v_row.frequency,
      v_row.max_members, 'rotation', 1, true, true,
      'active', v_row.city, v_row.lang, v_deadline, true, now()
    );

    insert into public.tontine_members (
      tontine_id, user_id, role, rotation_position, status, cycles_paid, has_received, is_creator, joined_at
    ) values (
      v_id, v_admin, 'admin', 1, 'a_jour', 0, false, true, now()
    );
  end loop;
end;
$$;
