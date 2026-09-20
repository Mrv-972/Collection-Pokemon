# Espace d'administration

Une page réservée à toi seul, pour corriger le catalogue sans attendre la
construction nocturne : remplacer le visuel d'une carte, corriger un nom ou
une rareté, ajouter une carte, déclarer une extension.

## À faire une fois, avant tout

**1. Exécuter le schéma.** Ouvre l'éditeur SQL de Supabase, colle le contenu
de `supabase/schema.sql`, exécute. Le script peut être relancé sans risque.

**2. Te désigner administrateur.** Toujours dans l'éditeur SQL :

```sql
update profils set est_admin = true where pseudo = 'TonPseudo';
```

Ce drapeau **ne se coche pas depuis le site**, volontairement : un compte ne
peut donc pas se promouvoir lui-même, même en trafiquant ce que son
navigateur envoie.

Le lien « Administration » apparaît alors dans le menu, en doré.

## Comment ça marche

Une correction que tu enregistres s'affiche **tout de suite** sur le site.
La nuit suivante, la construction l'inscrit dans les fichiers du dépôt ; la
correction devient alors redondante et l'onglet « Corrections en cours » la
marque **absorbée**. Tu peux la supprimer à ce moment-là, sans rien perdre.

Tant qu'elle est **en attente**, ne la supprime pas : c'est elle seule qui
fait apparaître ta modification.

Ce va-et-vient a une raison : ton site ne doit pas dépendre durablement de
Supabase. Si ce service tombait, les 3863 cartes resteraient en place — seules
les corrections des dernières heures manqueraient.

## Ce qui protège vraiment

Pas le fait que la page soit difficile à trouver. Un site statique livre tout
son code au navigateur : `admin.html` est visible de quiconque regarde.

Ce qui protège, ce sont les règles de la base (`supabase/schema.sql`) : elle
**refuse toute écriture** à un compte dont le profil ne porte pas `est_admin`.
Un visiteur qui ouvrirait la page verrait un refus poli, et même en appelant
les fonctions à la main depuis sa console, il n'écrirait rien.

La colonne `est_admin` n'est lisible par personne, pas même par toi : le site
passe par une fonction qui ne répond que pour le compte qui la pose.

## Limites assumées

- **Les champs corrigibles sont une liste fermée** — nom, rareté, Pokémon
  rattaché pour une carte ; nom, série, date pour une extension. Une saisie
  ne peut pas remplacer l'identifiant d'une carte, ce qui la détacherait des
  collections des membres.
- **5 Mo maximum par image**, en WebP, PNG ou JPEG.
- **Une seule correction en vigueur par cible** : ressaisir remplace.
