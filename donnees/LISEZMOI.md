# Instantané des cartes

**Ce dossier est produit par une machine. Ne le modifie pas à la main :
la prochaine construction écraserait tes changements.**

Il contient les données que le site sert lui-même, au lieu de les demander à
une API pendant que le visiteur attend. Il est reconstruit chaque nuit par
`.github/workflows/instantane.yml`, qui appelle `outils/instantane.mjs`.

## Ce qu'on y trouve

    version.json              date de construction et comptes
    physique/extensions.json  le catalogue du jeu de cartes physique
    physique/sets/<id>.json   les cartes d'une extension
    physique/dex/<n>.json     les cartes d'un Pokémon, par numéro de Pokédex
    pocket/…                  les mêmes, pour l'application mobile

## D'où viennent ces données

- Jeu physique : [tcgdex/cards-database](https://github.com/tcgdex/cards-database), licence MIT
- Application : [flibustier/pokemon-tcg-pocket-database](https://github.com/flibustier/pokemon-tcg-pocket-database), licence MIT

Les visuels des cartes ne sont pas copiés ici : ils restent chez leurs
hébergeurs. C'est la seule dépendance que le site garde au moment de
l'affichage, et la seule qu'on ne peut pas raisonnablement supprimer —
il y en a plus de vingt-cinq mille.

## Reconstruire à la main

    git clone --depth 1 --filter=blob:none --no-checkout \
      https://github.com/tcgdex/cards-database /tmp/tcgdex
    cd /tmp/tcgdex && git sparse-checkout init --cone \
      && git sparse-checkout set data meta && git checkout && cd -
    node outils/instantane.mjs --tcgdex /tmp/tcgdex --sortie donnees

Le script refuse de publier si les ordres de grandeur ne tiennent pas :
un instantané amputé serait pire que pas d'instantané, puisque le site
afficherait sereinement un catalogue incomplet.
