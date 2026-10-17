# NSFWJS : détection d'images inappropriées

Copie de la bibliothèque [NSFWJS](https://github.com/infinitered/nsfwjs)
(version 4.3.0, licence MIT, fichier `LICENSE`) et de son modèle
« MobileNetV2 ».

Le site s'en sert pour un premier contrôle des photos de profil, dans le
navigateur du membre, avant tout envoi. Ce contrôle écarte l'essentiel des
images inappropriées, mais un contrôle fait chez le visiteur se contourne :
c'est la validation par l'administrateur qui fait foi (voir
`supabase/profil-photo-parametres.sql`).

Les fichiers ne sont chargés qu'au moment où un membre choisit une photo :
aucune autre page n'en paie le poids (6 Mo environ).
