-- HODIX Diaspora enrollment gate — manual verification before diaspora dashboard access

create table if not exists public.diaspora_enrollments (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users(id) on delete cascade,
  status                text not null default 'not_submitted'
    check (status in ('not_submitted', 'pending_review', 'approved', 'rejected', 'needs_info')),
  full_name             text,
  address_line1         text,
  address_line2         text,
  city                  text,
  postal_code           text,
  region                text,
  country_of_residence  text not null default '',
  phone                 text,
  email                 text,
  id_document_type      text check (id_document_type in ('passport', 'foreign_id', 'residence_permit')),
  id_front_path         text,
  id_back_path          text,
  selfie_path           text,
  proof_abroad_path     text,
  declared_abroad       boolean not null default false,
  preferred_currency    text not null default 'EUR',
  rejection_reason      text,
  reviewed_by           uuid references auth.users(id),
  reviewed_at           timestamptz,
  internal_note         text,
  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_diaspora_enrollments_status on public.diaspora_enrollments(status);
create index if not exists idx_diaspora_enrollments_country on public.diaspora_enrollments(country_of_residence);

alter table public.diaspora_enrollments enable row level security;

create policy "diaspora_enrollment_own" on public.diaspora_enrollments
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "diaspora_enrollment_insert_own" on public.diaspora_enrollments
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "diaspora_enrollment_update" on public.diaspora_enrollments
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

alter table public.profiles add column if not exists diaspora_status text;
alter table public.profiles add column if not exists diaspora_country text;
alter table public.profiles add column if not exists diaspora_currency text;

-- Storage for enrollment identity documents
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'diaspora-enrollment',
  'diaspora-enrollment',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

drop policy if exists "diaspora_enrollment_docs_select" on storage.objects;
create policy "diaspora_enrollment_docs_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'diaspora-enrollment'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "diaspora_enrollment_docs_insert" on storage.objects;
create policy "diaspora_enrollment_docs_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'diaspora-enrollment'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "diaspora_enrollment_docs_update" on storage.objects;
create policy "diaspora_enrollment_docs_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'diaspora-enrollment'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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

  return jsonb_build_object(
    'detail', 'Inscription Diaspora approuvée',
    'user_id', v_row.user_id,
    'country', v_row.country_of_residence,
    'currency', v_row.preferred_currency
  );
end $$;

revoke all on function public.approve_diaspora_enrollment(uuid, text) from public, anon;
grant execute on function public.approve_diaspora_enrollment(uuid, text) to authenticated;

grant select, insert, update on public.diaspora_enrollments to authenticated;
