-- ==========================================================================
-- PokéClasseur — consentement et droit à l'effacement
-- ==========================================================================
--
-- À exécuter une fois dans l'éditeur SQL de Supabase
-- (Dashboard → SQL Editor → New query → coller → Run).
--
-- Ce fichier est idempotent : le relancer ne casse rien.
--
-- Deux choses :
--   1. garder trace de l'acceptation des conditions, avec sa date ;
--   2. permettre à un membre de supprimer son compte lui-même.
--
-- Aucune clé « service_role » n'est nécessaire, ni ici ni dans le site.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- 1. Trace du consentement
-- --------------------------------------------------------------------------
--
-- Le RGPD demande de pouvoir démontrer qu'une personne a accepté. On retient
-- donc la date et la version des conditions acceptées — la version sert le
-- jour où les conditions changent : on sait alors qui a vu quoi.

alter table profils add column if not exists cgu_acceptees_le timestamptz;
alter table profils add column if not exists cgu_version      text;

comment on column profils.cgu_acceptees_le is
  'Date d''acceptation des conditions d''utilisation et de la politique de confidentialité.';
comment on column profils.cgu_version is
  'Version des conditions acceptées, au format AAAA-MM-JJ.';

-- Ces deux colonnes se remplissent à l'inscription, donc par le membre
-- lui-même. La règle d'écriture existante sur « profils » suffit ; il faut
-- en revanche les ajouter à la liste des colonnes qu'un membre peut écrire,
-- car un GRANT ne couvre jamais une colonne ajoutée après lui.
grant insert (cgu_acceptees_le, cgu_version) on profils to authenticated;
grant update (cgu_acceptees_le, cgu_version) on profils to authenticated;
grant select (cgu_acceptees_le, cgu_version) on profils to authenticated;


-- --------------------------------------------------------------------------
-- 2. Suppression de son propre compte
-- --------------------------------------------------------------------------
--
-- Toutes les tables du site pointent vers auth.users avec « on delete
-- cascade » : supprimer la ligne du compte emporte le profil, les cartes,
-- les conversations, les messages, les blocages, les signalements et les
-- lectures. Il n'y a donc rien à effacer table par table, et rien ne peut
-- être oublié au passage.
--
-- Un navigateur n'a pas le droit d'écrire dans auth.users, et c'est heureux.
-- La fonction ci-dessous s'exécute avec les droits de son propriétaire
-- (« security definer »), mais ne peut supprimer QUE la ligne de celui qui
-- l'appelle : auth.uid() est posé par Supabase à partir du jeton de session
-- et ne peut pas être falsifié depuis le navigateur.
--
-- « set search_path = '' » force les noms complets partout : sans cela,
-- quelqu'un pourrait créer une table « users » dans un schéma qui passe
-- avant, et détourner la fonction.

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


-- --------------------------------------------------------------------------
-- 3. Vérification
-- --------------------------------------------------------------------------
--
-- Décommente et exécute pour vérifier que tout est en place. La première
-- requête doit renvoyer deux lignes, la seconde une.
--
-- select column_name from information_schema.columns
--  where table_name = 'profils' and column_name like 'cgu_%';
--
-- select proname from pg_proc where proname = 'supprimer_mon_compte';

notify pgrst, 'reload schema';
