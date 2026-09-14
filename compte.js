// Compte membre et synchronisation de la collection.
//
// Le site reste utilisable sans compte : les tags vivent alors dans le
// navigateur, comme avant. Dès qu'on se connecte, ils partent en ligne et
// suivent le membre d'un appareil à l'autre — condition nécessaire pour que
// la mise en relation entre collectionneurs ait un sens.

let supabase = null;
let membre = null;   // l'utilisateur connecté, ou null
let profil = null;   // son pseudo et son contact

// Vrai quand le membre arrive depuis un lien de réinitialisation : il a une
// session, mais elle ne sert qu'à choisir un nouveau mot de passe.
let modeRecuperation = false;

const CONFIG_MANQUANTE = SUPABASE_URL.includes('REMPLACER');

async function clientSupabase(){
  if(supabase) return supabase;
  if(CONFIG_MANQUANTE) throw new Error("La base n'est pas encore configurée (voir supabase-config.js).");
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabase;
}

// À appeler au chargement de chaque page. Reprend la session en cours s'il y
// en a une, sans jamais bloquer l'affichage si la base est injoignable.
async function initCompte(){
  if(CONFIG_MANQUANTE) return null;

  // Le lien reçu par courriel porte sa nature dans l'adresse. On le repère
  // avant tout traitement, car la bibliothèque consomme ces paramètres en
  // ouvrant la session.
  if(window.location.hash.includes('type=recovery')) modeRecuperation = true;

  try{
    const db = await clientSupabase();
    db.auth.onAuthStateChange((evenement) => {
      if(evenement === 'PASSWORD_RECOVERY') modeRecuperation = true;
    });
    const { data } = await db.auth.getSession();
    membre = data.session?.user ?? null;
    if(membre) await chargerProfil();
  }catch(err){
    console.warn('Compte indisponible', err);
  }
  return membre;
}

function estConnecte(){
  return membre !== null;
}

// Âge minimum pour s'inscrire. La règle est aussi posée dans la base :
// une vérification côté navigateur se contourne trop facilement.
const AGE_MINIMUM = 15;

// Renvoie null si la date convient, sinon la raison du refus.
function refusAge(dateNaissance){
  if(!dateNaissance) return 'Indique ta date de naissance.';
  const ne = new Date(dateNaissance);
  if(Number.isNaN(ne.getTime())) return 'Cette date ne semble pas valide.';
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() - AGE_MINIMUM);
  if(ne > limite) return `Il faut avoir au moins ${AGE_MINIMUM} ans pour s'inscrire.`;
  return null;
}

async function chargerProfil(){
  const db = await clientSupabase();
  const { data } = await db.from('profils').select('pseudo, contact, ne_le').eq('id', membre.id).maybeSingle();
  profil = data;
  return profil;
}

// Le pseudo choisi à l'inscription est mis de côté : si Supabase exige une
// confirmation par e-mail, le profil ne pourra être créé qu'au retour du
// membre, une fois sa session ouverte.
const PSEUDO_EN_ATTENTE = 'pokeclasseur_profil_en_attente';

async function sInscrire(email, motDePasse, pseudo, contact, dateNaissance){
  const refus = refusAge(dateNaissance);
  if(refus) throw new Error(refus);

  const db = await clientSupabase();

  const { data, error } = await db.auth.signUp({ email, password: motDePasse });
  if(error) throw error;

  const profilVoulu = { pseudo: pseudo.trim(), contact: contact.trim() || null, ne_le: dateNaissance };

  // Sans session, aucune écriture n'est possible : la base ne saurait pas
  // qui écrit.
  if(!data.session){
    try{ localStorage.setItem(PSEUDO_EN_ATTENTE, JSON.stringify(profilVoulu)); }catch(err){}
    throw new Error("Compte créé. Confirme ton adresse dans l'e-mail que tu viens de recevoir, puis reviens te connecter.");
  }

  membre = data.user;
  await creerProfil(profilVoulu);
  await envoyerCollectionLocale();
  return membre;
}

async function creerProfil({ pseudo, contact, ne_le }){
  const refus = refusAge(ne_le);
  if(refus) throw new Error(refus);
  const db = await clientSupabase();
  const { error } = await db.from('profils').insert({ id: membre.id, pseudo, contact, ne_le });
  // Un pseudo déjà pris est le seul cas courant : on le dit clairement
  // plutôt que de laisser remonter un message technique.
  if(error){
    if(error.code === '23505') throw new Error('Ce pseudo est déjà utilisé.');
    throw error;
  }
  try{ localStorage.removeItem(PSEUDO_EN_ATTENTE); }catch(err){}
  await chargerProfil();
}

