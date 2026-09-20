-- Schéma de la base PokéClasseur.
-- À coller dans l'éditeur SQL de Supabase, puis exécuter (bouton "Run").
-- Le script peut être relancé sans risque : il ne détruit ni les tables ni
-- les données existantes.

-- ==========================================================================
-- Tables
-- ==========================================================================

-- Un profil par membre.
--
-- "contact" est ce que le membre accepte de communiquer à quelqu'un avec qui
-- un échange est possible ; il n'est affiché que dans ce cas.
--
-- "ne_le" sert au seuil d'âge. Cet âge est déclaré, jamais vérifié :
-- n'importe qui peut saisir une fausse date. Ce que la règle apporte, c'est
-- un cadre — celui qui ment enfreint les conditions — et un garde-fou contre
-- les inscriptions trop jeunes. Le seuil de 15 ans est celui en dessous
-- duquel, en France, le consentement des parents serait requis, un accord
-- qu'un site comme celui-ci ne peut pas recueillir sérieusement.
create table if not exists profils (
  id      uuid primary key references auth.users on delete cascade,
  pseudo  text unique not null,
  contact text,
  ne_le   date,
  cree_le timestamptz not null default now()
);
alter table profils add column if not exists ne_le date;

-- Localisation. Deux échangeurs proches peuvent se remettre les cartes en
-- main propre plutôt que de les confier à la poste : savoir qui est à côté
-- de chez soi a donc une vraie valeur.
--
-- Ce qui est enregistré n'est jamais une adresse, mais le centre de la
-- commune choisie — un point identique pour tous les habitants de cette
-- commune. La précision s'arrête donc volontairement là où commencerait le
-- fait de pouvoir retrouver quelqu'un chez lui.
alter table profils add column if not exists ville       text;
alter table profils add column if not exists code_postal text;
alter table profils add column if not exists departement text;
alter table profils add column if not exists latitude    double precision;
alter table profils add column if not exists longitude   double precision;

-- L'état d'une carte pour un membre. Une ligne n'existe que si au moins un
-- des trois marquages a été posé.
create table if not exists cartes (
  utilisateur_id uuid not null references auth.users on delete cascade,
  carte_id       text not null,
  obtenue        boolean not null default false,
  recherchee     boolean not null default false,
  echangeable    boolean not null default false,
  maj_le         timestamptz not null default now(),
  primary key (utilisateur_id, carte_id)
);

-- Accélère la recherche de correspondances, qui part toujours d'une carte.
create index if not exists cartes_recherchees  on cartes (carte_id) where recherchee;
create index if not exists cartes_echangeables on cartes (carte_id) where echangeable;

-- Une conversation relie exactement deux membres. Les identifiants sont
-- rangés dans un ordre fixe (le plus petit d'abord) pour qu'une même paire
-- ne puisse pas ouvrir deux conversations en double.
create table if not exists conversations (
  id       uuid primary key default gen_random_uuid(),
  membre_a uuid not null references auth.users on delete cascade,
  membre_b uuid not null references auth.users on delete cascade,
  cree_le  timestamptz not null default now(),
  unique (membre_a, membre_b),
  check (membre_a < membre_b)
);

create table if not exists messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references conversations on delete cascade,
  auteur_id       uuid not null references auth.users on delete cascade,
  texte           text not null check (length(btrim(texte)) between 1 and 2000),
  envoye_le       timestamptz not null default now()
);

create index if not exists messages_par_conversation on messages (conversation_id, envoye_le);

create table if not exists blocages (
  bloqueur_id uuid not null references auth.users on delete cascade,
  bloque_id   uuid not null references auth.users on delete cascade,
  cree_le     timestamptz not null default now(),
  primary key (bloqueur_id, bloque_id),
  check (bloqueur_id <> bloque_id)
);

-- Les signalements se lisent depuis le tableau de bord Supabase : à cette
-- échelle, une page d'administration serait disproportionnée.
create table if not exists signalements (
  id           bigint generated always as identity primary key,
  signaleur_id uuid not null references auth.users on delete cascade,
  signale_id   uuid not null references auth.users on delete cascade,
  message_id   bigint references messages on delete set null,
  motif        text not null check (length(btrim(motif)) between 1 and 1000),
  cree_le      timestamptz not null default now()
);

