-- Communauté : profil public, badges, avis, signalements, liste de souhaits
-- partageable, réglages d'affichage.
-- ==========================================================================
--
-- Prérequis : schema.sql, administration.sql, rgpd.sql, securite-profils.sql
-- et profil-photo-parametres.sql déjà exécutés. Ce script peut être relancé
-- sans dommage.

-- --- 1. nouveaux réglages du membre -----------------------------------------
alter table profils add column if not exists pref_vignettes   text    not null default 'normale';
alter table profils add column if not exists pref_contraste   boolean not null default false;
-- Vide tant que le membre n'a rien choisi : la grisaille existait avant,
-- réglée sur l'appareil, et ce choix-là ne doit pas être écrasé.
alter table profils add column if not exists pref_griser      boolean;
-- Le lien de la liste de souhaits : un jeton tiré au hasard par le
-- navigateur. Sans jeton, la liste n'est pas partagée ; en changer révoque
-- l'ancien lien.
alter table profils add column if not exists souhaits_jeton   text;

alter table profils drop constraint if exists pref_vignettes_valeurs;
alter table profils add  constraint pref_vignettes_valeurs
  check (pref_vignettes in ('compacte', 'normale', 'grande'));
alter table profils drop constraint if exists souhaits_jeton_forme;
alter table profils add  constraint souhaits_jeton_forme
  check (souhaits_jeton is null or souhaits_jeton ~ '^[A-Za-z0-9_-]{20,64}$');
create unique index if not exists profils_souhaits_jeton on profils (souhaits_jeton) where souhaits_jeton is not null;

grant update (pref_vignettes, pref_contraste, pref_griser, souhaits_jeton)
  on profils to authenticated;

