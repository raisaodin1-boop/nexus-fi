-- Public verified directory: badge + social-proof member counts + inclusive rename

alter table public.tontines
  add column if not exists is_hodix_verified boolean not null default false;

alter table public.tontines
  add column if not exists display_member_count integer;

comment on column public.tontines.is_hodix_verified is 'Tontine publique créée/validée par HODIX (badge officiel)';
comment on column public.tontines.display_member_count is 'Compteur affiché annuaire (social proof); le réel s''ajoute au-dessus';

-- Retirer de l'annuaire les anciennes tontines ethniques / obsolètes
update public.tontines
set is_public = false, is_active = false
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
);

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
    raise exception 'Aucun profil admin trouvé.';
  end if;

  -- Garder / enrichir Les Perles Corallines
  update public.tontines set
    is_public = true,
    is_active = true,
    status = 'active',
    is_hodix_verified = true,
    display_member_count = 28,
    amount_per_cycle = 5000,
    contribution_amount = 5000,
    frequency = 'weekly',
    max_members = 200,
    country = 'Douala',
    language = 'fr',
    description = 'Un cercle d''épargne élégant et sérieux. Cotisez chaque semaine, suivez vos tours en toute transparence, et construisez votre capital avec une communauté de confiance.'
  where name = 'Tontine Les Perles Corallines';

  -- Garder / enrichir Débutant HODIX
  update public.tontines set
    is_public = true,
    is_active = true,
    status = 'active',
    is_hodix_verified = true,
    display_member_count = 156,
    amount_per_cycle = 1000,
    contribution_amount = 1000,
    frequency = 'weekly',
    max_members = 500,
    country = 'CM',
    language = 'fr',
    description = 'Parfait pour démarrer sur HODIX. Cotisation légère de 1 000 XAF/semaine pour apprendre le rythme, les rappels et les reçus — avant de rejoindre les grandes tontines.'
  where name = 'Tontine Débutant HODIX';

  for v_row in
    select * from (values
      (
        'Tontine Générale Hodix',
        'Tontine nationale ouverte à tous les utilisateurs. La communauté phare HODIX : cotisations suivies, tours clairs, et la confiance d''un cadre officiel.',
        'CM', 'weekly', 5000, 500, 247
      ),
      (
        'Tontine Yaoundé',
        'Pour les utilisateurs de Yaoundé et environs. Épargnez localement avec des membres sérieux, historique transparent et rappels automatiques.',
        'Yaoundé', 'weekly', 5000, 300, 89
      ),
      (
        'Tontine Douala',
        'Pour les utilisateurs de Douala et du Littoral. La référence pour cotiser ensemble dans la capitale économique, en toute sérénité.',
        'Douala', 'weekly', 5000, 300, 132
      ),
      (
        'Tontine Bafoussam',
        'Pour les utilisateurs de Bafoussam et de l''Ouest. Solidarité locale, discipline collective et suivi HODIX à chaque cycle.',
        'Bafoussam', 'weekly', 5000, 200, 54
      ),
      (
        'Tontine Jeunes Entrepreneurs',
        'Destinée aux créateurs d''entreprise et indépendants. Financez votre lancement ou votre stock avec une cotisation accessible et un groupe motivé.',
        'CM', 'monthly', 5000, 200, 61
      ),
      (
        'Tontine Femmes Leaders',
        'Ouverte aux femmes entrepreneures et professionnelles. Ambition, entraide et régularité pour faire grandir vos projets.',
        'CM', 'monthly', 5000, 200, 48
      ),
      (
        'Tontine Business Plus',
        'Pour les commerçants, PME et professionnels qui veulent développer leur activité. Un cadre structuré pour investir ensemble.',
        'CM', 'monthly', 5000, 200, 37
      ),
      (
        'Tontine Épargne Plus',
        'Axée sur l''épargne régulière et les projets personnels. Idéale pour se constituer un capital pas à pas, sans stress.',
        'CM', 'weekly', 5000, 300, 96
      ),
      (
        'Tontine Horizon',
        'Pour les membres qui souhaitent financer des projets à moyen ou long terme. Vision, discipline et résultats concrets.',
        'CM', 'monthly', 5000, 200, 42
      ),
      (
        'Tontine Solidarité',
        'Une tontine communautaire ouverte à tous. Entraide, régularité des cotisations et ambiance bienveillante au cœur du groupe.',
        'CM', 'weekly', 5000, 300, 75
      )
    ) as t(name, description, city, frequency, amount, max_members, display_count)
  loop
    if exists (select 1 from public.tontines where name = v_row.name) then
      update public.tontines set
        is_public = true,
        is_active = true,
        status = 'active',
        is_hodix_verified = true,
        display_member_count = v_row.display_count,
        description = v_row.description,
        country = v_row.city,
        language = 'fr',
        amount_per_cycle = v_row.amount,
        contribution_amount = v_row.amount,
        frequency = v_row.frequency,
        max_members = v_row.max_members,
        owner_id = coalesce(owner_id, v_admin),
        creator_id = coalesce(creator_id, v_admin)
      where name = v_row.name;
      continue;
    end if;

    v_id := gen_random_uuid();
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    v_deadline := now() + (
      case v_row.frequency when 'weekly' then 7 else 30 end || ' days'
    )::interval;

    insert into public.tontines (
      id, owner_id, creator_id, name, description, invite_code,
      contribution_amount, amount_per_cycle, currency, frequency,
      max_members, rotation_mode, current_cycle, is_active, is_public,
      status, country, language, cycle_deadline, auto_advance,
      is_hodix_verified, display_member_count, created_at
    ) values (
      v_id, v_admin, v_admin, v_row.name, v_row.description, v_code,
      v_row.amount, v_row.amount, 'XAF', v_row.frequency,
      v_row.max_members, 'rotation', 1, true, true,
      'active', v_row.city, 'fr', v_deadline, true,
      true, v_row.display_count, now()
    );

    insert into public.tontine_members (
      tontine_id, user_id, role, rotation_position, status, cycles_paid, has_received, is_creator, joined_at
    ) values (
      v_id, v_admin, 'admin', 1, 'a_jour', 0, false, true, now()
    );
  end loop;
end;
$$;