-- L'état d'une conversation pour un membre : où il s'est arrêté de lire, et
-- ce qu'il a rangé ou effacé. Une conversation appartient à deux personnes,
-- donc tout ce qui est ici ne vaut que pour l'une d'elles : archiver ou
-- supprimer ne touche jamais la liste de l'autre. Il ne peut pas en aller
-- autrement — sinon n'importe qui pourrait effacer d'un compte les messages
-- qu'il vient d'y envoyer, et le signalement ne servirait plus à rien.
create table if not exists lectures (
  utilisateur_id     uuid not null references auth.users on delete cascade,
  conversation_id    uuid not null references conversations on delete cascade,
  dernier_message_lu bigint not null default 0,
  primary key (utilisateur_id, conversation_id)
);

-- Archivage et suppression marchent pareil : on retient le numéro du dernier
-- message au moment du geste. Tout ce qui arrive après passe outre — une
-- discussion rangée ressort quand on t'écrit à nouveau, plutôt que de faire
-- disparaître un message sans prévenir.
--
--   archivee_apres : null = pas archivée.
--   effacee_jusqua : null = jamais effacée. Sinon les messages jusqu'à ce
--                    numéro ne me sont plus montrés, et la discussion quitte
--                    ma liste tant que rien de plus récent n'arrive.
alter table lectures add column if not exists archivee_apres bigint;
alter table lectures add column if not exists effacee_jusqua bigint;

-- ==========================================================================
-- Règles d'accès
--
-- Supabase expose la base directement au navigateur : sans ces règles,
-- n'importe qui pourrait lire et modifier les données de tout le monde.
-- ==========================================================================

alter table profils       enable row level security;
alter table cartes        enable row level security;
alter table conversations enable row level security;
alter table messages      enable row level security;
alter table blocages      enable row level security;
alter table signalements  enable row level security;
alter table lectures      enable row level security;

-- Un blocage doit produire ses effets pour les deux personnes, or chacun ne
-- voit que les blocages qu'il a posés. Cette fonction, exécutée avec les
-- droits de son propriétaire, répond seulement « oui » ou « non » : elle ne
-- révèle donc jamais qui a bloqué qui. Elle est définie avant les règles qui
-- s'en servent.
create or replace function est_bloque(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from blocages
    where (bloqueur_id = a and bloque_id = b)
       or (bloqueur_id = b and bloque_id = a)
  );
$$;

-- --- profils --------------------------------------------------------------
-- Le seuil d'âge est porté par ces règles plutôt que par une contrainte de
-- table, car une contrainte ne peut pas consulter la date du jour. Le poser
-- ici plutôt que dans le seul formulaire est essentiel : une vérification
-- côté navigateur se contourne en quelques secondes.

drop policy if exists "profils lisibles par les membres" on profils;
create policy "profils lisibles par les membres"
  on profils for select to authenticated using (true);

drop policy if exists "chacun crée son profil" on profils;
create policy "chacun crée son profil"
  on profils for insert to authenticated
  with check (
    auth.uid() = id
    and ne_le is not null
    and ne_le <= current_date - interval '15 years'
  );

drop policy if exists "chacun modifie son profil" on profils;
create policy "chacun modifie son profil"
  on profils for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and ne_le is not null
    and ne_le <= current_date - interval '15 years'
  );

-- Une règle « row level » filtre des lignes, jamais des colonnes : tant que la
-- table entière est lisible, n'importe quel membre peut demander la date de
-- naissance ou les coordonnées de tous les autres. On restreint donc la
-- lecture aux seules colonnes qui ont vocation à être vues : le pseudo, le
-- moyen de contact et le département. La commune, le code postal, la date de
-- naissance et le point géographique ne sortent plus de la base ; chacun
-- relit les siens par la fonction mon_profil(), et la distance entre deux
-- membres est calculée par la base, qui n'en renvoie que le résultat.
revoke select on profils from anon, authenticated;
grant  select (id, pseudo, contact, departement, cree_le) on profils to authenticated;

-- --- cartes ---------------------------------------------------------------

drop policy if exists "chacun gère ses cartes" on cartes;
create policy "chacun gère ses cartes"
  on cartes for all to authenticated
  using (auth.uid() = utilisateur_id)
  with check (auth.uid() = utilisateur_id);

-- Chacun voit ce que les autres proposent ou recherchent, sans quoi aucune
-- mise en relation ne serait possible. Le reste d'une collection (ce qu'on
-- possède sans le proposer) reste privé.
drop policy if exists "cartes proposées ou recherchées visibles" on cartes;
create policy "cartes proposées ou recherchées visibles"
  on cartes for select to authenticated
  using (recherchee or echangeable);

