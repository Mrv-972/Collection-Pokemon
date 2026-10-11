-- Communauté : profil public, badges, avis, signalements, liste de souhaits
-- partageable, réglages d'affichage, notifications par e-mail.
-- ==========================================================================
--
-- Prérequis : schema.sql, administration.sql, rgpd.sql, securite-profils.sql
-- et profil-photo-parametres.sql déjà exécutés. Ce script peut être relancé
-- sans dommage.

-- --- 1. nouveaux réglages du membre -----------------------------------------
alter table profils add column if not exists pref_notif_email boolean not null default false;
alter table profils add column if not exists pref_vignettes   text    not null default 'normale';
alter table profils add column if not exists pref_contraste   boolean not null default false;
-- Vide tant que le membre n'a rien choisi : la grisaille existait avant,
-- réglée sur l'appareil, et ce choix-là ne doit pas être écrasé.
alter table profils add column if not exists pref_griser      boolean;
-- Le lien de la liste de souhaits : un jeton tiré au hasard par le
-- navigateur. Sans jeton, la liste n'est pas partagée ; en changer révoque
-- l'ancien lien.
alter table profils add column if not exists souhaits_jeton   text;
-- Ce que l'envoi d'e-mails retient : jamais modifiable par le membre.
alter table profils add column if not exists dernier_email_le          timestamptz;
alter table profils add column if not exists dernier_email_echanges_le timestamptz;
alter table profils add column if not exists echanges_annonces         integer not null default 0;

alter table profils drop constraint if exists pref_vignettes_valeurs;
alter table profils add  constraint pref_vignettes_valeurs
  check (pref_vignettes in ('compacte', 'normale', 'grande'));
alter table profils drop constraint if exists souhaits_jeton_forme;
alter table profils add  constraint souhaits_jeton_forme
  check (souhaits_jeton is null or souhaits_jeton ~ '^[A-Za-z0-9_-]{20,64}$');
create unique index if not exists profils_souhaits_jeton on profils (souhaits_jeton) where souhaits_jeton is not null;

grant update (pref_notif_email, pref_vignettes, pref_contraste, pref_griser, souhaits_jeton)
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
  pref_notif_email boolean, pref_vignettes text, pref_contraste boolean, pref_griser boolean,
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
         p.pref_notif_email, p.pref_vignettes, p.pref_contraste, p.pref_griser,
         p.souhaits_jeton, p.cree_le
  from profils p
  where p.id = auth.uid();
$$;
grant execute on function mon_profil() to authenticated;

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
  check (objet in ('membre', 'message', 'profil', 'photo', 'pseudo', 'avis'));
-- Le membre écrit son signalement, pas la date de son traitement.
revoke insert on signalements from anon, authenticated;
grant  insert (signaleur_id, signale_id, message_id, motif, objet) on signalements to authenticated;

drop function if exists signalements_a_traiter();
create function signalements_a_traiter()
returns table (id bigint, objet text, motif text, cree_le timestamptz,
               signaleur text, signale_id uuid, signale text, signale_photo text,
               message_texte text)
language sql
security definer
stable
set search_path = public
as $$
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
$$;
grant execute on function signalements_a_traiter() to authenticated;

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
-- Le nombre de cartes de chaque extension, tenu à jour chaque nuit par la
-- construction du site (outils/instantane.mjs). Sans lui, la base ne
-- saurait pas dire qu'une extension est complète.
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

-- --- 7. notifications par e-mail ------------------------------------------------
-- Appelées par l'envoi programmé (outils/notifier-par-email.mjs), avec la
-- clé « service_role » : ni un visiteur ni un membre ne peuvent les
-- appeler, puisqu'elles touchent aux adresses e-mail.
--
-- Messages : un e-mail si des messages attendent depuis au moins dix
-- minutes (pas pendant une conversation en cours), qu'ils sont arrivés
-- depuis le dernier e-mail, et au plus un toutes les six heures.
-- Échanges : un récapitulatif hebdomadaire, s'il y a plus de partenaires
-- possibles que la dernière fois.
drop function if exists emails_a_envoyer();
create function emails_a_envoyer()
returns table (membre uuid, email text, pseudo text, non_lus integer,
               partenaires integer, annonces integer, envoyer_messages boolean, envoyer_echanges boolean)
