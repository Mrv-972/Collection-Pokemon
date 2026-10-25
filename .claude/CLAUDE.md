# PokéClasseur : consignes de travail

Ce fichier retient ce que Mrv972 a demandé une fois pour toutes. Il est lu
au début de chaque session : ce qui est écrit ici n'a pas à être redemandé.

## Parler à quelqu'un qui débute

Mrv972 n'est pas développeur. Chaque terme technique employé dans une
réponse doit être suivi de son explication entre parenthèses : « le frontend
(la partie du site que le visiteur voit dans son navigateur) ». Cela vaut
aussi pour les mots qui paraissent évidents de l'intérieur du métier.

## Donner le lien de tout document à retrouver

Dès qu'une réponse demande à Mrv972 d'aller chercher un fichier du dépôt :
un script SQL à coller dans Supabase, un fichier de configuration à
remplir, en donner le lien cliquable vers GitHub, sur la branche en cours,
et non le seul chemin. Un chemin oblige à naviguer dans le dépôt ; un lien
s'ouvre.

    https://github.com/Mrv-972/Collection-Pokemon/blob/<branche>/<chemin>

Pour un fichier à copier intégralement, donner aussi le lien « brut »
(affichage sans habillage, plus simple à sélectionner en entier) :

    https://raw.githubusercontent.com/Mrv-972/Collection-Pokemon/<branche>/<chemin>

## Pas de tiret cadratin

Mrv972 ne veut aucun tiret cadratin (le tiret long, caractère U+2014) sur le site :
pour lui, il trahit un texte écrit par une IA. La règle vaut pour tout ce
qui s'écrit dans ce dépôt (texte des pages, messages, titres d'onglet,
données, commentaires du code, scripts SQL, guides) et pour les réponses
qui lui sont faites. À la place : une virgule, des parenthèses ou deux
points dans une phrase, le point médian « · » entre deux informations, un
simple tiret « - » dans un titre d'onglet (« Communauté - PokéClasseur »).
Les textes récoltés ailleurs passent par `outils/typographie.mjs`, qui
retire ce caractère avant de les déposer.

## Pas d'avertissement « noms traduits automatiquement »

Mrv972 ne veut plus jamais voir le message « noms traduits automatiquement
(x/y) » sur le site. Quand `outils/instantane.mjs` doit reconstruire le nom
français d'une carte, il le signale dans son journal seulement. Pour qu'il
cesse de le signaler, on vérifie le nom et on l'ajoute à
`donnees/noms-pocket-fr.json`, avec son nom anglais pour contrôle.

## Travailler sur ce dépôt

- Après toute modification d'un fichier `.js`, relancer
  `node outils/versionner.mjs` : il réestampille les appels aux scripts pour
  que les navigateurs ne servent pas une version périmée depuis leur cache.
- Les suites de tests sont écrites avec Playwright et se lancent contre un
  serveur local (`python3 -m http.server 8731`).

## Aucune trace d'IA

Mrv972 ne veut pas qu'on puisse deviner que le site a été fait avec une IA.

- Pas de commentaires explicatifs dans le code (JS, HTML, CSS, SQL, workflows) :
  au plus une ligne courte quand un piège n'est pas évident à la lecture.
- Pas d'émoji en guise d'icône : utiliser `pictogramme('nom')` (défini dans
  `habillage.js`, dessins au trait) ou, dans le HTML statique,
  `<span class="ico-da ico-nom" aria-hidden="true"></span>`.
- Pas de surtitre au-dessus des titres de page, pas de points d'exclamation
  enjoués dans les messages, pas de formules toutes faites.
- Messages d'enregistrement (commits) courts et sobres, en français, sans
  mention d'IA ni ligne « Co-Authored-By » ou « Claude-Session ».

## Apparence

La mise en page « Badges d'arène » (`habillage.js`) est celle du site.
Couleurs des marquages : Obtenue en vert, Recherchée en rouge, Échangeable
en jaune. La page d'accueil sera refaite plus tard.
