

alter table profils add column if not exists cgu_acceptees_le timestamptz;
alter table profils add column if not exists cgu_version      text;

comment on column profils.cgu_acceptees_le is
  'Date d''acceptation des conditions d''utilisation et de la politique de confidentialité.';
comment on column profils.cgu_version is
  'Version des conditions acceptées, au format AAAA-MM-JJ.';

grant insert (cgu_acceptees_le, cgu_version) on profils to authenticated;
grant update (cgu_acceptees_le, cgu_version) on profils to authenticated;
grant select (cgu_acceptees_le, cgu_version) on profils to authenticated;

create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi uuid := auth.uid();
begin
  if moi is null then
    raise exception 'Aucune session : impossible de supprimer un compte.';
  end if;

  delete from auth.users where id = moi;
end;
$$;

revoke all on function public.supprimer_mon_compte() from public;
grant execute on function public.supprimer_mon_compte() to authenticated;

comment on function public.supprimer_mon_compte() is
  'Supprime le compte de l''appelant et, par cascade, toutes ses données.';

notify pgrst, 'reload schema';
