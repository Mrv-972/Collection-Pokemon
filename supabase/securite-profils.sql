
revoke insert, update on profils from anon, authenticated;

grant insert (id, pseudo, contact, ne_le, cgu_acceptees_le, cgu_version)
  on profils to authenticated;

grant update (pseudo, contact, ne_le,
              ville, code_postal, departement, latitude, longitude,
              cgu_acceptees_le, cgu_version)
  on profils to authenticated;

create or replace function proteger_est_admin()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and coalesce(new.est_admin, false) then
      raise exception 'Un compte ne peut pas se déclarer administrateur.'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.est_admin is distinct from old.est_admin then
      raise exception 'Un compte ne peut pas changer son statut d''administrateur.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_est_admin on profils;
create trigger proteger_est_admin
  before insert or update on profils
  for each row execute function proteger_est_admin();

notify pgrst, 'reload schema';

select has_column_privilege('authenticated', 'profils', 'est_admin', 'UPDATE') as peut_modifier_est_admin,
       has_column_privilege('authenticated', 'profils', 'est_admin', 'INSERT') as peut_inserer_est_admin,
       has_column_privilege('authenticated', 'profils', 'ne_le', 'UPDATE')     as peut_modifier_naissance;
