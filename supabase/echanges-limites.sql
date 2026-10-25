
create table if not exists refus_echanges (
  chercheur_id uuid not null references auth.users on delete cascade,
  donneur_id   uuid not null references auth.users on delete cascade,
  carte_id     text not null,
  refuse_par   uuid not null references auth.users on delete cascade,
  refuse_le    timestamptz not null default now(),
  primary key (chercheur_id, donneur_id, carte_id),
  check (chercheur_id <> donneur_id),
  check (refuse_par in (chercheur_id, donneur_id))
);
create index if not exists refus_echanges_donneur on refus_echanges (donneur_id, carte_id);

alter table refus_echanges enable row level security;

drop policy if exists "je relis mes refus" on refus_echanges;
create policy "je relis mes refus"
  on refus_echanges for select to authenticated
  using (refuse_par = auth.uid());

drop policy if exists "je refuse une proposition" on refus_echanges;
create policy "je refuse une proposition"
  on refus_echanges for insert to authenticated
  with check (
    refuse_par = auth.uid()
    and auth.uid() in (chercheur_id, donneur_id)
    and exists (select 1 from cartes c
                where c.utilisateur_id = chercheur_id
                  and c.carte_id = refus_echanges.carte_id
                  and c.recherchee)
    and exists (select 1 from cartes c
                where c.utilisateur_id = donneur_id
                  and c.carte_id = refus_echanges.carte_id
                  and c.echangeable)
  );

drop policy if exists "j'annule mon refus" on refus_echanges;
create policy "j'annule mon refus"
  on refus_echanges for delete to authenticated
  using (refuse_par = auth.uid());

revoke all on refus_echanges from anon, authenticated;
grant select, insert, delete on refus_echanges to authenticated;

create or replace function nettoyer_refus_echanges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or (old.recherchee and not new.recherchee) then
    delete from refus_echanges
    where chercheur_id = old.utilisateur_id and carte_id = old.carte_id;
  end if;
  if tg_op = 'DELETE' or (old.echangeable and not new.echangeable) then
    delete from refus_echanges
    where donneur_id = old.utilisateur_id and carte_id = old.carte_id;
  end if;
  return null;
end;
$$;
revoke all on function nettoyer_refus_echanges() from public;

drop trigger if exists nettoyer_refus_echanges on cartes;
create trigger nettoyer_refus_echanges
  after update or delete on cartes
  for each row execute function nettoyer_refus_echanges();

create or replace function univers_carte(carte text)
returns text
language sql
immutable
as $$
  select case when carte ~ '^([A-Z][0-9]|P-[A-Z]-)' then 'pocket' else 'physique' end;
$$;

