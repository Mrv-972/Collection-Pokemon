# Administration

Il n'y a plus de page « Administrateur ». Tu navigues sur le même site que
tout le monde, et tu trouves, là où tu en as besoin, de quoi modifier ce que
tu regardes. Tu n'as plus jamais à taper un identifiant : c'est la page qui
le donne.

## À faire une fois, avant tout

**1. Fermer une faille — à faire en premier.** Ouvre l'éditeur SQL de
Supabase, colle le contenu de **`supabase/securite-profils.sql`**, et
exécute.

Sans ce fichier, un membre pouvait se déclarer administrateur depuis son
navigateur : la règle « chacun modifie son profil » portait sur sa ligne,
pas sur les colonnes, et Supabase autorise par défaut l'écriture de toutes
les colonnes. Le fichier ramène les droits aux seules colonnes que le site
modifie, et ajoute un verrou indépendant sur `est_admin`.

À la fin, deux cases doivent afficher **`false`** :
`peut_modifier_est_admin` et `peut_inserer_est_admin`.

**2. Si ce n'est pas déjà fait**, exécuter aussi
**`supabase/administration.sql`** puis
**`supabase/administration-comptes.sql`**.

**3. Te désigner administrateur.** Toujours dans l'éditeur SQL :

```sql
update profils set est_admin = true where pseudo = 'TonPseudo';
```

Ce drapeau **ne se coche pas depuis le site**. Depuis l'étape 1, c'est vrai
pour de bon : la base refuse ce changement à tout autre que l'éditeur SQL.

## Les deux environnements

**Un membre ou un visiteur** ne voit rien de changé. Le site lui pose une
seule question à la base — « suis-je administrateur ? » — reçoit « non », et
s'arrête là : aucun bouton, aucun outil, aucun code supplémentaire.

**Toi**, une fois connecté, tu vois en bas de l'écran une barre
**« ◆ Mode administrateur »**, et sur le site :

| où | ce que tu peux faire |
|---|---|
| sur chaque carte, le bouton **✎** | corriger le nom, la rareté, le Pokémon rattaché ; remplacer le visuel |
| en tête d'une page d'extension, **✎ Modifier l'extension** | corriger le nom, la série, la date ; remplacer le logo |
| en fin de grille d'une extension, **+ Ajouter une carte** | ajouter une carte absente |
| sur le titre d'une série, dans « Par extension », **✎ Logo** | remplacer le logo de la série (TCG physique) |
| en haut de « Par extension », **+ Ajouter une extension** | déclarer une extension qu'aucune source ne publie |
| dans la barre, **Corrections** | voir les corrections en cours, et les retirer |
| dans la barre, **Comptes** | gérer les comptes, lire une discussion sur signalement |

Le bouton **« Voir comme un visiteur »** retire tous ces outils, pour voir
le site exactement comme un membre. Il reste actif d'une page à l'autre ;
un clic sur **« Revenir en mode administrateur »** les rend.

## Comment ça marche

Une modification s'affiche **tout de suite** : la page se recharge et la
montre. La nuit suivante, la construction l'inscrit dans les fichiers du
dépôt ; la correction devient alors redondante, et le tiroir
« Corrections » la marque **absorbée**. Tu peux la retirer à ce moment-là
sans rien perdre. Tant qu'elle est **en attente**, ne la retire pas : c'est
elle seule qui fait apparaître ta modification.

Chaque fenêtre de modification montre aussi les corrections **déjà en
place** sur cet élément, avec un bouton **Retirer** : une erreur se défait
là où elle a été commise.

Ne change que ce que tu veux corriger. Un champ laissé tel quel n'est pas
enregistré : sinon, le jour où la source corrigerait elle-même un nom, ta
copie l'en empêcherait. Et une nouvelle correction **s'ajoute** à
l'ancienne au lieu de l'effacer : corriger la rareté d'une carte dont tu
avais déjà corrigé le nom garde les deux.

## Ce qui protège vraiment

Pas le fait que les boutons soient cachés. Un site statique livre tout son
code au navigateur : n'importe qui peut lire `admin-site.js`.

Ce qui protège, ce sont les règles de la base :

- elle **refuse toute écriture** dans les corrections, le stockage des
  visuels et la gestion des comptes à qui n'est pas administrateur ;
- `securite-profils.sql` empêche un membre de **se déclarer**
  administrateur ;
- la colonne `est_admin` n'est lisible par personne, pas même par toi : le
  site passe par une fonction qui ne répond que pour le compte qui la pose.

Si les fichiers d'administration du site disparaissaient, rien ne serait
moins sûr.

Lire une discussion entre membres exige toujours un **motif écrit**, et
laisse au journal une trace que tu ne peux pas effacer.

## Limites assumées

- **Les champs corrigibles sont une liste fermée** — nom, rareté, Pokémon
  rattaché pour une carte ; nom, série, date pour une extension. Une saisie
  ne peut pas remplacer l'identifiant d'une carte, ce qui la détacherait des
  collections des membres.
- **5 Mo maximum par image**, en WebP, PNG ou JPEG.
- **Côté TCG Pocket, les séries n'ont pas de logo** : le bouton n'y apparaît
  pas.
