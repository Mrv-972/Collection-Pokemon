# Images ajoutées à la main

Le site affiche en priorité les visuels français de TCGdex. Quand TCGdex n'en a
pas, il cherche automatiquement un fichier ici. Il suffit de déposer l'image au
bon endroit, avec le bon nom — aucune autre modification n'est nécessaire.

## Logos d'extension → `images/sets/`

Nom du fichier : l'identifiant de l'extension, en `.png`.

L'identifiant se lit dans l'adresse de la page de l'extension :
`extension.html?set=base1` → le fichier doit s'appeler `base1.png`.

Exemples :
- `images/sets/base1.png` (Set de Base)
- `images/sets/mee.png` (Méga-Évolution Énergie)

## Images de carte → `images/cards/`

**Depuis la mise en place de l'instantané, une image déposée ici passe
devant toutes les sources extérieures** — elle n'est plus seulement un
recours quand les autres échouent. C'est utile pour les cartes qui n'ont
de visuel français nulle part, comme les extensions Pocket les plus
récentes.

Formats acceptés : `.webp`, `.png`, `.jpg`. L'image apparaît à la
prochaine reconstruction — automatique chaque nuit, ou déclenchée à la
main depuis l'onglet **Actions** du dépôt.


Nom du fichier : l'identifiant de la carte, en `.png`. Il s'écrit
`<identifiant de l'extension>-<numéro de la carte>`.

Exemples :
- `images/cards/base1-4.png` (Dracaufeu, carte n°4 du Set de Base)
- `images/cards/mee-1.png` (carte n°1 de Méga-Évolution Énergie)

## Visuels récoltés automatiquement

Depuis le 20 septembre, la construction nocturne dépose elle aussi des fichiers
dans `images/cards/` : les visuels français qu'elle trouve chez les sources
allumées dans `outils/sources-visuels.json`.

Ils sont **téléchargés, pas pointés**. Pointer reviendrait à faire payer le
trafic de ce site à celui qui héberge la source, à chaque page ouverte par un
visiteur ; et le site retomberait en panne le jour où cette source disparaît.
Une fois le fichier copié ici, il ne coûte plus rien à personne.

Un fichier déjà présent n'est jamais redemandé, et une image que tu déposes
toi-même n'est jamais écrasée : la récolte ne télécharge que ce qui manque.

### Deux définitions par carte

- `images/cards/A1-001.webp`    — la vignette, affichée dans les grilles
- `images/cards/A1-001-hd.webp` — la haute définition, affichée au zoom

Le suffixe `-hd` est la seule chose qui les distingue. Une carte sans fichier
`-hd` affiche simplement sa vignette au zoom : c'est le cas des visuels venus
du wiki francophone, qui n'existent qu'en une seule définition.
