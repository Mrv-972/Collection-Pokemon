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

**2. Si ce n'est pas déjà fait**, exécuter aussi, dans cet ordre,
**`supabase/administration.sql`**, **`supabase/administration-comptes.sql`**,
**`supabase/profil-photo-parametres.sql`** puis
**`supabase/communaute.sql`** (profils publics, badges, avis, signalements,
liste de souhaits partageable, réglages d'affichage), puis
**`supabase/espace-communaute.sql`** (l'onglet Communauté : questions,
idées, forums). Chacun peut être relancé sans dommage.

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

## Valider les photos de profil

Un membre peut choisir un **Pokémon** dans une galerie (immédiat, sans
validation) ou envoyer **sa photo**. Une photo passe d'abord un filtre
automatique dans son navigateur, qui écarte l'essentiel des images
pornographiques ou suggestives ; elle reste ensuite **invisible des autres
membres** tant que tu ne l'as pas validée.

Le bouton **« Photos »** de la barre d'administration ouvre la liste des
photos en attente :

- **Valider** : la photo devient celle du membre, visible de tous ;
- **Refuser…** : tu écris un motif court ; le membre le lit sur sa page de
  profil et peut en proposer une autre.

À refuser : nudité ou tenue suggestive, contenu choquant ou violent, photo
visiblement d'une autre personne (célébrité, enfant…), coordonnées ou texte
insultant. Dans le doute, refuse : le membre peut toujours choisir un
Pokémon.

Avant la première utilisation, le fichier
**`supabase/profil-photo-parametres.sql`** doit avoir été exécuté une fois
dans l'éditeur SQL de Supabase (il crée les colonnes, le stockage des photos
et les règles de validation).

## Traiter les signalements

Depuis un profil, un avis ou une discussion, un membre peut signaler un
comportement, une photo, un pseudo, un avis ou un message. Le bouton
**« Signalements »** de la barre d'administration les liste, du plus récent
au plus ancien :

- **Voir son profil** ouvre le profil du membre signalé dans un nouvel
  onglet ;
- **Retirer sa photo…** (pour une photo signalée) : la photo disparaît de
  son profil, il lit ton motif sur sa page, et le signalement est classé ;
- **Classer** retire le signalement de la liste une fois traité. Il reste
  consultable dans le tableau de bord Supabase (table `signalements`).

Pour lire une discussion entière, passe par l'onglet **Comptes** : sa
lecture demande un motif, inscrit au journal.

## L'onglet Communauté

Sept rubriques : Accueil, Questions, Améliorations, Forums, Le saviez-vous ?,
Noms des Pokémon, Actualités. Tout le monde peut lire ; seuls les membres
connectés publient. La base freine les rafales (trois sujets par dizaine de
minutes, huit réponses par tranche de deux minutes).

**Modérer.** Connecté en administrateur, ouvre un sujet : un bandeau
« ◆ Modération » propose de l'**épingler** (il reste en tête de liste), de le
**verrouiller** (plus de réponses) et, pour une idée, de régler son
**avancement** — Proposée, À l'étude, Prévue, Réalisée, Écartée. Tu peux
aussi **supprimer** n'importe quel sujet ou réponse. Les messages signalés
arrivent dans le tiroir, onglet **Signalements**, avec un lien vers le sujet
et un bouton pour supprimer le contenu.

**La pastille des réponses.** Un membre suit les sujets qu'il a ouverts et
ceux où il a répondu. Quand quelqu'un d'autre y répond, une pastille rouge
apparaît sur l'onglet « Communauté », l'accueil de la Communauté liste ces
sujets, et les réponses arrivées depuis sa dernière visite sont marquées
« Nouveau ». Ouvrir le sujet remet le compteur à zéro.

**Les badges de la communauté**, calculés par la base comme ceux de la
collection, s'affichent sur les profils : Premier message, Bonne réponse
(une réponse choisie comme la meilleure), Serviable (avoir répondu aux
questions de 10 membres), Idée populaire (10 soutiens), Idée retenue (une
idée que tu passes en « Prévue » ou « Réalisée »), Expert (5 meilleures
réponses) et Pilier du forum (50 messages). Ce qu'un membre fait pour
lui-même ne compte pas : répondre à sa propre question, choisir sa propre
réponse, soutenir sa propre idée.

**Les contenus automatiques.**

- *Noms des Pokémon* et les anecdotes des Pokémon sont lus sur Poképédia
  chaque mois (tâche « Noms des Pokémon » de l'onglet *Actions*). Poképédia
  publie sous licence CC BY-NC-SA 3.0 : le site la cite à chaque texte.
- *Actualités* : les titres sont récoltés deux fois par jour (tâche
  « Actualités Pokémon ») sur Google Actualités, jeuxvideo.com et Dexerto. Seuls
  les sites de jeux vidéo et de Pokémon sont gardés, les faits divers écartés.
- *Le saviez-vous ?* mêle ces anecdotes de Poképédia et celles du fichier
  **`donnees/le-saviez-vous.json`**, que tu peux enrichir depuis GitHub
  (bouton crayon du fichier) en recopiant une ligne existante.
- Les sites conseillés de la rubrique Actualités sont dans
  **`donnees/sites-pokemon.json`**.

Chacune de ces tâches peut se relancer à la main : onglet *Actions* du
dépôt, choisir la tâche, *Run workflow*.

## Le badge « Extension complète »

La base doit connaître le nombre de cartes de chaque extension pour décerner
ce badge. La construction nocturne le résume dans
`donnees/totaux-extensions.json`, et **ton navigateur le recopie dans la
base tout seul**, au plus une fois par jour, quand tu ouvres le site en étant
connecté. Tu n'as rien à faire. Seul un compte administrateur peut écrire ces
nombres : un membre ne peut donc pas abaisser le total d'une extension pour
se l'attribuer.

## Ce qui protège vraiment

Pas le fait que les boutons soient cachés. Un site statique livre tout son
code au navigateur : n'importe qui peut lire `admin-site.js`.

Ce qui protège, ce sont les règles de la base :

- elle **refuse toute écriture** dans les corrections, le stockage des
  visuels et la gestion des comptes à qui n'est pas administrateur ;
- `securite-profils.sql` empêche un membre de **se déclarer**
  administrateur ;
- `profil-photo-parametres.sql` empêche un membre de **publier sa photo
  lui-même** : elle attend dans un dépôt privé, que seuls lui et toi pouvez
  lire, et seule ta validation la rend publique ;
- `communaute.sql` ne laisse donner un **avis** qu'à qui a réellement
  échangé des messages avec le membre noté, et calcule les **badges** à
  partir des données de la base : rien ne se déclare ;
- `espace-communaute.sql` ne laisse un membre publier, modifier ou supprimer
  que **ses propres** messages ; épingler, verrouiller et faire avancer une
  idée sont réservés à l'administrateur, et les compteurs (réponses,
  soutiens) sont tenus par la base, pas par le navigateur ;
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
