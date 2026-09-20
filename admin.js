// Espace d'administration.
//
// Ce que cette page sait faire : remplacer le visuel d'une carte, corriger
// une carte, en ajouter une, déclarer une extension. Tout passe par la table
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

async function clientAdmin(){
  if(dbAdmin) return dbAdmin;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  dbAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return dbAdmin;
}

// La colonne « est_admin » n'est lisible par personne ; la base répond par
// cette fonction, et seulement pour le compte qui la pose.
async function verifierAdmin(){
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

// ------------------------------------------------ le lien de navigation --
//
// Le lien n'apparaît que pour un administrateur. C'est du confort, pas de la
// sécurité : le masquer n'empêche personne d'ouvrir admin.html, et c'est
// très bien ainsi — quiconque s'y rend sans les droits tombe sur un refus
// poli, et la base refuserait de toute façon la moindre écriture.
async function poserLienAdministration(){
  if(document.querySelector('[data-lien-admin]')) return;
  const etat = await verifierAdmin();
  if(!etat.admin) return;

  const liens = document.querySelector('nav .navlinks');
  if(!liens) return;
  const a = document.createElement('a');
  a.href = 'admin.html';
  a.textContent = 'Administration';
  a.dataset.lienAdmin = '1';
  a.style.color = 'var(--gold)';
  liens.appendChild(a);
}

// Sur la page d'administration elle-même, la vérification a déjà lieu.
if(!location.pathname.endsWith('admin.html')){
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', poserLienAdministration);
  }else{
    poserLienAdministration();
  }
}