language sql
security definer
stable
set search_path = public
as $$
  with candidats as (
    select p.id, p.pseudo, p.dernier_email_le, p.dernier_email_echanges_le, p.echanges_annonces
    from profils p where p.pref_notif_email
  ),
  attente as (
    select c.id as membre, count(*)::int as non_lus, max(m.envoye_le) as dernier
    from candidats c
    join conversations v on c.id in (v.membre_a, v.membre_b)
    join messages m on m.conversation_id = v.id and m.auteur_id <> c.id
    left join lectures l on l.conversation_id = v.id and l.utilisateur_id = c.id
    where m.id > coalesce(l.dernier_message_lu, 0) and not est_bloque(v.membre_a, v.membre_b)
    group by c.id
  ),
  partenaires as (
    select c.id as membre, count(distinct o.utilisateur_id)::int as nb
    from candidats c
    join cartes moi on moi.utilisateur_id = c.id and (moi.recherchee or moi.echangeable)
    join cartes o on o.carte_id = moi.carte_id and o.utilisateur_id <> c.id
                 and ((moi.recherchee and o.echangeable) or (moi.echangeable and o.recherchee))
    where not est_bloque(c.id, o.utilisateur_id)
    group by c.id
  )
  select c.id, u.email::text, c.pseudo, coalesce(a.non_lus, 0), coalesce(pa.nb, 0), c.echanges_annonces,
         coalesce(a.non_lus, 0) > 0
           and a.dernier <= now() - interval '10 minutes'
           and a.dernier > coalesce(c.dernier_email_le, '-infinity'::timestamptz)
           and coalesce(c.dernier_email_le, '-infinity'::timestamptz) <= now() - interval '6 hours',
         coalesce(pa.nb, 0) > c.echanges_annonces
           and coalesce(c.dernier_email_echanges_le, '-infinity'::timestamptz) <= now() - interval '7 days'
  from candidats c
  join auth.users u on u.id = c.id
  left join attente a on a.membre = c.id
  left join partenaires pa on pa.membre = c.id
  where u.email is not null;
$$;

drop function if exists marquer_email_envoye(uuid, text, integer);
create function marquer_email_envoye(membre uuid, genre text, partenaires integer default null)
returns void
language sql
security definer
set search_path = public
as $$
  update profils set
    dernier_email_le          = case when genre = 'messages' then now() else dernier_email_le end,
    dernier_email_echanges_le = case when genre = 'echanges' then now() else dernier_email_echanges_le end,
    echanges_annonces         = case when genre = 'echanges' then coalesce(partenaires, echanges_annonces) else echanges_annonces end
  where id = membre;
$$;

revoke execute on function emails_a_envoyer() from public, anon, authenticated;
revoke execute on function marquer_email_envoye(uuid, text, integer) from public, anon, authenticated;
grant  execute on function emails_a_envoyer() to service_role;
grant  execute on function marquer_email_envoye(uuid, text, integer) to service_role;

notify pgrst, 'reload schema';

-- --- vérification ------------------------------------------------------------
-- En dernier, seule commande affichée par l'éditeur SQL. Attendu :
-- true, true, false, false, false.
select has_column_privilege('authenticated', 'profils', 'pref_vignettes', 'UPDATE')         as peut_regler_vignettes,
       has_table_privilege('authenticated', 'avis', 'INSERT')                               as peut_donner_un_avis,
       has_column_privilege('authenticated', 'profils', 'dernier_email_le', 'UPDATE')       as peut_fausser_les_emails,
       has_function_privilege('authenticated', 'emails_a_envoyer()', 'EXECUTE')             as peut_lire_les_emails,
       has_table_privilege('authenticated', 'extensions_totaux', 'INSERT')                  as peut_fausser_les_totaux;
