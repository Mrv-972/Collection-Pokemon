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

Nom du fichier : l'identifiant de la carte, en `.png`. Il s'écrit
`<identifiant de l'extension>-<numéro de la carte>`.

Exemples :
- `images/cards/base1-4.png` (Dracaufeu, carte n°4 du Set de Base)
- `images/cards/mee-1.png` (carte n°1 de Méga-Évolution Énergie)
