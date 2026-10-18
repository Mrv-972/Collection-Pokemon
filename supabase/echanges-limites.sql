-- Échanges : trois propositions au plus par carte recherchée
-- ==========================================================================
--
-- Prérequis : schema.sql déjà exécuté. Ce script peut être relancé sans
-- dommage.
--
-- Sans limite, une carte recherchée par beaucoup de monde et proposée par
-- beaucoup de monde remplissait la page Échanges de dizaines de membres. Pour
-- chaque carte qu'un membre recherche, on ne lui présente plus que trois
-- collectionneurs qui la proposent. S'il en refuse un, le suivant prend sa
-- place. La règle vaut aussi dans l'autre sens : pour chaque carte qu'il
-- propose, un membre ne voit que trois des membres qui la recherchent.
--
-- Une proposition disparaît dès que la carte n'est plus marquée recherchée :
-- la liste est recalculée à chaque visite à partir des marquages du moment.

-- --- 1. les refus -----------------------------------------------------------
-- Une ligne par proposition écartée : tel chercheur, tel donneur, telle carte.
-- Le refus peut venir de l'un comme de l'autre : le chercheur ne veut pas de
-- la carte de ce membre-là, ou le donneur ne veut pas la céder à ce
-- chercheur-là. Dans les deux cas, la proposition sort de la liste des deux.
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

-- Chacun ne relit que ses propres refus, pour pouvoir les annuler. Celui qui
-- a été écarté n'a pas à l'apprendre.
drop policy if exists "je relis mes refus" on refus_echanges;
create policy "je relis mes refus"
  on refus_echanges for select to authenticated
  using (refuse_par = auth.uid());

-- On ne refuse qu'une proposition qui existe : la carte doit être recherchée
-- par l'un et proposée par l'autre au moment du refus. Ces deux lignes de
-- cartes sont lisibles par tout membre connecté (règle « cartes proposées ou
-- recherchées visibles » de schema.sql).
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

-- --- 2. ménage automatique ----------------------------------------------------
-- Quand une carte n'est plus recherchée (ou plus proposée), les refus qui la
-- concernent n'ont plus d'objet : on les efface. Si la carte est de nouveau
-- marquée plus tard, la recherche repart de zéro, avec trois nouvelles
-- propositions.
--
-- La fonction s'exécute avec les droits de son propriétaire : le refus a pu
-- être posé par l'autre membre, et celui qui démarque sa carte n'a pas le
-- droit de l'effacer lui-même.
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

-- --- 3. le classement ------------------------------------------------------------
-- Une carte de Pokémon TCG Pocket a un identifiant qui commence par une
-- majuscule suivie d'un chiffre (A1-001, B2a-014) ou par « P-A- » ; les
-- cartes physiques n'emploient que des minuscules (sv03.5-001). Même règle
-- que lettreSeriePocket() dans sets.js.
create or replace function univers_carte(carte text)
returns text
language sql
immutable
as $$
  select case when carte ~ '^([A-Z][0-9]|P-[A-Z]-)' then 'pocket' else 'physique' end;
$$;

-- Les propositions retenues pour le membre connecté, dans les deux sens :
--   · pour chaque carte qu'il recherche, les trois membres qui la proposent
--     et qu'on lui présente ;
--   · pour chaque carte qu'il propose, les trois membres qui la recherchent.
-- Les membres en face sont classés ainsi :
--   1. d'abord ceux avec qui l'échange peut aller dans les deux sens, dans le
--      même univers (l'autre a aussi quelque chose pour lui, ou cherche aussi
--      quelque chose chez lui) ;
--   2. puis les plus proches, pour les cartes physiques ;
--   3. enfin un ordre tiré au sort une fois pour toutes, propre à chaque
--      carte et à chaque paire de membres : les places se répartissent entre
--      tout le monde au lieu de revenir toujours aux mêmes, et la liste ne
--      bouge pas d'une visite à l'autre.
-- Les propositions refusées et les membres bloqués n'entrent pas au
-- classement : le suivant monte d'un rang. Le filtre de distance s'applique
-- avant le classement : celui qui ne veut que des membres à moins de 30 km
-- reçoit les trois meilleurs dans ce rayon.
--
-- Le calcul part des seules cartes du membre connecté : il reste rapide même
-- quand des milliers de membres recherchent les mêmes cartes.
--
-- La fonction s'exécute avec les droits de son propriétaire, car elle doit
-- tenir compte des refus posés par l'autre membre, que le membre connecté ne
-- peut pas lire. Elle ne renvoie que des lignes où il figure.
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
  -- Les membres en face de chacune de mes cartes : ceux qui proposent une
  -- carte que je recherche (sens « reçoit »), ceux qui recherchent une carte
  -- que je propose (sens « donne »).
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
    -- Seul un membre qui a un profil peut s'afficher : sans lui, il
    -- occuperait une place sans jamais apparaître.
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
  -- Les membres avec qui l'échange va dans les deux sens, univers par univers.
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

-- --- 4. la mise en relation ----------------------------------------------------
-- Mêmes colonnes qu'avant : la page Échanges les lit par leur nom. Seule
-- change l'origine des cartes, qui viennent désormais du classement.
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
    -- Sans filtre, tout le monde reste visible, y compris ceux qui n'ont pas
    -- renseigné de zone. Avec un filtre, une distance inconnue ne peut pas
    -- être déclarée « proche » : ces membres sortent de la liste.
    and (distance_max is null or distance_km(auth.uid(), p.id) <= distance_max);
$$;
grant execute on function echanges_possibles(integer) to authenticated;

notify pgrst, 'reload schema';

-- --- vérification ---------------------------------------------------------
-- En dernier : l'éditeur SQL de Supabase n'affiche que le résultat de la
-- dernière commande. Les trois colonnes doivent répondre « true ».
select to_regclass('public.refus_echanges') is not null                      as table_des_refus,
       exists (select 1 from pg_trigger
               where tgname = 'nettoyer_refus_echanges' and not tgisinternal)  as menage_automatique,
       has_function_privilege('authenticated', 'propositions_retenues(integer)', 'EXECUTE') as classement_actif;