-- --- conversations et messages --------------------------------------------

drop policy if exists "mes conversations" on conversations;
create policy "mes conversations"
  on conversations for select to authenticated
  using (auth.uid() in (membre_a, membre_b));

drop policy if exists "ouvrir une conversation" on conversations;
create policy "ouvrir une conversation"
  on conversations for insert to authenticated
  with check (auth.uid() in (membre_a, membre_b));

-- La limite de suppression est posée ici plutôt que dans l'affichage : un
-- message effacé ne doit pas simplement être caché à l'écran, il ne doit plus
-- sortir de la base. Tout ce qui lit des messages en hérite sans y penser —
-- l'aperçu des conversations, le compte des non-lus, le fil lui-même.
drop policy if exists "lire mes messages" on messages;
create policy "lire mes messages"
  on messages for select to authenticated
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and auth.uid() in (c.membre_a, c.membre_b)
    )
    and messages.id > coalesce((
      select l.effacee_jusqua from lectures l
      where l.conversation_id = messages.conversation_id
        and l.utilisateur_id = auth.uid()
    ), 0)
  );

-- On n'écrit que sous son propre nom, dans une conversation dont on fait
-- partie, et à condition qu'aucun blocage ne sépare les deux membres.
drop policy if exists "écrire dans mes conversations" on messages;
create policy "écrire dans mes conversations"
  on messages for insert to authenticated
  with check (auth.uid() = auteur_id and exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth.uid() in (c.membre_a, c.membre_b)
      and not est_bloque(c.membre_a, c.membre_b)
  ));

-- --- blocages, signalements, lectures -------------------------------------

drop policy if exists "je gère mes blocages" on blocages;
create policy "je gère mes blocages"
  on blocages for all to authenticated
  using (auth.uid() = bloqueur_id)
  with check (auth.uid() = bloqueur_id);

drop policy if exists "je signale" on signalements;
create policy "je signale"
  on signalements for insert to authenticated
  with check (auth.uid() = signaleur_id and signale_id <> auth.uid());

drop policy if exists "je relis mes signalements" on signalements;
create policy "je relis mes signalements"
  on signalements for select to authenticated
  using (auth.uid() = signaleur_id);

drop policy if exists "je gère mes lectures" on lectures;
create policy "je gère mes lectures"
  on lectures for all to authenticated
  using (auth.uid() = utilisateur_id)
  with check (auth.uid() = utilisateur_id);

-- ==========================================================================
-- Fonctions
--
-- Chacune est supprimée avant d'être recréée : PostgreSQL refuse de
-- remplacer une fonction dont les colonnes renvoyées changent, ce qui
-- se produit à chaque fois que le script évolue.
-- ==========================================================================

-- Mon propre profil, colonnes privées comprises. Nécessaire depuis que la
-- lecture directe de la table est limitée aux colonnes publiques.
drop function if exists mon_profil();
create function mon_profil()
returns table (
  pseudo      text,
  contact     text,
  ne_le       date,
  ville       text,
  code_postal text,
  departement text,
  latitude    double precision,
  longitude   double precision
)
language sql
security definer
stable
set search_path = public
as $$
  select p.pseudo, p.contact, p.ne_le, p.ville, p.code_postal,
         p.departement, p.latitude, p.longitude
  from profils p
  where p.id = auth.uid();
$$;