// Vrai quand le membre est connecté mais n'a pas encore de profil : cela
// arrive après une inscription passée par la confirmation d'e-mail.
function profilAcreer(){
  return estConnecte() && !profil;
}

function pseudoEnAttente(){
  try{
    return JSON.parse(localStorage.getItem(PSEUDO_EN_ATTENTE)) ?? null;
  }catch(err){
    return null;
  }
}

async function seConnecter(email, motDePasse){
  const db = await clientSupabase();
  const { data, error } = await db.auth.signInWithPassword({ email, password: motDePasse });
  if(error) throw error;
  membre = data.user;
  await chargerProfil();

  // Reprise d'une inscription qui attendait la confirmation de l'e-mail.
  const enAttente = pseudoEnAttente();
  if(!profil && enAttente){
    try{ await creerProfil(enAttente); }catch(err){ console.warn('Profil à reprendre', err); }
  }

  await fusionnerCollection();
  return membre;
}

// ------------------------------------------------ mot de passe oublié ----

function enRecuperation(){
  return modeRecuperation;
}

// Envoie le lien de réinitialisation. Le retour se fait sur cette même page,
// qui proposera alors de choisir un nouveau mot de passe.
async function envoyerLienReinitialisation(email){
  const db = await clientSupabase();
  const { error } = await db.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: new URL('connexion.html', window.location.href).href,
  });
  if(error) throw error;
}

const LONGUEUR_MOT_DE_PASSE = 6;

async function definirNouveauMotDePasse(motDePasse){
  if(motDePasse.length < LONGUEUR_MOT_DE_PASSE){
    throw new Error(`Le mot de passe doit faire au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`);
  }
  const db = await clientSupabase();
  const { data, error } = await db.auth.updateUser({ password: motDePasse });
  if(error) throw error;

  // Le lien de réinitialisation ouvre déjà une session : le membre est
  // connecté une fois son mot de passe changé.
  modeRecuperation = false;
  membre = data.user;
  // On nettoie l'adresse, pour qu'un rafraîchissement ne rejoue pas le lien.
  history.replaceState(null, '', window.location.pathname);
  await chargerProfil();
  await fusionnerCollection();
}

async function seDeconnecter(){
  const db = await clientSupabase();
  await db.auth.signOut();
  membre = null;
  profil = null;
  modeRecuperation = false;
}

async function majProfil(pseudo, contact, dateNaissance){
  const refus = refusAge(dateNaissance);
  if(refus) throw new Error(refus);
  const db = await clientSupabase();
  const { error } = await db.from('profils')
    .update({ pseudo: pseudo.trim(), contact: contact.trim() || null, ne_le: dateNaissance })
    .eq('id', membre.id);
  if(error){
    if(error.code === '23505') throw new Error('Ce pseudo est déjà utilisé.');
    throw error;
  }
  await chargerProfil();
}

// ------------------------------------------------------- collection ------

// Envoie l'état d'une carte. Appelée à chaque clic sur un tag ; l'échec est
// signalé mais ne fait jamais perdre le marquage, qui reste dans le
// navigateur.
async function enregistrerCarte(carteId, etat){
  if(!estConnecte()) return;
  const db = await clientSupabase();
  const { error } = await db.from('cartes').upsert({
    utilisateur_id: membre.id,
    carte_id: carteId,
    obtenue: !!etat.obt,
    recherchee: !!etat.rech,
    echangeable: !!etat.ech,
    maj_le: new Date().toISOString(),
  });
  if(error) throw error;
}

async function enregistrerCartes(entrees){
  if(!estConnecte() || entrees.length === 0) return;
  const db = await clientSupabase();
  const lignes = entrees.map(([carteId, etat]) => ({
    utilisateur_id: membre.id,
    carte_id: carteId,
    obtenue: !!etat.obt,
    recherchee: !!etat.rech,
    echangeable: !!etat.ech,
    maj_le: new Date().toISOString(),
  }));
  // Par paquets, pour ne pas envoyer une requête démesurée sur une grosse
  // collection.
  for(let i = 0; i < lignes.length; i += 500){
    const { error } = await db.from('cartes').upsert(lignes.slice(i, i + 500));
    if(error) throw error;
  }
}

