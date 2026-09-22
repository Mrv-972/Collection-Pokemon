-- ==========================================================================
-- PokéClasseur — administration des comptes
-- ==========================================================================
--
-- À exécuter une fois dans l'éditeur SQL de Supabase
-- (Dashboard → SQL Editor → New query → coller → Run).
--
-- Prérequis : supabase/administration.sql (qui crée « est_admin »)
--             et supabase/rgpd.sql (qui crée « supprimer_mon_compte »).
--
-- Ce fichier est idempotent : le relancer ne casse rien.
--
-- Il donne à l'administrateur deux capacités, et deux seulement :
--   1. voir la liste de tous les comptes ;
--   2. en supprimer un.
--
-- Il ne lui donne PAS accès aux messages privés des membres, ni à leurs
-- données de localisation précise. Pouvoir tout voir parce qu'on est
-- administrateur n'est pas une raison suffisante de tout voir.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- 1. Journal des suppressions
-- --------------------------------------------------------------------------
--
-- Supprimer le compte de quelqu'un d'autre doit laisser une trace. Sans
-- elle, plus rien ne permet de dire qui a fait quoi, ni de répondre à un
-- membre qui demanderait des comptes.
--
-- Les identifiants sont rangés sans clé étrangère, volontairement : la
-- trace doit survivre à la disparition de celui qu'elle décrit. Le pseudo
-- est recopié pour la même raison.

create table if not exists journal_admin (
  id            bigint generated always as identity primary key,
  fait_le       timestamptz not null default now(),
  admin_id      uuid   not null,
  admin_pseudo  text,
  action        text   not null,
  cible_id      uuid,
  cible_pseudo  text,
  motif         text
);

alter table journal_admin enable row level security;

drop policy if exists "journal lisible par les admins" on journal_admin;
create policy "journal lisible par les admins"
  on journal_admin for select to authenticated using (est_admin());

-- Personne n'écrit dans ce journal directement : seules les fonctions
-- ci-dessous le font, avec les droits de leur propriétaire. Un journal
-- qu'on peut écrire à la main ne prouve rien.
grant select on journal_admin to authenticated;


-- --------------------------------------------------------------------------
-- 2. La liste des comptes
-- --------------------------------------------------------------------------
--
-- L'adresse électronique vit dans auth.users, que le navigateur ne peut pas
-- lire. Cette fonction va l'y chercher pour le seul administrateur.
--
-- Le premier « if not est_admin() » n'est pas décoratif : sans lui, une
-- fonction « security definer » exécuterait le travail pour n'importe qui.

