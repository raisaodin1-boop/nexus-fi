-- Rename seeded directory tontines to clearer, trust-inspiring names

update public.tontines set
  name = 'Tontine Femmes Akwa',
  description = 'Tontine de femmes du quartier Akwa à Douala. Cotisations transparentes, tours clairs, suivi HODIX.'
where name = 'Solidarité Akwa Douala';

update public.tontines set
  name = 'Tontine Les Perles Corallines',
  description = 'Tontine solidaire ouverte aux membres sérieux. Épargne régulière, règles simples, confiance et entraide.'
where name = 'Épargne Familiale Deido';

update public.tontines set
  name = 'Tontine Générale HODIX Yaoundé',
  description = 'Tontine générale HODIX à Yaoundé. Cadre officiel, historique clair, reçus et rappels automatiques.'
where name = 'Yaoundé Cadres Mensuel';

update public.tontines set
  name = 'Tontine Femmes Bamiléké de Douala',
  description = 'Tontine de femmes bamiléké de Douala. Solidarité communautaire, cotisation accessible, discipline collective.'
where name = 'Njangi Bonanjo Entrepreneurs';

update public.tontines set
  name = 'Tontine Générale Bamiléké de Douala',
  description = 'Tontine générale de la communauté bamiléké à Douala. Ouverte aux nouveaux membres sérieux.'
where name = 'Douala Portuaire Hebdo';

update public.tontines set
  name = 'Tontine Générale des Femmes de l''Est',
  description = 'Tontine générale des femmes de l''Est. Épargne solidaire pour projets familiaux et scolaires.'
where name = 'Tontine Marché Central Yaoundé';

update public.tontines set
  name = 'Tontine Générale Sawa de Yaoundé',
  description = 'Tontine générale de la communauté sawa à Yaoundé. Transparence des cotisations et tours équitables.'
where name = 'Njangi Melen Pro';

update public.tontines set
  name = 'Tontine Générale Sawa de Douala',
  country = 'Douala',
  description = 'Tontine générale sawa de Douala. Entraide communautaire, suivi HODIX, cotisation 5 000 XAF.'
where name = 'Soeurs Unies Bastos';

update public.tontines set
  name = 'Tontine Femmes de Bafoussam',
  description = 'Tontine de femmes actives de Bafoussam. Épargne régulière, ambiance conviviale, règles claires.'
where name = 'Bafoussam Femmes Actives';

update public.tontines set
  name = 'Tontine Générale Bamiléké de Bafoussam',
  description = 'Tontine générale bamiléké de Bafoussam. Cadre structuré pour l''épargne collective dans l''Ouest.'
where name = 'Bafoussam Commerce Vert';

update public.tontines set
  name = 'Tontine Générale des Femmes de l''Ouest',
  description = 'Tontine générale des femmes de l''Ouest. Solidarité, discipline et transparence des tours.'
where name = 'Étoiles de Dschang-Bafoussam';

update public.tontines set
  name = 'Tontine Femmes Banen de Bafoussam',
  description = 'Tontine de femmes Banen et amies à Bafoussam. Ouverte aux membres sérieux de la communauté.'
where name = 'Banen & Amis Bafoussam';
