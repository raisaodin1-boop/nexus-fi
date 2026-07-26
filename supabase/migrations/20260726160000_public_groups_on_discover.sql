-- Guarantee: non-personal (group) tontines are always public → Découvrir.
-- Existing + future creates.

-- Backfill any group still private
update public.tontines
set is_public = true
where coalesce(is_personal, false) = false
  and coalesce(is_public, false) = false;

-- Enforce on insert/update
create or replace function public.enforce_group_tontine_public()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_personal, false) = false then
    new.is_public := true;
  else
    -- personal = private, never listed on Découvrir
    new.is_public := false;
    new.is_personal := true;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_group_tontine_public_trg on public.tontines;
create trigger enforce_group_tontine_public_trg
  before insert or update of is_public, is_personal
  on public.tontines
  for each row execute function public.enforce_group_tontine_public();