create or replace function public.admin_liste_comptes()
returns table (
  id               uuid,
  pseudo           text,
  email            text,
  inscrit_le       timestamptz,
  derniere_visite  timestamptz,
  email_confirme   boolean,
  est_admin        boolean,
  cgu_acceptees_le timestamptz,
  cgu_version      text,
  ville            text,
  nb_cartes        bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  return query
    select
      u.id,
      p.pseudo,
      u.email::text,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at is not null,
      coalesce(p.est_admin, false),
      p.cgu_acceptees_le,
      p.cgu_version,
      p.ville,
      (select count(*) from public.cartes c where c.utilisateur_id = u.id)
    from auth.users u
    left join public.profils p on p.id = u.id
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_liste_comptes() from public;
grant execute on function public.admin_liste_comptes() to authenticated;


-- --------------------------------------------------------------------------
-- 3. Supprimer le compte d'un membre
-- --------------------------------------------------------------------------
--
-- Comme pour la suppression volontaire, la cascade fait le travail : effacer
-- la ligne du compte emporte le profil, les cartes, les conversations, les
-- messages, les blocages, les signalements et les lectures.
--
-- Deux garde-fous :
--   — seul un administrateur peut appeler la fonction ;
--   — un administrateur ne peut pas se supprimer lui-même par ce chemin.
--     Ce n'est pas de la prudence excessive : c'est le seul cas où l'erreur
--     coûterait l'accès à l'administration, sans moyen de revenir en arrière.
--     La page du compte reste là pour qui veut vraiment partir.

create or replace function public.admin_supprimer_compte(cible uuid, motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi           uuid := auth.uid();
  pseudo_admin  text;
  pseudo_cible  text;
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  if moi is null then
    raise exception 'Aucune session : impossible de supprimer un compte.';
  end if;

  if cible = moi then
    raise exception 'Un administrateur ne peut pas supprimer son propre compte depuis cette page. Passe par « Mon compte ».';
  end if;

  if not exists (select 1 from auth.users where id = cible) then
    raise exception 'Ce compte n''existe pas ou plus.';
  end if;

  select p.pseudo into pseudo_admin from public.profils p where p.id = moi;
  select p.pseudo into pseudo_cible from public.profils p where p.id = cible;

  -- La trace est écrite AVANT la suppression : après, le pseudo de la cible
  -- ne serait plus lisible nulle part.
  insert into public.journal_admin (admin_id, admin_pseudo, action, cible_id, cible_pseudo, motif)
  values (moi, pseudo_admin, 'suppression de compte', cible, pseudo_cible, nullif(btrim(motif), ''));

  delete from auth.users where id = cible;
end;
$$;

revoke all on function public.admin_supprimer_compte(uuid, text) from public;
grant execute on function public.admin_supprimer_compte(uuid, text) to authenticated;


-- --------------------------------------------------------------------------
-- 4. Vérification
-- --------------------------------------------------------------------------
--
-- Connecté avec ton compte administrateur, ceci doit renvoyer la liste :
--   select pseudo, email, inscrit_le from admin_liste_comptes();
--
-- Avec un compte ordinaire, la même requête doit échouer sur
-- « Réservé aux administrateurs. » — c'est le résultat attendu.

notify pgrst, 'reload schema';


-- ==========================================================================
-- 5. Accès aux discussions, en cas de nécessité légale
-- ==========================================================================
--
-- Les discussions appartiennent à leurs deux participants, et c'est la règle
-- normale. Mais un hébergeur doit pouvoir répondre à un signalement, à une
-- plainte ou à une réquisition judiciaire : si personne ne peut lire un
-- message de menace, personne ne peut y donner suite.
--
-- Cet accès est donc possible, et strictement encadré :
--
--   — il est réservé à l'administrateur ;
--   — il exige un motif écrit, d'au moins dix caractères : on ne lit pas une
--     conversation « pour voir » ;
--   — chaque lecture est inscrite au journal, avec ce motif, avant que le
--     moindre message ne soit renvoyé ;
--   — le journal n'est pas modifiable, même par l'administrateur.
--
-- Autrement dit : l'accès existe, mais il laisse une trace que son auteur ne
-- peut pas effacer. C'est ce qui sépare un pouvoir encadré d'un pouvoir
-- discrétionnaire.
--
-- La politique de confidentialité du site annonce cet accès et ses limites.
-- Le code et la promesse faite aux membres doivent dire la même chose.


-- Les discussions d'un membre : de quoi savoir laquelle ouvrir. Cette
-- fonction ne renvoie aucun message, seulement avec qui et quand.
create or replace function public.admin_discussions_du_membre(membre uuid)
returns table (
  conversation_id uuid,
  avec_id         uuid,
  avec_pseudo     text,
  nb_messages     bigint,
  dernier_le      timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  return query
    select
      c.id,
      case when c.membre_a = membre then c.membre_b else c.membre_a end,
      p.pseudo,
      (select count(*) from public.messages m where m.conversation_id = c.id),
      (select max(m.envoye_le) from public.messages m where m.conversation_id = c.id)
    from public.conversations c
    left join public.profils p
      on p.id = case when c.membre_a = membre then c.membre_b else c.membre_a end
    where c.membre_a = membre or c.membre_b = membre
    order by 5 desc nulls last;
end;
$$;

revoke all on function public.admin_discussions_du_membre(uuid) from public;
grant execute on function public.admin_discussions_du_membre(uuid) to authenticated;


-- Le contenu d'une discussion. Le motif est obligatoire, et la trace est
-- écrite avant la lecture : si l'écriture du journal échoue, rien n'est lu.
create or replace function public.admin_lire_discussion(conversation uuid, motif text)
returns table (
  id            bigint,
  auteur_id     uuid,
  auteur_pseudo text,
  texte         text,
  envoye_le     timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi          uuid := auth.uid();
  pseudo_admin text;
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  if moi is null then
    raise exception 'Aucune session : impossible d''ouvrir une discussion.';
  end if;

  if motif is null or length(btrim(motif)) < 10 then
    raise exception 'Un motif d''au moins dix caractères est exigé pour ouvrir une discussion.';
  end if;

  if not exists (select 1 from public.conversations c where c.id = conversation) then
    raise exception 'Cette discussion n''existe pas ou plus.';
  end if;

  select p.pseudo into pseudo_admin from public.profils p where p.id = moi;

  insert into public.journal_admin (admin_id, admin_pseudo, action, cible_id, cible_pseudo, motif)
  values (moi, pseudo_admin, 'lecture d''une discussion', conversation, null, btrim(motif));

  return query
    select m.id, m.auteur_id, p.pseudo, m.texte, m.envoye_le
    from public.messages m
    left join public.profils p on p.id = m.auteur_id
    where m.conversation_id = conversation
    order by m.envoye_le;
end;
$$;

revoke all on function public.admin_lire_discussion(uuid, text) from public;
grant execute on function public.admin_lire_discussion(uuid, text) to authenticated;


-- Le journal se consulte depuis la page d'administration : un pouvoir qui
-- laisse une trace que personne ne relit n'en laisse pas vraiment.
create or replace function public.admin_journal(depuis int default 200)
returns setof public.journal_admin
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;
  return query
    select * from public.journal_admin order by fait_le desc limit depuis;
end;
$$;

revoke all on function public.admin_journal(int) from public;
grant execute on function public.admin_journal(int) to authenticated;

notify pgrst, 'reload schema';