-- Distance à vol d'oiseau entre deux membres, en kilomètres entiers, ou null
-- si l'un des deux n'a pas renseigné sa zone.
--
-- Comme est_bloque(), la fonction s'exécute avec les droits de son
-- propriétaire pour atteindre des colonnes que l'appelant ne peut pas lire,
-- et ne renvoie qu'un nombre : jamais les coordonnées elles-mêmes. Comme ces
-- coordonnées sont celles du centre d'une commune, le plus précis qu'on
-- puisse déduire d'une distance reste la commune — jamais un domicile.
--
-- Le calcul est la formule de haversine : la Terre étant ronde, une simple
-- soustraction de latitudes donnerait un résultat faux.
drop function if exists distance_km(uuid, uuid);
create function distance_km(a uuid, b uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select round(
    6371 * 2 * asin(least(1.0, sqrt(
        power(sin(radians(pb.latitude - pa.latitude) / 2), 2)
      + cos(radians(pa.latitude)) * cos(radians(pb.latitude))
        * power(sin(radians(pb.longitude - pa.longitude) / 2), 2)
    )))
  )::integer
  from profils pa, profils pb
  where pa.id = a
    and pb.id = b
    and pa.latitude is not null and pa.longitude is not null
    and pb.latitude is not null and pb.longitude is not null;
$$;

-- Croise ma collection avec celle des autres membres. Le calcul est fait par
-- la base plutôt que par le navigateur : elle seule a toutes les données, et
-- cela évite d'envoyer des milliers d'identifiants de cartes sur le réseau.
-- Un membre bloqué disparaît des correspondances, dans les deux sens.
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
  with moi as (
    select carte_id, recherchee, echangeable
    from cartes
    where utilisateur_id = auth.uid()
  ),
  il_me_donne as (
    select c.utilisateur_id, array_agg(c.carte_id order by c.carte_id) as cartes
    from cartes c
    join moi on moi.carte_id = c.carte_id
    where c.utilisateur_id <> auth.uid()
      and c.echangeable
      and moi.recherchee
    group by c.utilisateur_id
  ),
  je_lui_donne as (
    select c.utilisateur_id, array_agg(c.carte_id order by c.carte_id) as cartes
    from cartes c
    join moi on moi.carte_id = c.carte_id
    where c.utilisateur_id <> auth.uid()
      and c.recherchee
      and moi.echangeable
    group by c.utilisateur_id
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

-- Retrouve la conversation avec un membre, ou l'ouvre si elle n'existe pas.
drop function if exists ouvrir_conversation(uuid);
create function ouvrir_conversation(autre uuid)
returns uuid
language plpgsql
as $$
declare
  a       uuid := least(auth.uid(), autre);
  b       uuid := greatest(auth.uid(), autre);
  id_conv uuid;
begin
  if auth.uid() is null or autre is null or autre = auth.uid() then
    raise exception 'Conversation impossible';
  end if;
  select id into id_conv from conversations where membre_a = a and membre_b = b;
  if id_conv is null then
    insert into conversations (membre_a, membre_b) values (a, b) returning id into id_conv;
  end if;
  return id_conv;
end;
$$;

-- Les conversations, avec de quoi dresser un aperçu : qui est en face, le
-- dernier message échangé, et ce qui reste à lire. Une conversation avec un
-- membre bloqué n'y figure plus.
drop function if exists mes_conversations();
create function mes_conversations()
returns table (
  conversation_id uuid,
  autre_id        uuid,
  pseudo          text,
  dernier_message text,
  dernier_envoi   timestamptz,
  non_lus         integer,
  archivee        boolean
)
language sql
stable
as $$
  select
    c.id,
    case when c.membre_a = auth.uid() then c.membre_b else c.membre_a end,
    p.pseudo,
    m.texte,
    m.envoye_le,
    coalesce(nl.nombre, 0)::integer,
    -- Archivée tant que rien n'est arrivé depuis le rangement.
    l.archivee_apres is not null and coalesce(m.id, 0) <= l.archivee_apres
  from conversations c
  join profils p
    on p.id = case when c.membre_a = auth.uid() then c.membre_b else c.membre_a end
  left join lectures l
    on l.conversation_id = c.id and l.utilisateur_id = auth.uid()
  -- Les messages effacés sont déjà écartés par la règle de lecture : ces
  -- deux sous-requêtes ne voient donc que ce qui me reste.
  left join lateral (
    select id, texte, envoye_le
    from messages
    where conversation_id = c.id
    -- Sur le numéro et non sur l'heure : deux messages de la même seconde
    -- s'ordonneraient au hasard, et l'aperçu montrerait parfois l'avant-
    -- dernier message.
    order by id desc
    limit 1
  ) m on true
  left join lateral (
    select count(*) as nombre
    from messages
    where conversation_id = c.id
      and auteur_id <> auth.uid()
      and id > coalesce(l.dernier_message_lu, 0)
  ) nl on true
  where auth.uid() in (c.membre_a, c.membre_b)
    and not est_bloque(c.membre_a, c.membre_b)
    -- Une conversation supprimée ne revient que si on m'écrit à nouveau.
    and (l.effacee_jusqua is null or m.id is not null)
  order by coalesce(m.envoye_le, c.cree_le) desc;
$$;

-- Le dernier message d'une conversation dont je fais partie, en tenant
-- compte de ce que j'ai déjà effacé : c'est le repère que posent les deux
-- gestes ci-dessous. Refuse une conversation qui n'est pas la mienne.
drop function if exists borne_conversation(uuid);
create function borne_conversation(conversation uuid)
returns bigint
language plpgsql
as $$
declare
  borne bigint;
begin
  if not exists (
    select 1 from conversations c
    where c.id = conversation and auth.uid() in (c.membre_a, c.membre_b)
  ) then
    raise exception 'Conversation inconnue';
  end if;

  select coalesce(max(m.id), 0) into borne
  from messages m where m.conversation_id = conversation;

  -- Ce que j'ai déjà effacé ne m'est plus visible ci-dessus : sans ce
  -- rattrapage, un second geste ferait reculer la borne et ressusciterait
  -- les messages précédemment effacés.
  return greatest(borne, coalesce((
    select l.effacee_jusqua from lectures l
    where l.conversation_id = conversation and l.utilisateur_id = auth.uid()
  ), 0));
end;
$$;

-- Ranger une conversation, ou la ressortir.
drop function if exists archiver_conversation(uuid, boolean);
create function archiver_conversation(conversation uuid, archiver boolean)
returns void
language plpgsql
as $$
declare
  borne bigint := borne_conversation(conversation);
begin
  insert into lectures (utilisateur_id, conversation_id, archivee_apres)
  values (auth.uid(), conversation, case when archiver then borne else null end)
  on conflict (utilisateur_id, conversation_id)
  do update set archivee_apres = excluded.archivee_apres;
end;
$$;

-- Supprimer une conversation — pour moi seul. Les messages restent chez
-- l'autre membre : personne ne peut effacer ce qu'il a envoyé à quelqu'un.
drop function if exists supprimer_conversation(uuid);
create function supprimer_conversation(conversation uuid)
returns void
language plpgsql
as $$
declare
  borne bigint := borne_conversation(conversation);
begin
  insert into lectures (utilisateur_id, conversation_id, effacee_jusqua, dernier_message_lu, archivee_apres)
  values (auth.uid(), conversation, borne, borne, null)
  on conflict (utilisateur_id, conversation_id)
  do update set
    -- Jamais en arrière : ce qui est effacé le reste.
    effacee_jusqua = greatest(coalesce(lectures.effacee_jusqua, 0), excluded.effacee_jusqua),
    -- Ce qui vient d'être effacé ne doit pas rester compté comme non lu.
    dernier_message_lu = greatest(lectures.dernier_message_lu, excluded.dernier_message_lu),
    archivee_apres = null;
end;
$$;

-- Le nombre total de messages non lus, pour la pastille de la navigation.
drop function if exists total_non_lus();
create function total_non_lus()
returns integer
language sql
stable
as $$
  select coalesce(count(*), 0)::integer
  from messages m
  join conversations c on c.id = m.conversation_id
  left join lectures l
    on l.conversation_id = c.id and l.utilisateur_id = auth.uid()
  where auth.uid() in (c.membre_a, c.membre_b)
    and m.auteur_id <> auth.uid()
    and m.id > coalesce(l.dernier_message_lu, 0)
    and not est_bloque(c.membre_a, c.membre_b);
$$;

-- ==========================================================================
-- Espace d'administration
--
-- Le catalogue vient de sources extérieures, puis d'un instantané figé dans
-- le dépôt. Quand une source se trompe — nom mal traduit, rareté fausse,
-- carte absente, visuel anglais — il faut pouvoir corriger sans attendre la
-- prochaine construction.
--
-- Une correction saisie ici prend effet immédiatement sur le site, puis la
-- construction nocturne l'absorbe dans les fichiers du dépôt. Elle devient
-- alors redondante et peut être supprimée : c'est le dépôt qui fait foi à
-- long terme, pas cette table.
-- ==========================================================================

-- Qui est administrateur. Ce drapeau ne se coche PAS depuis le site : il se
-- pose à la main dans l'éditeur SQL de Supabase. Un compte ne peut donc pas
-- se promouvoir lui-même, même en trafiquant ce que son navigateur envoie.
--
--   update profils set est_admin = true where pseudo = 'TonPseudo';
--
alter table profils add column if not exists est_admin boolean not null default false;

-- Cette colonne n'est PAS ajoutée à la liste des colonnes lisibles accordée
-- plus haut (« grant select (id, pseudo, …) on profils »). Personne ne peut
-- donc lire qui est administrateur, pas même l'intéressé : la page
-- d'administration passe par la fonction ci-dessous, qui ne répond que pour
-- le compte qui la pose. Une colonne ajoutée après un grant n'en hérite pas,
-- c'est ce qui rend l'omission efficace plutôt que décorative.

-- La fonction est appelée par les règles d'accès ci-dessous. Elle est
-- « security definer » parce qu'elle doit lire profils sans être soumise
-- elle-même aux règles de lecture de profils — sinon la règle s'appellerait
-- elle-même sans fin.
create or replace function est_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.est_admin from profils p where p.id = auth.uid()), false);
$$;

