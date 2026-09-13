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
