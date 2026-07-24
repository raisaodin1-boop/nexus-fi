-- Align public verified tontine amounts & frequencies

-- Générale Hodix : 2000 hebdo (choix client → variante mensuelle ci-dessous)
update public.tontines set
  amount_per_cycle = 2000,
  contribution_amount = 2000,
  frequency = 'weekly',
  description = 'Tontine nationale ouverte à tous. Cotisation 2 000 FCFA/semaine — cadre officiel HODIX, tours clairs, confiance maximale.'
where name = 'Tontine Générale Hodix';

-- Variante mensuelle de la Générale (choix client)
do $$
declare
  v_admin uuid;
  v_id uuid;
  v_code text;
begin
  if exists (select 1 from public.tontines where name = 'Tontine Générale Hodix Mensuelle') then
    update public.tontines set
      is_public = true, is_active = true, status = 'active',
      is_hodix_verified = true,
      amount_per_cycle = 2000, contribution_amount = 2000,
      frequency = 'monthly', max_members = 500,
      display_member_count = coalesce(display_member_count, 118),
      country = 'CM', language = 'fr',
      description = 'Même communauté nationale HODIX, rythme mensuel. Cotisation 2 000 FCFA/mois — idéal si vous préférez cotiser une fois par mois.'
    where name = 'Tontine Générale Hodix Mensuelle';
    return;
  end if;

  select id into v_admin from public.profiles
  where role in ('admin', 'super_admin') order by created_at limit 1;
  if v_admin is null then raise exception 'Aucun admin'; end if;

  v_id := gen_random_uuid();
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.tontines (
    id, owner_id, creator_id, name, description, invite_code,
    contribution_amount, amount_per_cycle, currency, frequency,
    max_members, rotation_mode, current_cycle, is_active, is_public,
    status, country, language, cycle_deadline, auto_advance,
    is_hodix_verified, display_member_count, created_at
  ) values (
    v_id, v_admin, v_admin,
    'Tontine Générale Hodix Mensuelle',
    'Même communauté nationale HODIX, rythme mensuel. Cotisation 2 000 FCFA/mois — idéal si vous préférez cotiser une fois par mois.',
    v_code, 2000, 2000, 'XAF', 'monthly',
    500, 'rotation', 1, true, true,
    'active', 'CM', 'fr', now() + interval '30 days', true,
    true, 118, now()
  );

  insert into public.tontine_members (
    tontine_id, user_id, role, rotation_position, status, cycles_paid, has_received, is_creator, joined_at
  ) values (v_id, v_admin, 'admin', 1, 'a_jour', 0, false, true, now());
end;
$$;

update public.tontines set
  amount_per_cycle = 2000, contribution_amount = 2000, frequency = 'weekly',
  description = 'Pour Yaoundé et environs. Cotisation accessible de 2 000 FCFA/semaine, suivi transparent et rappels automatiques.'
where name = 'Tontine Yaoundé';

update public.tontines set
  amount_per_cycle = 2000, contribution_amount = 2000, frequency = 'weekly',
  description = 'Pour Douala et le Littoral. Cotisez 2 000 FCFA/semaine avec une communauté locale sérieuse et un cadre HODIX.'
where name = 'Tontine Douala';

update public.tontines set
  amount_per_cycle = 2000, contribution_amount = 2000, frequency = 'weekly',
  description = 'Pour Bafoussam et l''Ouest. 2 000 FCFA/semaine, solidarité locale et discipline collective.'
where name = 'Tontine Bafoussam';

update public.tontines set
  amount_per_cycle = 5000, contribution_amount = 5000, frequency = 'weekly',
  description = 'Pour créateurs d''entreprise et indépendants. 5 000 FCFA/semaine pour financer stock, lancement ou croissance.'
where name = 'Tontine Jeunes Entrepreneurs';

update public.tontines set
  amount_per_cycle = 2500, contribution_amount = 2500, frequency = 'weekly',
  description = 'Ouverte aux femmes entrepreneures et professionnelles. 2 500 FCFA/semaine — ambition, entraide et régularité.'
where name = 'Tontine Femmes Leaders';

update public.tontines set
  amount_per_cycle = 5000, contribution_amount = 5000, frequency = 'monthly',
  description = 'Pour commerçants, PME et professionnels. 5 000 FCFA/mois pour développer votre activité dans un cadre structuré.'
where name = 'Tontine Business Plus';

update public.tontines set
  amount_per_cycle = 1000, contribution_amount = 1000, frequency = 'weekly',
  description = 'Épargne régulière et projets personnels. Seulement 1 000 FCFA/semaine pour se constituer un capital pas à pas.'
where name = 'Tontine Épargne Plus';

update public.tontines set
  amount_per_cycle = 10000, contribution_amount = 10000, frequency = 'monthly',
  description = 'Projets à moyen ou long terme. 10 000 FCFA/mois — vision, discipline et résultats concrets.'
where name = 'Tontine Horizon';

update public.tontines set
  amount_per_cycle = 1000, contribution_amount = 1000, frequency = 'weekly',
  description = 'Communautaire, ouverte à tous. 1 000 FCFA/semaine — entraide et régularité au cœur du groupe.'
where name = 'Tontine Solidarité';
