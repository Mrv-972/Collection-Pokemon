-- Schéma de la base PokéClasseur.
-- À coller dans l'éditeur SQL de Supabase, puis exécuter (bouton "Run").
-- Le script peut être relancé sans risque : il ne détruit rien.

-- ---------------------------------------------------------------- tables --

-- Un profil par membre. Le "contact" est ce que le membre accepte de
-- communiquer à quelqu'un avec qui un échange est possible (pseudo Discord,
-- adresse e-mail...) ; il n'est affiché que dans ce cas.
create table if not exists profils (
  id      uuid primary key references auth.users on delete cascade,
  pseudo  text unique not null,
  contact text,
  cree_le timestamptz not null default now()
);

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

-- ------------------------------------------------- règles d'accès (RLS) --
-- Sans ces règles, n'importe qui pourrait lire et modifier les collections
-- de tout le monde : Supabase expose la base directement au navigateur.

alter table profils enable row level security;
alter table cartes  enable row level security;

drop policy if exists "profils lisibles par les membres" on profils;
create policy "profils lisibles par les membres"
  on profils for select to authenticated using (true);

drop policy if exists "chacun crée son profil" on profils;
create policy "chacun crée son profil"
  on profils for insert to authenticated with check (auth.uid() = id);

drop policy if exists "chacun modifie son profil" on profils;
create policy "chacun modifie son profil"
  on profils for update to authenticated using (auth.uid() = id);

-- Chacun est seul maître de ses propres cartes.
drop policy if exists "chacun gère ses cartes" on cartes;
create policy "chacun gère ses cartes"
  on cartes for all to authenticated
  using (auth.uid() = utilisateur_id)
  with check (auth.uid() = utilisateur_id);

-- ... et voit ce que les autres proposent ou recherchent, sans quoi aucune
-- mise en relation ne serait possible. Le reste d'une collection (ce qu'on
-- possède sans le proposer) reste privé.
drop policy if exists "cartes proposées ou recherchées visibles" on cartes;
create policy "cartes proposées ou recherchées visibles"
  on cartes for select to authenticated
  using (recherchee or echangeable);

-- ------------------------------------------------- mise en relation --
-- Croise ma collection avec celle des autres membres. Le calcul est fait par
-- la base plutôt que par le navigateur : c'est elle qui a toutes les données,
-- et ça évite d'envoyer des milliers d'identifiants de cartes sur le réseau.
create or replace function echanges_possibles()
returns table (
  membre_id    uuid,
  pseudo       text,
  contact      text,
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
    coalesce(d.cartes, '{}'::text[]),
    coalesce(r.cartes, '{}'::text[])
  from profils p
  left join il_me_donne  d on d.utilisateur_id = p.id
  left join je_lui_donne r on r.utilisateur_id = p.id
  where p.id <> auth.uid()
    and (d.cartes is not null or r.cartes is not null);
$$;

-- ------------------------------------------------------- messagerie --
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

alter table conversations enable row level security;
alter table messages      enable row level security;

-- Une conversation, et son contenu, ne regardent que ses deux participants.
drop policy if exists "mes conversations" on conversations;
create policy "mes conversations"
  on conversations for select to authenticated
  using (auth.uid() in (membre_a, membre_b));

drop policy if exists "ouvrir une conversation" on conversations;
create policy "ouvrir une conversation"
  on conversations for insert to authenticated
  with check (auth.uid() in (membre_a, membre_b));

drop policy if exists "lire mes messages" on messages;
create policy "lire mes messages"
  on messages for select to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id and auth.uid() in (c.membre_a, c.membre_b)
  ));

-- On ne peut écrire que sous son propre nom, et que dans une conversation
-- dont on fait partie.
drop policy if exists "écrire dans mes conversations" on messages;
create policy "écrire dans mes conversations"
  on messages for insert to authenticated
  with check (auth.uid() = auteur_id and exists (
    select 1 from conversations c
    where c.id = conversation_id and auth.uid() in (c.membre_a, c.membre_b)
  ));

-- Retrouve la conversation avec un membre, ou l'ouvre si elle n'existe pas.
create or replace function ouvrir_conversation(autre uuid)
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

-- La liste des conversations, avec de quoi dresser un aperçu : qui est en
-- face, et le dernier message échangé.
create or replace function mes_conversations()
returns table (
  conversation_id uuid,
  autre_id        uuid,
  pseudo          text,
  dernier_message text,
  dernier_envoi   timestamptz
)
language sql
stable
as $$
  select
    c.id,
    case when c.membre_a = auth.uid() then c.membre_b else c.membre_a end,
    p.pseudo,
    m.texte,
    m.envoye_le
  from conversations c
  join profils p
    on p.id = case when c.membre_a = auth.uid() then c.membre_b else c.membre_a end
  left join lateral (
    select texte, envoye_le
    from messages
    where conversation_id = c.id
    order by envoye_le desc
    limit 1
  ) m on true
  where auth.uid() in (c.membre_a, c.membre_b)
  order by coalesce(m.envoye_le, c.cree_le) desc;
$$;

-- ------------------------------------------------------------ âge --
-- L'âge est déclaré, jamais vérifié : n'importe qui peut saisir une fausse
-- date. Ce que la règle apporte, c'est un cadre (celui qui ment enfreint les
-- conditions) et un garde-fou contre les inscriptions trop jeunes.
--
-- Le seuil de 15 ans est celui en dessous duquel, en France, le consentement
-- des parents est requis pour traiter les données d'un mineur — un accord
-- qu'un site comme celui-ci ne peut pas recueillir sérieusement.
alter table profils add column if not exists ne_le date;

