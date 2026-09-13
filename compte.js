// Compte membre et synchronisation de la collection.
//
// Le site reste utilisable sans compte : les tags vivent alors dans le
// navigateur, comme avant. Dès qu'on se connecte, ils partent en ligne et
// suivent le membre d'un appareil à l'autre — condition nécessaire pour que
// la mise en relation entre collectionneurs ait un sens.

let supabase = null;
let membre = null;   // l'utilisateur connecté, ou null
let profil = null;   // son pseudo et son contact

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
  try{
    const db = await clientSupabase();
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

async function chargerProfil(){
  const db = await clientSupabase();
  const { data } = await db.from('profils').select('pseudo, contact').eq('id', membre.id).maybeSingle();
  profil = data;
  return profil;
}

async function sInscrire(email, motDePasse, pseudo, contact){
  const db = await clientSupabase();

  const { data, error } = await db.auth.signUp({ email, password: motDePasse });
  if(error) throw error;
  membre = data.user;
  if(!membre) throw new Error("Inscription enregistrée, mais la session n'a pas démarré.");

  const { error: erreurProfil } = await db.from('profils').insert({
    id: membre.id,
    pseudo: pseudo.trim(),
    contact: contact.trim() || null,
  });
  // Un pseudo déjà pris est le seul cas courant : on le dit clairement
  // plutôt que de laisser un message technique.
  if(erreurProfil){
    if(erreurProfil.code === '23505') throw new Error('Ce pseudo est déjà utilisé.');
    throw erreurProfil;
  }

  await chargerProfil();
  await envoyerCollectionLocale();
  return membre;
}

async function seConnecter(email, motDePasse){
  const db = await clientSupabase();
  const { data, error } = await db.auth.signInWithPassword({ email, password: motDePasse });
  if(error) throw error;
  membre = data.user;
  await chargerProfil();
  await fusionnerCollection();
  return membre;
}

async function seDeconnecter(){
  const db = await clientSupabase();
  await db.auth.signOut();
  membre = null;
  profil = null;
}

async function majProfil(pseudo, contact){
  const db = await clientSupabase();
  const { error } = await db.from('profils')
    .update({ pseudo: pseudo.trim(), contact: contact.trim() || null })
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
}