-- mon_profil(), avec ces réglages. Mêmes colonnes qu'avant, plus les
-- nouvelles : le site lit les champs par leur nom.
drop function if exists mon_profil();
create function mon_profil()
returns table (
  pseudo text, contact text, ne_le date, ville text, code_postal text, departement text,
  latitude double precision, longitude double precision,
  avatar text, photo_url text, photo_en_attente text, photo_statut text, photo_motif text,
  pref_notif_messages boolean, pref_theme text,
  pref_vignettes text, pref_contraste boolean, pref_griser boolean,
  souhaits_jeton text, cree_le timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select p.pseudo, p.contact, p.ne_le, p.ville, p.code_postal, p.departement,
         p.latitude, p.longitude,
         p.avatar, p.photo_url, p.photo_en_attente, p.photo_statut, p.photo_motif,
         p.pref_notif_messages, p.pref_theme,
         p.pref_vignettes, p.pref_contraste, p.pref_griser,
         p.souhaits_jeton, p.cree_le
  from profils p
  where p.id = auth.uid();
$$;
grant execute on function mon_profil() to authenticated;

-- Une première version de ce script préparait des notifications par e-mail,
-- abandonnées depuis. Le relancer retire ce qu'elle avait créé.
drop function if exists emails_a_envoyer();
drop function if exists marquer_email_envoye(uuid, text, integer);
alter table profils drop column if exists pref_notif_email,
                    drop column if exists dernier_email_le,
                    drop column if exists dernier_email_echanges_le,
                    drop column if exists echanges_annonces;

-- --- 2. avis après un échange -------------------------------------------------
-- Un avis par membre et par partenaire, modifiable. Seul celui qui a
-- réellement discuté avec l'autre — un message envoyé de chaque côté — peut
-- en donner un : sans cette règle, n'importe qui pourrait noter n'importe
-- qui.
create table if not exists avis (
  auteur_id       uuid not null references auth.users on delete cascade,
  destinataire_id uuid not null references auth.users on delete cascade,
  note            text not null check (note in ('positif', 'negatif')),
  commentaire     text check (commentaire is null or length(btrim(commentaire)) between 1 and 280),
  cree_le         timestamptz not null default now(),
  maj_le          timestamptz not null default now(),
  primary key (auteur_id, destinataire_id),
  check (auteur_id <> destinataire_id)
);
alter table avis enable row level security;

create or replace function a_discute_avec(autre uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from conversations c
    where auth.uid() in (c.membre_a, c.membre_b) and autre in (c.membre_a, c.membre_b)
      and exists (select 1 from messages m where m.conversation_id = c.id and m.auteur_id = auth.uid())
      and exists (select 1 from messages m where m.conversation_id = c.id and m.auteur_id = autre)
  );
$$;
grant execute on function a_discute_avec(uuid) to authenticated;

drop policy if exists "avis lisibles par les membres" on avis;
create policy "avis lisibles par les membres"
  on avis for select to authenticated using (true);
drop policy if exists "je donne un avis" on avis;
create policy "je donne un avis"
  on avis for insert to authenticated
  with check (auteur_id = auth.uid() and a_discute_avec(destinataire_id));
drop policy if exists "je modifie mon avis" on avis;
create policy "je modifie mon avis"
  on avis for update to authenticated
  using (auteur_id = auth.uid())
  with check (auteur_id = auth.uid() and a_discute_avec(destinataire_id));
drop policy if exists "je retire mon avis" on avis;
create policy "je retire mon avis"
  on avis for delete to authenticated using (auteur_id = auth.uid());
grant select, insert, update, delete on avis to authenticated;

create or replace function avis_maj_le() returns trigger language plpgsql as $$
begin new.maj_le := now(); return new; end; $$;
drop trigger if exists avis_maj_le on avis;
create trigger avis_maj_le before update on avis for each row execute function avis_maj_le();

-- Les avis reçus par un membre, avec qui les a donnés.
drop function if exists avis_recus(uuid);
create function avis_recus(membre uuid)
returns table (auteur_id uuid, pseudo text, avatar text, photo_url text,
               note text, commentaire text, maj_le timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select a.auteur_id, p.pseudo, p.avatar, p.photo_url, a.note, a.commentaire, a.maj_le
  from avis a join profils p on p.id = a.auteur_id
  where auth.uid() is not null and a.destinataire_id = membre
  order by a.maj_le desc
  limit 30;
$$;
grant execute on function avis_recus(uuid) to authenticated;

-- --- 3. signalements : profil, photo, avis -----------------------------------
-- La table existait pour les messages. Elle dit maintenant ce qui est
-- signalé, et l'administrateur peut la lire et la traiter depuis le site.
alter table signalements add column if not exists objet text not null default 'membre';
alter table signalements add column if not exists traite_le timestamptz;
alter table signalements drop constraint if exists signalements_objet_valeurs;
alter table signalements add  constraint signalements_objet_valeurs
  check (objet in ('membre', 'message', 'profil', 'photo', 'pseudo', 'avis', 'sujet', 'reponse'));
-- Le membre écrit son signalement, pas la date de son traitement.
revoke insert on signalements from anon, authenticated;
grant  insert (signaleur_id, signale_id, message_id, motif, objet) on signalements to authenticated;
-- Le « revoke » ci-dessus retire aussi les droits qu'espace-communaute.sql
-- accorde pour signaler un sujet ou une réponse : on les rend.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'signalements' and column_name = 'sujet_id') then
    grant insert (sujet_id, reponse_id) on signalements to authenticated;
  end if;
end;
$$;

-- espace-communaute.sql en installe une version plus complète (les sujets et
-- réponses signalés) : relancer ce script-ci ne doit pas la remplacer.
do $$
begin
  if to_regclass('public.sujets') is null then
    drop function if exists signalements_a_traiter();
    execute $sql$
create function signalements_a_traiter()
returns table (id bigint, objet text, motif text, cree_le timestamptz,
               signaleur text, signale_id uuid, signale text, signale_photo text,
               message_texte text)
language sql
security definer
stable
set search_path = public
as $f$
  -- Le message signalé est montré tel quel : son destinataire l'a déjà lu
  -- et le soumet lui-même à l'administrateur. Le reste de la discussion
  -- ne s'ouvre que par le tiroir des comptes, motif consigné au journal.
  select s.id, s.objet, s.motif, s.cree_le, a.pseudo, s.signale_id, b.pseudo, b.photo_url, m.texte
  from signalements s
  left join profils a on a.id = s.signaleur_id
  left join profils b on b.id = s.signale_id
  left join messages m on m.id = s.message_id
  where est_admin() and s.traite_le is null
  order by s.cree_le desc;
$f$;
$sql$;
    grant execute on function signalements_a_traiter() to authenticated;
  end if;
end;
$$;

drop function if exists traiter_signalement(bigint);
create function traiter_signalement(signalement bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not est_admin() then raise exception 'Réservé à l''administrateur.' using errcode = '42501'; end if;
  update signalements set traite_le = now() where id = signalement;
end;
$$;
grant execute on function traiter_signalement(bigint) to authenticated;

-- Retirer la photo d'un membre après un signalement fondé.
drop function if exists retirer_photo_de(uuid, text);
create function retirer_photo_de(membre uuid, motif text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not est_admin() then raise exception 'Réservé à l''administrateur.' using errcode = '42501'; end if;
  update profils set photo_url = null, photo_en_attente = null, photo_statut = 'refusee',
                     photo_motif = left(coalesce(motif, ''), 300)
   where id = membre;
end;
$$;
grant execute on function retirer_photo_de(uuid, text) to authenticated;

-- --- 4. badges -------------------------------------------------------------------
-- Le nombre de cartes de chaque extension. Sans lui, la base ne saurait pas
-- dire qu'une extension est complète. La construction nocturne le résume
-- dans donnees/totaux-extensions.json, et le navigateur de l'administrateur
-- le recopie ici, au plus une fois par jour (admin-site.js), par
-- enregistrer_totaux() : personne d'autre ne peut l'écrire, sans quoi un
-- membre se déclarerait une extension complète en abaissant son total.
create table if not exists extensions_totaux (
  id     text primary key,
  total  integer not null check (total > 0),
  maj_le timestamptz not null default now()
);
alter table extensions_totaux enable row level security;
drop policy if exists "totaux lisibles" on extensions_totaux;
create policy "totaux lisibles" on extensions_totaux for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on extensions_totaux from anon, authenticated;
grant select on extensions_totaux to anon, authenticated;

drop function if exists enregistrer_totaux(jsonb);
create function enregistrer_totaux(totaux jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changes integer;
begin
  if not est_admin() then
    raise exception 'Réservé à l''administrateur.' using errcode = '42501';
  end if;
  insert into extensions_totaux (id, total, maj_le)
  select key, value::integer, now()
  from jsonb_each_text(totaux)
  where key ~ '^[A-Za-z0-9._-]{1,40}$' and value ~ '^[1-9][0-9]{0,4}$'
  on conflict (id) do update set total = excluded.total, maj_le = now()
    where extensions_totaux.total is distinct from excluded.total;
  get diagnostics changes = row_count;
  return changes;
end;
$$;
grant execute on function enregistrer_totaux(jsonb) to authenticated;

-- Les badges d'un membre, calculés par la base à partir de faits qu'elle
-- tient elle-même : rien ne se déclare, donc rien ne se triche. Seul le
-- badge est renvoyé, jamais la liste des cartes possédées, qui reste
-- privée.
drop function if exists badges_de(uuid);
create function badges_de(membre uuid)
returns table (badge text)
language sql
security definer
stable
set search_path = public
as $$
  with possedees as (
    select carte_id, regexp_replace(carte_id, '-[^-]+$', '') as extension
    from cartes where utilisateur_id = membre and obtenue
  ),
  completes as (
    select t.id from extensions_totaux t
    join possedees p on p.extension = t.id
    group by t.id, t.total
    having count(*) >= t.total
  ),
  faits as (
    select
      (select count(*) from possedees) as nb_cartes,
      (select count(*) from completes) as nb_completes,
      (select count(*) from cartes where utilisateur_id = membre and echangeable) as nb_proposees,
      (select count(*) from avis where destinataire_id = membre and note = 'positif') as positifs,
      (select count(*) from avis where destinataire_id = membre and note = 'negatif') as negatifs,
      (select cree_le from profils where id = membre) as inscrit_le,
      (select count(*) from profils where cree_le < (select cree_le from profils where id = membre)) as rang
  )
  select b from faits, lateral (values
    (case when nb_cartes >= 1    then 'premiere-carte' end),
    (case when nb_cartes >= 100  then 'cent-cartes' end),
    (case when nb_cartes >= 500  then 'cinq-cents-cartes' end),
    (case when nb_cartes >= 1000 then 'mille-cartes' end),
    (case when nb_completes >= 1 then 'extension-complete' end),
    (case when nb_completes >= 5 then 'cinq-extensions' end),
    (case when nb_proposees >= 20 then 'genereux' end),
    (case when positifs >= 1 then 'premier-echange' end),
    (case when positifs >= 5 and positifs >= 4 * negatifs then 'echangeur-de-confiance' end),
    (case when inscrit_le <= now() - interval '1 year' then 'un-an' end),
    (case when rang < 100 then 'pionnier' end)
  ) as v(b)
  where auth.uid() is not null and b is not null;
$$;
grant execute on function badges_de(uuid) to authenticated;

-- --- 5. profil public ---------------------------------------------------------
-- Ce qu'un membre connecté peut voir d'un autre : rien de plus que ce que
-- le site montrait déjà ailleurs (pseudo, image, département), des
-- nombres, et l'ancienneté. Ni la commune, ni la date de naissance, ni la
-- collection possédée.
drop function if exists profil_public(uuid);
create function profil_public(membre uuid)
returns table (id uuid, pseudo text, avatar text, photo_url text, departement text,
               cree_le timestamptz, nb_proposees integer, nb_recherchees integer,
               avis_positifs integer, avis_negatifs integer, bloque boolean)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.pseudo, p.avatar, p.photo_url, p.departement, p.cree_le,
         (select count(*)::int from cartes c where c.utilisateur_id = p.id and c.echangeable),
         (select count(*)::int from cartes c where c.utilisateur_id = p.id and c.recherchee),
         (select count(*)::int from avis a where a.destinataire_id = p.id and a.note = 'positif'),
         (select count(*)::int from avis a where a.destinataire_id = p.id and a.note = 'negatif'),
         est_bloque(auth.uid(), p.id)
  from profils p
  where auth.uid() is not null and p.id = membre;
$$;
grant execute on function profil_public(uuid) to authenticated;

-- --- 6. liste de souhaits partageable -----------------------------------------
-- Lisible sans compte, par quiconque a le lien : c'est le but — l'envoyer
-- sur Discord ou à un ami. Elle ne montre que ce que le membre a choisi de
-- partager (cartes recherchées et échangeables), et rien du tout sans le
-- bon jeton.
-- L'identifiant du membre n'est donné qu'à un visiteur connecté, pour
-- lui proposer d'écrire ou de voir le profil ; un visiteur anonyme n'en a
-- pas l'usage.
drop function if exists liste_souhaits(text);
create function liste_souhaits(jeton text)
returns table (membre uuid, pseudo text, avatar text, photo_url text, carte_id text, genre text)
language sql
security definer
stable
set search_path = public
as $$
  select case when auth.uid() is not null then p.id end, p.pseudo, p.avatar, p.photo_url, c.carte_id,
         case when c.recherchee then 'recherchee' else 'echangeable' end
  from profils p
  join cartes c on c.utilisateur_id = p.id and (c.recherchee or c.echangeable)
  where jeton is not null and length(jeton) >= 20 and p.souhaits_jeton = jeton
  union all
  -- Une liste partagée mais vide renvoie quand même son auteur.
  select case when auth.uid() is not null then p.id end, p.pseudo, p.avatar, p.photo_url, null, null
  from profils p
  where jeton is not null and length(jeton) >= 20 and p.souhaits_jeton = jeton;
$$;
grant execute on function liste_souhaits(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- --- vérification ------------------------------------------------------------
-- En dernier, seule commande affichée par l'éditeur SQL. Attendu :
-- true, true, true, false.
select has_column_privilege('authenticated', 'profils', 'pref_vignettes', 'UPDATE')         as peut_regler_vignettes,
       has_table_privilege('authenticated', 'avis', 'INSERT')                               as peut_donner_un_avis,
       to_regprocedure('emails_a_envoyer()') is null                                        as envoi_emails_retire,
       has_table_privilege('authenticated', 'extensions_totaux', 'INSERT')                  as peut_fausser_les_totaux;
