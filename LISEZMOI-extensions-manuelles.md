# Déclarer une extension à la main

Filet de sécurité, pas outil du quotidien. Les extensions arrivent
normalement toutes seules, chaque nuit, depuis les sources. Ce fichier sert
au cas où une extension paraît et qu'aucune source ne la publie encore :
sans page d'extension, les visuels que tu déposerais n'auraient nulle part
où s'afficher.

## Comment faire

Ouvre `extensions-manuelles.json` et écris dedans. Le fichier contient un
tableau — les crochets `[ ]` — et chaque extension est une fiche entre
accolades `{ }`.

```json
[
  {
    "id": "B5",
    "name": "Nom français de l'extension",
    "serieNom": "Série B",
    "dateSortie": "2026-11-15",
    "cartes": [
      { "localId": "1", "name": "Pikachu",  "rarity": "Un Diamant" },
      { "localId": "2", "name": "Roucool",  "rarity": "Un Diamant" },
      { "localId": "3", "name": "Dracaufeu ex", "rarity": "Quatre Diamants" }
    ]
  }
]
```

| Champ | Obligatoire | Ce que c'est |
|---|---|---|
| `id` | oui | l'identifiant court, lettres, chiffres et tirets |
| `name` | oui | le nom affiché |
| `serieNom` | oui | `Série A`, `Série B`… ; range l'extension au bon endroit |
| `dateSortie` | non | `AAAA-MM-JJ` ; sert à l'ordre à l'intérieur de la série |
| `cardCount` | non | le total annoncé, si tu le connais |
| `cartes[].localId` | oui | le numéro de la carte, en chiffres |
| `cartes[].name` | oui | le nom français de la carte |
| `cartes[].rarity` | non | `Un Diamant`, `Deux Étoiles`, `Couronne`… |

Les visuels suivent le chemin ordinaire : dépose-les dans `images/cards/`
sous le nom `B5-001.webp`, ou laisse la récolte nocturne les chercher.

## Trois choses à savoir

**La source reprend la main dès qu'elle publie l'extension.** Ta saisie est
alors ignorée, et la construction te le dit. C'est voulu : une saisie faite
dans l'urgence est forcément moins complète que la vraie donnée, et elle ne
doit pas l'empêcher d'arriver. Tu peux retirer la fiche à ce moment-là.

**Une erreur de saisie arrête la construction.** Le message dit quelle
extension et quoi corriger. Le catalogue de la veille reste en place : ton
site continue de fonctionner pendant que tu corriges.

**Le format JSON est tatillon.** Chaque texte entre guillemets droits `"`,
une virgule entre deux éléments mais jamais après le dernier. En cas de
doute, copie l'exemple ci-dessus et remplace les valeurs.
