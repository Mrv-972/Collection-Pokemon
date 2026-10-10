// Les outils d'écriture de l'administration.
//
// Il n'y a plus de page d'administration : l'administrateur modifie le
// catalogue en naviguant sur le site (admin-site.js), et retrouve comptes
// et corrections dans un tiroir (admin-tiroir.js). Ce fichier-ci ne fait
// que parler à la base : savoir si l'on est administrateur, déposer une
// image, enregistrer ou retirer une correction. Tout passe par la table
// « corrections », dont l'écriture est réservée à l'administrateur par les
// règles de la base.
//
// Ce fichier ne protège rien. Il masque des boutons à qui n'est pas
// administrateur, ce qui rend la page compréhensible — mais un site statique
// livre tout son code au navigateur, donc quiconque le veut peut appeler ces
// fonctions. La seule protection réelle est dans supabase/schema.sql : la
// base refuse l'écriture à tout compte dont le profil ne porte pas le
// drapeau « est_admin ». Si ce fichier disparaissait entièrement, rien ne
// serait moins sûr.

let dbAdmin = null;
let jeSuisAdmin = false;
// Plusieurs éléments d'une même page posent la même question. On la garde
// en mémoire pour n'interroger la base qu'une fois.
let verificationEnCours = null;

async function clientAdmin(){
  if(dbAdmin) return dbAdmin;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  dbAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return dbAdmin;
}

// La colonne « est_admin » n'est lisible par personne ; la base répond par
// cette fonction, et seulement pour le compte qui la pose.
function verifierAdmin(){
  return (verificationEnCours ??= demanderSiAdmin());
}

async function demanderSiAdmin(){
  try{
    const db = await clientAdmin();
    const { data: { session } } = await db.auth.getSession();
    if(!session) return { connecte: false, admin: false };
    const { data, error } = await db.rpc('est_admin');
    if(error) throw error;
    jeSuisAdmin = data === true;
    return { connecte: true, admin: jeSuisAdmin };
  }catch(err){
    console.warn('Vérification administrateur impossible', err);
    return { connecte: false, admin: false, erreur: err.message };
  }
}

// ------------------------------------------------------------- écriture --

const MAX_OCTETS_VISUEL = 5 * 1024 * 1024;
const TYPES_VISUEL = ['image/webp', 'image/png', 'image/jpeg'];

async function televerserVisuel(cible, fichier){
  if(!TYPES_VISUEL.includes(fichier.type)){
    throw new Error(`Format non accepté (${fichier.type || 'inconnu'}). Utilise un WebP, un PNG ou un JPEG.`);
  }
  if(fichier.size > MAX_OCTETS_VISUEL){
    throw new Error(`Image trop lourde (${(fichier.size / 1048576).toFixed(1)} Mo). Maximum 5 Mo.`);
  }

  const db = await clientAdmin();
  const extension = fichier.type.split('/')[1].replace('jpeg', 'jpg');
  // L'horodatage force une adresse neuve : sans lui, le navigateur
  // continuerait d'afficher l'image précédente, gardée en cache.
  const chemin = `${cible}-${Date.now()}.${extension}`;
  const { error } = await db.storage.from('corrections').upload(chemin, fichier, {
    contentType: fichier.type,
    upsert: false,
  });
  if(error) throw error;
  return chemin;
}

async function enregistrerCorrection({ univers, genre, cible, donnees = {}, image_chemin = null }){
  const db = await clientAdmin();
  const ligne = { univers, genre, cible, donnees };
  if(image_chemin) ligne.image_chemin = image_chemin;

  // « upsert » plutôt qu'insertion : ressaisir une correction remplace la
  // précédente au lieu d'échouer sur le doublon.
  const { error } = await db.from('corrections')
    .upsert(ligne, { onConflict: 'univers,genre,cible' });
  if(error) throw error;
}

async function listerCorrections(){
  const db = await clientAdmin();
  const { data, error } = await db.from('corrections')
    .select('id,univers,genre,cible,donnees,image_chemin,cree_le')
    .order('cree_le', { ascending: false });
  if(error) throw error;
  return data ?? [];
}

async function supprimerCorrection(id){
  const db = await clientAdmin();
  const { error } = await db.from('corrections').delete().eq('id', id);
  if(error) throw error;
}

// Une correction absorbée par la construction nocturne s'applique désormais
// sur une donnée déjà identique : elle ne change plus rien et peut être
// retirée. On le vérifie en comparant avec l'instantané publié, plutôt qu'en
// se fiant à une date — la construction peut échouer, et une correction
// qu'on croirait absorbée disparaîtrait alors de l'écran.
async function correctionAbsorbee(c){
  try{
    if(c.genre === 'extension'){
      const toutes = await lireInstantane(`${c.univers}/extensions.json`);
      const e = toutes.find(x => x.id === c.cible);
      if(!e) return false;
      return ['name', 'serieNom', 'dateSortie']
        .every(champ => !c.donnees?.[champ] || e[champ] === c.donnees[champ]);
    }
    const setId = c.cible.replace(/-\d+$/, '');
    const cartes = await lireInstantane(`${c.univers}/sets/${encodeURIComponent(setId)}.json`);
    const carte = cartes.find(x => x.id === c.cible);
    if(!carte) return false;
    if(c.genre === 'visuel') return String(carte.image ?? '').startsWith('images/cards/');
    return ['name', 'rarity', 'dexId']
      .every(champ => c.donnees?.[champ] === undefined || carte[champ] === c.donnees[champ]);
  }catch(err){
    return false;
  }
}
