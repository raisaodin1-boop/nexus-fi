-- When Diaspora is approved: clear member enrollment/pre-access notices + admin alerts.
create or replace function public.approve_diaspora_enrollment(
  p_enrollment_id uuid,
  p_internal_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.diaspora_enrollments;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  select * into v_row from public.diaspora_enrollments where id = p_enrollment_id;
  if not found then raise exception 'Dossier introuvable.'; end if;
  if v_row.status = 'approved' then raise exception 'Déjà approuvé.'; end if;
  if lower(trim(v_row.country_of_residence)) in ('cameroun', 'cameroon', 'cm') then
    raise exception 'Pays de résidence incompatible avec le mode Diaspora.';
  end if;

  update public.diaspora_enrollments set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    internal_note = coalesce(p_internal_note, internal_note),
    updated_at = now()
  where id = p_enrollment_id;

  update public.profiles set
    diaspora_status = 'approved',
    diaspora_country = v_row.country_of_residence,
    diaspora_currency = v_row.preferred_currency,
    country = coalesce(nullif(trim(v_row.country_of_residence), ''), country)
  where id = v_row.user_id;

  -- Drop pre-access enrollment notices for this member (no longer relevant).
  delete from public.notifications
  where user_id = v_row.user_id
    and (
      title in (
        'Dossier Diaspora reçu',
        'Inscription Diaspora non validée',
        'Informations complémentaires requises'
      )
      or coalesce(metadata->>'action_url', '') in ('/diaspora', '/diaspora/enroll')
      or coalesce(metadata->>'action_url', '') like '%/diaspora/enroll%'
    );

  insert into public.notifications (user_id, title, body, type, is_read, metadata)
  values (
    v_row.user_id,
    'Mode Diaspora activé',
    format(
      'Votre inscription Diaspora est validée. Bienvenue depuis %s !',
      coalesce(nullif(trim(v_row.country_of_residence), ''), 'l''étranger')
    ),
    'success',
    false,
    jsonb_build_object('action_url', '/(tabs)', 'enrollment_id', p_enrollment_id)
  );

  -- Clear admin inbox alerts about this pending enrollment.
  update public.notifications
  set is_read = true
  where is_read = false
    and title = 'Nouvelle inscription Diaspora'
    and (
      body ilike ('%' || coalesce(v_row.full_name, '') || '%')
      or metadata->>'enrollment_id' = p_enrollment_id::text
    );

  return jsonb_build_object(
    'detail', 'Inscription Diaspora approuvée',
    'user_id', v_row.user_id,
    'country', v_row.country_of_residence,
    'currency', v_row.preferred_currency
  );
end $$;

revoke all on function public.approve_diaspora_enrollment(uuid, text) from public, anon;
grant execute on function public.approve_diaspora_enrollment(uuid, text) to authenticated;

-- Cleanup for members already approved who still see enrollment notices.
delete from public.notifications n
using public.profiles p
where n.user_id = p.id
  and p.diaspora_status = 'approved'
  and (
    n.title in (
      'Dossier Diaspora reçu',
      'Inscription Diaspora non validée',
      'Informations complémentaires requises'
    )
    or coalesce(n.metadata->>'action_url', '') in ('/diaspora', '/diaspora/enroll')
    or coalesce(n.metadata->>'action_url', '') like '%/diaspora/enroll%'
  );
