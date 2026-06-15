-- Sprint 2: normalize profile emails + enforce unique invite codes

update public.profiles
   set email = lower(trim(email))
 where email is not null
   and email <> lower(trim(email));

-- Reassign duplicate invite codes (keep earliest row per code)
do $$
declare
  tbl text;
begin
  foreach tbl in array array['tontines', 'associations', 'cooperatives'] loop
    execute format(
      $sql$
        with ranked as (
          select id,
                 row_number() over (partition by invite_code order by created_at nulls last, id) as rn
            from public.%1$I
        )
        update public.%1$I t
           set invite_code = upper(substr(replace(t.id::text, '-', ''), 1, 6))
          from ranked r
         where t.id = r.id and r.rn > 1
      $sql$,
      tbl
    );
  end loop;
end $$;

create unique index if not exists tontines_invite_code_uidx on public.tontines (invite_code);
create unique index if not exists associations_invite_code_uidx on public.associations (invite_code);
create unique index if not exists cooperatives_invite_code_uidx on public.cooperatives (invite_code);

create index if not exists profiles_email_lower_idx on public.profiles (lower(email));