-- La règle vit dans la base, et pas seulement dans le formulaire : une
-- vérification côté navigateur se contourne en quelques secondes.
-- Elle est portée par les règles d'accès plutôt que par une contrainte de
-- table, car une contrainte ne peut pas consulter la date du jour.
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

-- ------------------------------------------------------- blocages --
create table if not exists blocages (
  bloqueur_id uuid not null references auth.users on delete cascade,
  bloque_id   uuid not null references auth.users on delete cascade,
  cree_le     timestamptz not null default now(),
  primary key (bloqueur_id, bloque_id),
  check (bloqueur_id <> bloque_id)
);

alter table blocages enable row level security;

drop policy if exists "je gère mes blocages" on blocages;
create policy "je gère mes blocages"
  on blocages for all to authenticated
  using (auth.uid() = bloqueur_id)
  with check (auth.uid() = bloqueur_id);

-- Un blocage doit produire ses effets pour les deux personnes, or chacun ne
-- voit que les blocages qu'il a posés. Cette fonction, exécutée avec les
-- droits de son propriétaire, répond seulement « oui » ou « non » : elle ne
-- révèle donc jamais qui a bloqué qui.
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

-- Écrire à quelqu'un suppose qu'aucun blocage ne sépare les deux membres.
drop policy if exists "écrire dans mes conversations" on messages;
create policy "écrire dans mes conversations"
  on messages for insert to authenticated
  with check (auth.uid() = auteur_id and exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth.uid() in (c.membre_a, c.membre_b)
      and not est_bloque(c.membre_a, c.membre_b)
  ));

-- --------------------------------------------------- signalements --
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

alter table signalements enable row level security;

drop policy if exists "je signale" on signalements;
create policy "je signale"
  on signalements for insert to authenticated
  with check (auth.uid() = signaleur_id and signale_id <> auth.uid());

drop policy if exists "je relis mes signalements" on signalements;
create policy "je relis mes signalements"
  on signalements for select to authenticated
  using (auth.uid() = signaleur_id);

-- ------------------- prise en compte des blocages dans l'existant --
-- Un membre bloqué disparaît des correspondances, dans les deux sens.
create or replace function echanges_possibles()
returns table (
  membre_id    uuid,
  pseudo       text,
  contact      text,
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
    coalesce(d.cartes, '{}'::text[]),
    coalesce(r.cartes, '{}'::text[])
  from profils p
  left join il_me_donne  d on d.utilisateur_id = p.id
  left join je_lui_donne r on r.utilisateur_id = p.id
  where p.id <> auth.uid()
    and (d.cartes is not null or r.cartes is not null)
    and not est_bloque(auth.uid(), p.id);
$$;

-- Une conversation avec un membre bloqué n'apparaît plus dans la liste.
create or replace function mes_conversations()
returns table (
  conversation_id uuid,
  autre_id        uuid,
  pseudo          text,
  dernier_message text,
  dernier_envoi   timestamptz
)
language sql
stable
as $$
  select
    c.id,
    case when c.membre_a = auth.uid() then c.membre_b else c.membre_a end,
    p.pseudo,
    m.texte,
    m.envoye_le
  from conversations c
  join profils p
    on p.id = case when c.membre_a = auth.uid() then c.membre_b else c.membre_a end
  left join lateral (
    select texte, envoye_le
    from messages
    where conversation_id = c.id
    order by envoye_le desc
    limit 1
  ) m on true
  where auth.uid() in (c.membre_a, c.membre_b)
    and not est_bloque(c.membre_a, c.membre_b)
  order by coalesce(m.envoye_le, c.cree_le) desc;
$$;

-- ------------------------------------------------- messages non lus --
-- On retient, pour chaque membre et chaque conversation, le dernier message
-- qu'il a vu. Tout ce qui est arrivé après est non lu.
create table if not exists lectures (
  utilisateur_id     uuid not null references auth.users on delete cascade,
  conversation_id    uuid not null references conversations on delete cascade,
  dernier_message_lu bigint not null default 0,
  primary key (utilisateur_id, conversation_id)
);

alter table lectures enable row level security;

drop policy if exists "je gère mes lectures" on lectures;
create policy "je gère mes lectures"
  on lectures for all to authenticated
  using (auth.uid() = utilisateur_id)
  with check (auth.uid() = utilisateur_id);

-- Le nombre total de messages non lus, pour la pastille de la navigation.
create or replace function total_non_lus()
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

-- La liste des conversations porte désormais le compte des non-lus.
create or replace function mes_conversations()
returns table (
  conversation_id uuid,
  autre_id        uuid,
  pseudo          text,
  dernier_message text,
  dernier_envoi   timestamptz,
  non_lus         integer
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
    coalesce(nl.nombre, 0)::integer
  from conversations c
  join profils p
    on p.id = case when c.membre_a = auth.uid() then c.membre_b else c.membre_a end
  left join lateral (
    select texte, envoye_le
    from messages
    where conversation_id = c.id
    order by envoye_le desc
    limit 1
  ) m on true
  left join lectures l
    on l.conversation_id = c.id and l.utilisateur_id = auth.uid()
  left join lateral (
    select count(*) as nombre
    from messages
    where conversation_id = c.id
      and auteur_id <> auth.uid()
      and id > coalesce(l.dernier_message_lu, 0)
  ) nl on true
  where auth.uid() in (c.membre_a, c.membre_b)
    and not est_bloque(c.membre_a, c.membre_b)
  order by coalesce(m.envoye_le, c.cree_le) desc;
$$;
