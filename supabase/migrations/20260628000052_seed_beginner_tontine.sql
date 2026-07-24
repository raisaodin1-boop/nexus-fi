-- Seed beginner test tontine for newcomers (1000 XAF / week)

do $$
declare
  v_admin uuid;
  v_id uuid := gen_random_uuid();
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
begin
  select id into v_admin
  from public.profiles
  where role in ('admin', 'super_admin')
  order by created_at
  limit 1;

  if v_admin is null then
    raise exception 'Aucun profil admin trouvé pour créer la tontine débutant.';
  end if;

  if exists (select 1 from public.tontines where name = 'Tontine Débutant HODIX') then
    raise notice 'Tontine Débutant HODIX déjà présente — aucune insertion.';
    return;
  end if;

  insert into public.tontines (
    id, owner_id, creator_id, name, description, invite_code,
    contribution_amount, amount_per_cycle, currency, frequency,
    max_members, rotation_mode, current_cycle, is_active, is_public,
    status, country, language, cycle_deadline, auto_advance, created_at
  ) values (
    v_id, v_admin, v_admin,
    'Tontine Débutant HODIX',
    'Tontine test pour les nouveaux arrivants. Cotisation légère de 1 000 XAF par semaine pour apprendre le fonctionnement HODIX avant de rejoindre les grandes tontines.',
    v_code,
    1000, 1000, 'XAF', 'weekly',
    20, 'rotation', 1, true, true,
    'active', 'Douala', 'fr', now() + interval '7 days', true, now()
  );

  insert into public.tontine_members (
    tontine_id, user_id, role, rotation_position, status, cycles_paid, has_received, is_creator, joined_at
  ) values (
    v_id, v_admin, 'admin', 1, 'a_jour', 0, false, true, now()
  );
end;
$$;
