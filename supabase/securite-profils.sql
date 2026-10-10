-- Fermer la porte au changement de « est_admin » par un membre.
-- ============================================================
--
-- Prérequis : supabase/schema.sql, supabase/administration.sql et
-- supabase/rgpd.sql déjà exécutés.
--
-- Le problème. La règle « chacun modifie son profil » filtre des LIGNES :
-- elle dit qu'un membre ne touche qu'à la sienne. Elle ne dit rien des
-- COLONNES. Or Supabase accorde par défaut aux comptes connectés le droit
-- d'écrire dans toutes les colonnes des tables publiques. Pour la lecture,
-- ce projet avait déjà restreint les colonnes visibles ; pour l'écriture,
-- rien. Rien n'empêchait donc un membre d'envoyer, depuis son navigateur,
-- une modification de sa propre fiche portant « est_admin = true ». La
-- base l'aurait acceptée : c'est bien sa ligne.
--
-- Le commentaire d'administration.sql affirmait qu'un compte « ne peut pas
-- se promouvoir lui-même ». Il décrivait une intention, pas ce que les
-- droits garantissaient.
--
-- La correction pose deux verrous indépendants, pour qu'une erreur future
-- sur l'un ne rouvre pas la porte :
--
--   1. les droits d'écriture sont ramenés aux seules colonnes que le site
--      modifie réellement ;
--   2. un déclencheur refuse tout changement d'« est_admin » venant d'un
--      membre ou d'un visiteur, quels que soient les droits accordés.
--
-- Le drapeau reste modifiable depuis l'éditeur SQL de Supabase, qui ne
-- passe pas par ces rôles : c'est là, et seulement là, qu'on nomme un
-- administrateur.

-- --- 1. droits ramenés aux colonnes utiles --------------------------------
-- Retirer le droit sur la table entière retire aussi les droits par colonne
-- déjà accordés : on les redonne donc APRÈS, explicitement.
revoke insert, update on profils from anon, authenticated;

-- L'inscription : identité, date de naissance (vérifiée par la règle
-- d'accès), et l'acceptation des conditions.
grant insert (id, pseudo, contact, ne_le, cgu_acceptees_le, cgu_version)
  on profils to authenticated;

-- Les modifications : le pseudo et le contact, la localisation, et une
-- nouvelle acceptation des conditions quand elles changent.
grant update (pseudo, contact,
              ville, code_postal, departement, latitude, longitude,
              cgu_acceptees_le, cgu_version)
  on profils to authenticated;

-- --- 2. le déclencheur ----------------------------------------------------
-- Même si un « grant all » venait un jour rouvrir les colonnes, ce verrou
-- tiendrait : il regarde QUI écrit, pas ce qu'on lui a permis.
create or replace function proteger_est_admin()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and coalesce(new.est_admin, false) then
      raise exception 'Un compte ne peut pas se déclarer administrateur.'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.est_admin is distinct from old.est_admin then
      raise exception 'Un compte ne peut pas changer son statut d''administrateur.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_est_admin on profils;
create trigger proteger_est_admin
  before insert or update on profils
  for each row execute function proteger_est_admin();

-- --- vérification ---------------------------------------------------------
-- Les deux lignes doivent répondre « false ».
select has_column_privilege('authenticated', 'profils', 'est_admin', 'UPDATE') as peut_modifier_est_admin,
       has_column_privilege('authenticated', 'profils', 'est_admin', 'INSERT') as peut_inserer_est_admin;

notify pgrst, 'reload schema';