-- Une correction porte sur une carte, une extension, ou le seul visuel d'une
-- carte. « cible » est l'identifiant visé : « B3-001 » pour une carte,
-- « B5 » pour une extension.
--
-- Le contenu vit dans « donnees », en JSON, plutôt que dans des colonnes
-- fixes : les champs corrigibles diffèrent d'un genre à l'autre, et ils
-- changeront. Une colonne par champ imposerait de modifier la base à chaque
-- évolution du formulaire.
create table if not exists corrections (
  id           bigserial primary key,
  univers      text not null default 'pocket' check (univers in ('pocket', 'physique')),
  genre        text not null check (genre in ('visuel', 'carte', 'extension')),
  cible        text not null,
  donnees      jsonb not null default '{}'::jsonb,
  image_chemin text,
  cree_le      timestamptz not null default now(),
  cree_par     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Une seule correction en vigueur par cible et par genre : ressaisir
  -- remplace, plutôt que d'empiler des corrections contradictoires dont on
  -- ne saurait plus laquelle s'applique.
  unique (univers, genre, cible)
);

alter table corrections enable row level security;

-- Lecture ouverte à tous, y compris aux visiteurs non connectés. Ce sont des
-- données de catalogue — un nom de carte, une rareté, un visuel — déjà
-- publiques par nature. La construction nocturne les lit aussi, sans compte.
drop policy if exists "corrections lisibles par tous" on corrections;
create policy "corrections lisibles par tous"
  on corrections for select to anon, authenticated using (true);