drop function if exists propositions_retenues(integer);
create function propositions_retenues(distance_max integer default null)
returns table (chercheur uuid, donneur uuid, carte_id text)
language sql
security definer
stable
set search_path = public
as $$
  with mes_cartes as (
    select c.carte_id, c.recherchee, c.echangeable, univers_carte(c.carte_id) as univers
    from cartes c
    where c.utilisateur_id = auth.uid()
  ),
  en_face as (
    select 'recoit' as sens, o.utilisateur_id as autre, m.carte_id, m.univers
    from mes_cartes m
    join cartes o on o.carte_id = m.carte_id and o.echangeable
    where m.recherchee and o.utilisateur_id <> auth.uid()
    union all
    select 'donne', o.utilisateur_id, m.carte_id, m.univers
    from mes_cartes m
    join cartes o on o.carte_id = m.carte_id and o.recherchee
    where m.echangeable and o.utilisateur_id <> auth.uid()
  ),
  eligibles as (
    select e.sens, e.autre, e.carte_id, e.univers,
           case when e.univers = 'physique'
                 and moi.latitude is not null and moi.longitude is not null
                 and pa.latitude  is not null and pa.longitude  is not null
                then 6371 * 2 * asin(least(1.0, sqrt(
                         power(sin(radians(pa.latitude - moi.latitude) / 2), 2)
                       + cos(radians(moi.latitude)) * cos(radians(pa.latitude))
                         * power(sin(radians(pa.longitude - moi.longitude) / 2), 2))))
           end as distance
    from en_face e
    join profils pa on pa.id = e.autre
    left join profils moi on moi.id = auth.uid()
    where not exists (
            select 1 from refus_echanges f
            where f.carte_id = e.carte_id
              and ((e.sens = 'recoit' and f.chercheur_id = auth.uid() and f.donneur_id = e.autre)
                or (e.sens = 'donne'  and f.chercheur_id = e.autre and f.donneur_id = auth.uid())))
      and not exists (
            select 1 from blocages b
            where (b.bloqueur_id = auth.uid() and b.bloque_id = e.autre)
               or (b.bloqueur_id = e.autre and b.bloque_id = auth.uid()))
  ),
  dans_les_deux_sens as (
    select autre, univers
    from eligibles
    group by autre, univers
    having count(distinct sens) = 2
  ),
  classement as (
    select e.sens, e.autre, e.carte_id,
           row_number() over (
             partition by e.sens, e.carte_id
             order by (d.autre is not null) desc,
                      e.distance asc nulls last,
                      md5(case when e.sens = 'recoit'
                               then auth.uid()::text || e.autre::text
                               else e.autre::text || auth.uid()::text end
                          || e.carte_id)
           ) as rang
    from eligibles e
    left join dans_les_deux_sens d on d.autre = e.autre and d.univers = e.univers
    where distance_max is null
       or e.univers = 'pocket'
       or e.distance <= distance_max
  )
  select case when k.sens = 'recoit' then auth.uid() else k.autre end,
         case when k.sens = 'recoit' then k.autre else auth.uid() end,
         k.carte_id
  from classement k
  where k.rang <= 3;
$$;
revoke all on function propositions_retenues(integer) from public, anon;
grant execute on function propositions_retenues(integer) to authenticated;

drop function if exists echanges_possibles();
drop function if exists echanges_possibles(integer);
create function echanges_possibles(distance_max integer default null)
returns table (
  membre_id    uuid,
  pseudo       text,
  contact      text,
  departement  text,
  distance     integer,
  il_me_donne  text[],
  je_lui_donne text[]
)
language sql
stable
as $$
  with retenues as (
    select * from propositions_retenues(distance_max)
  ),
  il_me_donne as (
    select r.donneur as utilisateur_id, array_agg(r.carte_id order by r.carte_id) as cartes
    from retenues r
    where r.chercheur = auth.uid()
    group by r.donneur
  ),
  je_lui_donne as (
    select r.chercheur as utilisateur_id, array_agg(r.carte_id order by r.carte_id) as cartes
    from retenues r
    where r.donneur = auth.uid()
    group by r.chercheur
  )
  select
    p.id,
    p.pseudo,
    p.contact,
    p.departement,
    distance_km(auth.uid(), p.id),
    coalesce(d.cartes, '{}'::text[]),
    coalesce(r.cartes, '{}'::text[])
  from profils p
  left join il_me_donne  d on d.utilisateur_id = p.id
  left join je_lui_donne r on r.utilisateur_id = p.id
  where p.id <> auth.uid()
    and (d.cartes is not null or r.cartes is not null)
    and not est_bloque(auth.uid(), p.id)
    and (distance_max is null or distance_km(auth.uid(), p.id) <= distance_max);
$$;
grant execute on function echanges_possibles(integer) to authenticated;

notify pgrst, 'reload schema';

select to_regclass('public.refus_echanges') is not null                      as table_des_refus,
       exists (select 1 from pg_trigger
               where tgname = 'nettoyer_refus_echanges' and not tgisinternal)  as menage_automatique,
       has_function_privilege('authenticated', 'propositions_retenues(integer)', 'EXECUTE') as classement_actif;