async function lireCollection(){
  const db = await clientSupabase();
  const { data, error } = await db.from('cartes')
    .select('carte_id, obtenue, recherchee, echangeable')
    .eq('utilisateur_id', membre.id);
  if(error) throw error;
  const parCarte = {};
  data.forEach(l => {
    parCarte[l.carte_id] = { obt: l.obtenue, rech: l.recherchee, ech: l.echangeable };
  });
  return parCarte;
}

async function envoyerCollectionLocale(){
  await enregistrerCartes(Object.entries(tagState));
}

// À la connexion, on réunit ce qui est en ligne et ce qui a été marqué sur
// cet appareil : un tag posé d'un côté ou de l'autre est conservé. Fusionner
// plutôt qu'écraser évite de perdre du travail sans prévenir — au pire on
// garde un tag en trop, qui se retire d'un clic.
async function fusionnerCollection(){
  const enLigne = await lireCollection();
  const aRenvoyer = [];

  Object.entries(enLigne).forEach(([carteId, etat]) => {
    const local = tagState[carteId];
    if(!local){ tagState[carteId] = etat; return; }
    const fusion = {
      obt:  local.obt  || etat.obt,
      rech: local.rech || etat.rech,
      ech:  local.ech  || etat.ech,
    };
    tagState[carteId] = fusion;
    if(fusion.obt !== etat.obt || fusion.rech !== etat.rech || fusion.ech !== etat.ech){
      aRenvoyer.push([carteId, fusion]);
    }
  });

  // Les cartes marquées ici et inconnues en ligne.
  Object.entries(tagState).forEach(([carteId, etat]) => {
    if(!enLigne[carteId]) aRenvoyer.push([carteId, etat]);
  });

  saveTags();
  await enregistrerCartes(aRenvoyer);
}

// -------------------------------------------------------- navigation -----

// Remplace le lien "Mon classeur" de l'en-tête par l'état réel du compte.
function afficherEtatCompte(){
  const lien = document.querySelector('nav .compte-lien');
  if(!lien) return;
  if(CONFIG_MANQUANTE){
    lien.textContent = 'Compte à configurer';
    lien.href = 'connexion.html';
    return;
  }
  lien.textContent = estConnecte() ? `${profil?.pseudo ?? 'Mon compte'} →` : 'Se connecter →';
  lien.href = 'connexion.html';
  if(estConnecte()){
    afficherNonLus();
    suivreLesNonLus();
  }
}

// La pastille se tient à jour d'elle-même, sans qu'on ait à changer de page.
//
// Le rythme est lent à dessein : c'est une pastille de notification, pas une
// conversation. Vérifier plus souvent depuis chaque onglet ouvert
// solliciterait la base sans rien apporter — la page Discussions, elle, a
// son propre rythme rapide pour les messages eux-mêmes.
const DELAI_PASTILLE = 25000;
let suiviPastilleLance = false;

function suivreLesNonLus(){
  if(suiviPastilleLance) return;
  suiviPastilleLance = true;

  setInterval(() => {
    // Rien à faire pour un onglet que personne ne regarde.
    if(document.visibilityState === 'visible' && estConnecte()) afficherNonLus();
  }, DELAI_PASTILLE);

  // Au retour sur l'onglet, on rafraîchit tout de suite : c'est le moment
  // précis où le membre regarde.
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible' && estConnecte()) afficherNonLus();
  });
}

// Styles de la pastille, embarqués ici pour que toutes les pages en
// bénéficient sans dupliquer de CSS.
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  nav .pastille{display:inline-block;min-width:18px;padding:1px 5px;border-radius:9px;background:#A8431C;color:#F6EFEA;font-size:11px;font-weight:600;line-height:16px;text-align:center;vertical-align:1px;}
`}));

async function totalNonLus(){
  const db = await clientSupabase();
  const { data, error } = await db.rpc('total_non_lus');
  if(error) throw error;
  return data ?? 0;
}

// Pastille sur le lien "Discussions". Elle n'apparaît que s'il y a quelque
// chose à lire : une pastille à zéro n'apprend rien. Elle vit ici, et non
// dans le module de messagerie, pour s'afficher sur toutes les pages : ce
// module-là n'est chargé que par celles qui manipulent des conversations.
async function afficherNonLus(){
  const lien = document.querySelector('nav a[href="discussions.html"]');
  if(!lien) return;
  try{
    const nombre = await totalNonLus();
    lien.querySelector('.pastille')?.remove();
    if(nombre > 0){
      lien.insertAdjacentHTML('beforeend',
        ` <span class="pastille">${nombre > 99 ? '99+' : nombre}</span>`);
    }
  }catch(err){
    console.warn('Compte des non-lus indisponible', err);
  }
}