-- Écriture réservée à l'administrateur. C'est ICI que se joue le « moi seul » :
-- pas dans le fait que la page soit difficile à trouver. Un site statique
-- livre tout son code au navigateur, donc l'adresse de la page
-- d'administration est connue de quiconque la cherche ; ce qui protège, c'est
-- que la base refuse l'écriture à tout autre compte.
drop policy if exists "seul l'administrateur ajoute une correction" on corrections;
create policy "seul l'administrateur ajoute une correction"
  on corrections for insert to authenticated with check (est_admin());

drop policy if exists "seul l'administrateur modifie une correction" on corrections;
create policy "seul l'administrateur modifie une correction"
  on corrections for update to authenticated using (est_admin()) with check (est_admin());

drop policy if exists "seul l'administrateur supprime une correction" on corrections;
create policy "seul l'administrateur supprime une correction"
  on corrections for delete to authenticated using (est_admin());

-- Les visuels téléversés depuis l'espace d'administration. Le contenant est
-- public en lecture : le site doit pouvoir afficher l'image aussitôt, et la
-- construction nocturne la télécharger sans compte.
insert into storage.buckets (id, name, public)
values ('corrections', 'corrections', true)
on conflict (id) do nothing;

drop policy if exists "visuels de correction lisibles par tous" on storage.objects;
create policy "visuels de correction lisibles par tous"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'corrections');

drop policy if exists "seul l'administrateur dépose un visuel" on storage.objects;
create policy "seul l'administrateur dépose un visuel"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'corrections' and est_admin());

drop policy if exists "seul l'administrateur remplace un visuel" on storage.objects;
create policy "seul l'administrateur remplace un visuel"
  on storage.objects for update to authenticated
  using (bucket_id = 'corrections' and est_admin())
  with check (bucket_id = 'corrections' and est_admin());

drop policy if exists "seul l'administrateur retire un visuel" on storage.objects;
create policy "seul l'administrateur retire un visuel"
  on storage.objects for delete to authenticated
  using (bucket_id = 'corrections' and est_admin());

-- ==========================================================================
-- Rafraîchissement de la couche d'accès
--
-- Entre la base et le navigateur, Supabase intercale un service (PostgREST)
-- qui garde en mémoire la liste des tables et des fonctions. Tant qu'il ne
-- l'a pas relue, une fonction toute neuve lui reste inconnue et le site
-- répond « Could not find the function ». Ce signal la lui fait relire tout
-- de suite, plutôt que d'attendre ou de redémarrer le projet.
-- ==========================================================================

notify pgrst, 'reload schema';
