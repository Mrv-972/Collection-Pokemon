-- Espace d'administration — À EXÉCUTER SEUL
--
-- Ce fichier ne contient QUE les ajouts liés à l'espace d'administration.
-- Le reste du schéma est déjà en place dans ta base : inutile de le rejouer,
-- et t'en dispenser évite de buter sur la façon dont l'éditeur SQL découpe un
-- long script.
--
-- À coller dans l'éditeur SQL de Supabase, puis exécuter. Relançable sans
-- risque : rien n'est détruit.
--
-- Ensuite, désigne-toi administrateur :
--
--   update profils set est_admin = true where pseudo = 'TonPseudo';
--

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
-- La contrainte « unique » en fin de table dit qu'une seule correction vaut
-- par cible et par genre : ressaisir remplace, plutôt que d'empiler des
-- corrections contradictoires dont on ne saurait plus laquelle s'applique.
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


-- Entre la base et le navigateur, Supabase intercale un service (PostgREST)
-- qui garde en mémoire la liste des tables et des fonctions. Ce signal la lui
-- fait relire tout de suite : sans lui, le site répondrait « Could not find
-- the table » pendant un moment.
notify pgrst, 'reload schema';
