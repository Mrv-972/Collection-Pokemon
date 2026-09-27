-- Remplacer aussi le visuel d'une extension ou d'une série
-- =======================================================
--
-- À coller dans Supabase → SQL Editor, puis « Run ».
--
-- Jusqu'ici, l'espace d'administration ne savait remplacer que le visuel
-- d'une carte. Deux genres de correction s'ajoutent :
--
--   logo-extension — « cible » est l'identifiant de l'extension (« sv01 »).
--   logo-serie     — « cible » est le NOM de la série, tel qu'il s'affiche
--                    (« Écarlate et Violet »). Les séries n'ont pas
--                    d'identifiant dans les données que le site sert ; leur
--                    nom est ce qui les désigne partout ailleurs.
--
-- Rien d'autre ne change : mêmes règles de lecture et d'écriture, même
-- contrainte d'unicité — une seule correction par univers, genre et cible.

alter table corrections drop constraint if exists corrections_genre_check;

alter table corrections add constraint corrections_genre_check
  check (genre in ('visuel', 'carte', 'extension', 'logo-extension', 'logo-serie'));

-- PostgREST garde le schéma en mémoire : sans ce signal, il refuserait les
-- nouveaux genres jusqu'à son prochain redémarrage.
notify pgrst, 'reload schema';
