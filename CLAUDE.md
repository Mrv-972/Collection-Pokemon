# PokéClasseur — consignes de travail

Ce fichier retient ce que Mrv972 a demandé une fois pour toutes. Il est lu
au début de chaque session : ce qui est écrit ici n'a pas à être redemandé.

## Parler à quelqu'un qui débute

Mrv972 n'est pas développeur. Chaque terme technique employé dans une
réponse doit être suivi de son explication entre parenthèses — « le frontend
(la partie du site que le visiteur voit dans son navigateur) ». Cela vaut
aussi pour les mots qui paraissent évidents de l'intérieur du métier.

## Donner le lien de tout document à retrouver

Dès qu'une réponse demande à Mrv972 d'aller chercher un fichier du dépôt —
un script SQL à coller dans Supabase, un fichier de configuration à
remplir —, en donner le lien cliquable vers GitHub, sur la branche en cours,
et non le seul chemin. Un chemin oblige à naviguer dans le dépôt ; un lien
s'ouvre.

    https://github.com/Mrv-972/Collection-Pokemon/blob/<branche>/<chemin>

Pour un fichier à copier intégralement, donner aussi le lien « brut »
(affichage sans habillage, plus simple à sélectionner en entier) :

    https://raw.githubusercontent.com/Mrv-972/Collection-Pokemon/<branche>/<chemin>

## Travailler sur ce dépôt

- Après toute modification d'un fichier `.js`, relancer
  `node outils/versionner.mjs` : il réestampille les appels aux scripts pour
  que les navigateurs ne servent pas une version périmée depuis leur cache.
- Les suites de tests sont écrites avec Playwright et se lancent contre un
  serveur local (`python3 -m http.server 8731`).
