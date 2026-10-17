// Compte membre et synchronisation de la collection.
//
// Le site reste utilisable sans compte : les tags vivent alors dans le
// navigateur, comme avant. Dès qu'on se connecte, ils partent en ligne et
// suivent le membre d'un appareil à l'autre : condition nécessaire pour que
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
    if(membre){ await chargerProfil(); synchroniserTheme(); synchroniserAffichage(); }
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

// Une règle d'accès filtre des lignes, jamais des colonnes : la table des
// profils est donc lisible en partie seulement (pseudo, contact,
// département), pour que personne ne puisse récupérer la date de naissance
// ou la position des autres membres. Chacun relit les siennes par cette
// fonction, qui ne renvoie que sa propre ligne.
async function chargerProfil(){
  const db = await clientSupabase();
  const { data, error } = await db.rpc('mon_profil');
  if(error) console.warn('Profil illisible', error);
  profil = data?.[0] ?? null;
  return profil;
}

// Le pseudo choisi à l'inscription est mis de côté : si Supabase exige une
// confirmation par e-mail, le profil ne pourra être créé qu'au retour du
// membre, une fois sa session ouverte.
const PSEUDO_EN_ATTENTE = 'pokeclasseur_profil_en_attente';

// La version des conditions acceptée par le membre. Le jour où les
// conditions changent, cette valeur change aussi, et l'on sait alors qui a
// accepté quoi : c'est ce que le RGPD appelle pouvoir démontrer le
// consentement. Elle doit suivre la date de « miseAJour » dans legal.js.
const VERSION_CONDITIONS = '2026-10-11';

async function sInscrire(email, motDePasse, pseudo, contact, dateNaissance){
  const refus = refusAge(dateNaissance);
  if(refus) throw new Error(refus);

  const db = await clientSupabase();

  const { data, error } = await db.auth.signUp({ email, password: motDePasse });
  if(error) throw error;

  const profilVoulu = {
    pseudo: pseudo.trim(),
    contact: contact.trim() || null,
    ne_le: dateNaissance,
    cgu_acceptees_le: new Date().toISOString(),
    cgu_version: VERSION_CONDITIONS,
  };

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

async function creerProfil({ pseudo, contact, ne_le, cgu_acceptees_le, cgu_version }){
  const refus = refusAge(ne_le);
  if(refus) throw new Error(refus);
  const db = await clientSupabase();
  const { error } = await db.from('profils').insert({
    id: membre.id, pseudo, contact, ne_le,
    // Une inscription passée par la confirmation d'e-mail revient ici plus
    // tard : l'accord date alors du formulaire, pas du retour.
    cgu_acceptees_le: cgu_acceptees_le ?? new Date().toISOString(),
    cgu_version: cgu_version ?? VERSION_CONDITIONS,
  });
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

// ----------------------------------------------------- localisation ------

// Enregistre la commune choisie. Seul le point central de la commune part en
// base : ni adresse, ni position réelle de l'appareil.
async function definirLocalisation(commune){
  // Le méridien de Greenwich traverse la France : une longitude de zéro est
  // une vraie position, pas une absence de position.
  if(!Number.isFinite(commune?.latitude) || !Number.isFinite(commune?.longitude)){
    throw new Error("Cette commune n'a pas de position connue.");
  }
  const db = await clientSupabase();
  const { error } = await db.from('profils').update({
    ville:       commune.nom,
    code_postal: commune.codePostal,
    departement: commune.departement,
    latitude:    commune.latitude,
    longitude:   commune.longitude,
  }).eq('id', membre.id);
  if(error) throw error;
  await chargerProfil();
}

// Renseigner sa zone doit rester réversible, sans quoi ce serait un
// engagement définitif pris en deux clics.
async function retirerLocalisation(){
  const db = await clientSupabase();
  const { error } = await db.from('profils').update({
    ville: null, code_postal: null, departement: null, latitude: null, longitude: null,
  }).eq('id', membre.id);
  if(error) throw error;
  await chargerProfil();
}

function aUneLocalisation(){
  return Number.isFinite(profil?.latitude) && Number.isFinite(profil?.longitude);
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
// plutôt qu'écraser évite de perdre du travail sans prévenir : au pire on
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

// ------------------------------------------------ avatar et photo -------
//
// L'image d'un membre, par ordre de préférence : sa photo VALIDÉE par
// l'administrateur, sinon le Pokémon choisi dans la galerie, sinon
// l'initiale de son pseudo. La galerie est la nôtre : un avatar ne
// demande aucune validation.
const AVATARS = [
  ['pikachu', 25, 'Pikachu'], ['evoli', 133, 'Évoli'], ['bulbizarre', 1, 'Bulbizarre'],
  ['salameche', 4, 'Salamèche'], ['carapuce', 7, 'Carapuce'], ['dracaufeu', 6, 'Dracaufeu'],
  ['mew', 151, 'Mew'], ['mewtwo', 150, 'Mewtwo'], ['ectoplasma', 94, 'Ectoplasma'],
  ['ronflex', 143, 'Ronflex'], ['lokhlass', 131, 'Lokhlass'], ['rondoudou', 39, 'Rondoudou'],
  ['psykokwak', 54, 'Psykokwak'], ['pyroli', 136, 'Pyroli'], ['togepi', 175, 'Togepi'],
  ['germignon', 152, 'Germignon'], ['hericendre', 155, 'Héricendre'], ['kaiminus', 158, 'Kaiminus'],
  ['gardevoir', 282, 'Gardevoir'], ['rayquaza', 384, 'Rayquaza'], ['tiplouf', 393, 'Tiplouf'],
  ['lucario', 448, 'Lucario'], ['amphinobi', 658, 'Amphinobi'], ['mimiqui', 778, 'Mimiqui'],
  ['morpeko', 877, 'Morpeko'], ['poussacha', 906, 'Poussacha'],
].map(([cle, dex, nom]) => ({ cle, dex, nom }));

const urlAvatar = cle => {
  const a = AVATARS.find(x => x.cle === cle);
  return a ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${a.dex}.png` : null;
};

const echapperAttr = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// « p » porte pseudo, avatar et photo_url. Une image qui ne se charge pas
// laisse place à l'initiale, plutôt qu'à une icône d'image cassée.
function avatarHtml(p, taille = 32, classe = ''){
  const initiale = String(p?.pseudo ?? '?').trim().charAt(0).toUpperCase() || '?';
  const src = p?.photo_url || urlAvatar(p?.avatar);
  const style = `width:${taille}px;height:${taille}px;font-size:${Math.round(taille * 0.45)}px`;
  return `<span class="avatar-membre ${classe}" style="${style}" aria-hidden="true">${src
    ? `<img src="${echapperAttr(src)}" alt="" loading="lazy" ${p?.photo_url ? '' : 'class="avatar-pokemon"'}
         onerror="this.parentNode.textContent='${echapperAttr(initiale).replace(/'/g, '')}'">`
    : echapperAttr(initiale)}</span>`;
}

const STYLE_PROFIL = `
  .avatar-membre{display:inline-flex;align-items:center;justify-content:center;flex:none;
    border-radius:50%;overflow:hidden;background:rgba(var(--gold-rgb,201,162,39),0.18);
    color:var(--accent-clair,#E3C766);font-weight:600;font-family:'IBM Plex Sans',sans-serif;
    box-shadow:inset 0 0 0 1px rgba(var(--trait-rgb,237,234,224),0.16);vertical-align:middle}
  .avatar-membre img{width:100%;height:100%;object-fit:cover;display:block}
  .avatar-membre img.avatar-pokemon{object-fit:contain;padding:8%;box-sizing:border-box}

  /* Le menu du profil, dans la barre du haut : il s'ouvre au survol, au
     clic (un écran tactile n'a pas de survol) et au clavier. */
  .menu-profil{position:relative;margin-left:12px}
  .menu-profil-bouton{display:inline-flex;align-items:center;gap:9px;background:none;border:0;cursor:pointer;
    color:var(--text-on-ink,#EDEAE0);font:inherit;font-size:14px;padding:6px 4px;border-radius:999px}
  .menu-profil-bouton .chevron{font-size:10px;opacity:.6;transition:transform .15s}
  .menu-profil-bouton .nom{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .menu-profil-liste{position:absolute;right:0;top:calc(100% + 6px);z-index:65;min-width:200px;
    padding:6px;border-radius:10px;background:var(--ink-soft,#20232A);
    border:1px solid rgba(var(--trait-rgb,237,234,224),0.14);box-shadow:0 14px 34px rgba(0,0,0,0.28);
    opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .12s,transform .12s,visibility .12s}
  /* Un pont invisible entre le bouton et la liste : sans lui, la souris
     qui descend vers la liste traverse un vide et la referme. */
  .menu-profil-liste::before{content:'';position:absolute;left:0;right:0;top:-8px;height:8px}
  .menu-profil:hover .menu-profil-liste,.menu-profil:focus-within .menu-profil-liste,
  .menu-profil.ouvert .menu-profil-liste{opacity:1;visibility:visible;transform:none}
  .menu-profil:hover .chevron,.menu-profil.ouvert .chevron{transform:rotate(180deg)}
  .menu-profil-liste a,.menu-profil-liste button{display:flex;align-items:center;gap:10px;width:100%;
    box-sizing:border-box;padding:10px 12px;border-radius:7px;border:0;background:none;cursor:pointer;
    color:var(--text-on-ink,#EDEAE0);font:inherit;font-size:14px;text-align:left;text-decoration:none}
  .menu-profil-liste a:hover,.menu-profil-liste button:hover,
  .menu-profil-liste a:focus-visible,.menu-profil-liste button:focus-visible{background:rgba(var(--trait-rgb,237,234,224),0.08);outline:none}
  .menu-profil-liste .icone{width:18px;text-align:center;opacity:.75}
  .menu-profil-liste hr{border:0;border-top:1px solid rgba(var(--trait-rgb,237,234,224),0.10);margin:5px 4px}
  .menu-profil-liste .deconnexion{color:var(--text-on-ink-dim,#9B9E9C)}
  @media(max-width:720px){ .menu-profil-bouton .nom,.menu-profil-bouton .chevron{display:none} }
  @media(prefers-reduced-motion:reduce){ .menu-profil-liste,.menu-profil-bouton .chevron{transition:none} }
`;

function poserStyleProfil(){
  if(document.getElementById('style-profil')) return;
  document.head.appendChild(Object.assign(document.createElement('style'),
    { id: 'style-profil', textContent: STYLE_PROFIL }));
}

// Le menu du profil remplace, pour un membre connecté, le lien du compte.
function poserMenuProfil(lien){
  poserStyleProfil();
  const menu = document.createElement('div');
  menu.className = 'menu-profil';
  menu.innerHTML = `
    <button type="button" class="menu-profil-bouton" aria-haspopup="true" aria-expanded="false">
      ${avatarHtml(profil, 30)}<span class="nom">${echapperAttr(profil?.pseudo ?? 'Mon compte')}</span>
      <span class="chevron" aria-hidden="true">▼</span>
    </button>
    <div class="menu-profil-liste" role="menu">
      <a role="menuitem" href="connexion.html"><span class="icone" aria-hidden="true">👤</span>Mon profil</a>
      <a role="menuitem" href="parametres.html"><span class="icone" aria-hidden="true">⚙️</span>Paramètres</a>
      <hr>
      <button role="menuitem" type="button" class="deconnexion"><span class="icone" aria-hidden="true">↪</span>Se déconnecter</button>
    </div>`;
  const bouton = menu.querySelector('.menu-profil-bouton');
  const basculer = ouvrir => {
    menu.classList.toggle('ouvert', ouvrir);
    bouton.setAttribute('aria-expanded', String(ouvrir));
  };
  bouton.addEventListener('click', e => { e.stopPropagation(); basculer(!menu.classList.contains('ouvert')); });
  document.addEventListener('click', e => { if(!menu.contains(e.target)) basculer(false); });
  menu.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ basculer(false); bouton.focus(); bouton.blur(); }
  });
  menu.querySelector('.deconnexion').addEventListener('click', async () => {
    try{ await seDeconnecter(); }catch(err){ console.warn('Déconnexion', err); }
    window.location.href = 'index.html';
  });
  lien.replaceWith(menu);
}

// Remplace le lien "Mon classeur" de l'en-tête par l'état réel du compte.
let modeleLienCompte = null;
function afficherEtatCompte(){
  // La page du compte redessine l'en-tête après chaque action : le menu
  // déjà posé redevient le lien d'origine, puis l'état est réappliqué.
  const menuPose = document.querySelector('nav .menu-profil');
  if(menuPose && modeleLienCompte){
    const gabarit = document.createElement('template');
    gabarit.innerHTML = modeleLienCompte;
    menuPose.replaceWith(gabarit.content.firstElementChild);
  }
  const lien = document.querySelector('nav .compte-lien');
  if(!lien) return;
  modeleLienCompte ??= lien.outerHTML;
  if(CONFIG_MANQUANTE){
    lien.textContent = 'Compte à configurer';
    lien.href = 'connexion.html';
    return;
  }
  // Une session sans profil (inscription inachevée) garde le lien : il
  // mène là où l'on choisit son pseudo.
  if(estConnecte() && profil){
    poserMenuProfil(lien);
  }else{
    lien.textContent = estConnecte() ? 'Mon compte →' : 'Se connecter →';
    lien.href = 'connexion.html';
  }
  if(estConnecte()){
    afficherNonLus();
    suivreLesNonLus();
  }
}

// Les avatars et photos de plusieurs membres d'un coup, pour les listes
// (discussions, échanges). Les fonctions qui fournissent ces listes ne
// renvoient que le pseudo : on complète par une lecture à part. Tant que la
// base n'a pas reçu les colonnes, la lecture échoue et la liste garde ses
// initiales : rien ne casse.
const avatarsConnus = new Map();
async function avatarsDe(ids){
  const manquants = [...new Set(ids)].filter(id => id && !avatarsConnus.has(id));
  if(manquants.length && estConnecte()){
    try{
      const db = await clientSupabase();
      const { data, error } = await db.from('profils').select('id, avatar, photo_url').in('id', manquants);
      if(!error) for(const p of data ?? []) avatarsConnus.set(p.id, p);
    }catch{ /* initiales */ }
  }
  return avatarsConnus;
}

// --------------------------------------------- préférences du membre -----
//
// Thème et notifications sont retenus sur le compte, pour suivre le membre
// d'un appareil à l'autre. Tant que la base n'a pas reçu les colonnes
// (supabase/profil-photo-parametres.sql), le profil ne les porte pas : on
// s'en tient alors à ce que l'appareil a retenu.
const profilAPreferences = () => profil && 'pref_theme' in profil;

function synchroniserTheme(){
  if(!profilAPreferences() || typeof choisirTheme !== 'function') return;
  if(profil.pref_theme && profil.pref_theme !== themeChoisi()) choisirTheme(profil.pref_theme);
}

// Taille des vignettes, contraste, grisaille : mêmes principes, colonnes
// ajoutées par supabase/communaute.sql.
const CLE_GRISER = 'pokeclasseur-griser-manquantes';   // celle de progression.js
const profilAAffichage = () => profil && 'pref_vignettes' in profil;

function synchroniserAffichage(){
  if(!profilAAffichage()) return;
  if(typeof choisirAffichage === 'function')
    choisirAffichage({ vignettes: profil.pref_vignettes, contraste: !!profil.pref_contraste });
  // La grisaille n'est reprise du compte qu'une fois choisie : avant, le
  // choix fait sur l'appareil reste.
  if(typeof profil.pref_griser !== 'boolean') return;
  try{ localStorage.setItem(CLE_GRISER, profil.pref_griser ? 'oui' : 'non'); }catch{}
  if(document.documentElement.dataset.griser)
    document.documentElement.dataset.griser = profil.pref_griser ? 'oui' : 'non';
  document.dispatchEvent(new CustomEvent('pokeclasseur:grisaille'));
}

async function enregistrerAffichage(changements){
  if(!estConnecte() || !profilAAffichage()) return false;
  return enregistrerPreferences(changements);
}

async function enregistrerPreferences(changements){
  if(!estConnecte() || !profilAPreferences()) return false;
  const db = await clientSupabase();
  const { error } = await db.from('profils').update(changements).eq('id', membre.id);
  if(error) throw error;
  Object.assign(profil, changements);
  return true;
}

// ------------------------------------------------ photo de profil -------
//
// Une photo proposée part dans un dépôt PRIVÉ (« avatars-attente ») : seuls
// son auteur et l'administrateur la voient. Les autres membres ne la
// verront qu'une fois validée et recopiée dans le dépôt public.
const DEPOT_PHOTOS_ATTENTE = 'avatars-attente';
const DEPOT_PHOTOS = 'avatars';
const profilAPhoto = () => profil && 'photo_statut' in profil;

async function choisirAvatar(cle){
  if(cle !== null && !AVATARS.some(a => a.cle === cle)) throw new Error('Avatar inconnu.');
  return enregistrerPreferences({ avatar: cle });
}

async function proposerPhoto(blob){
  if(!estConnecte() || !profilAPhoto()) throw new Error("La photo de profil n'est pas encore disponible.");
  const db = await clientSupabase();
  const chemin = `${membre.id}/${Date.now()}.webp`;
  const { error } = await db.storage.from(DEPOT_PHOTOS_ATTENTE)
    .upload(chemin, blob, { contentType: 'image/webp', upsert: false });
  if(error) throw error;
  const ancienne = profil.photo_en_attente;
  await enregistrerPreferences({ photo_en_attente: chemin });
  // L'ancienne proposition n'a plus d'objet : on la retire du dépôt.
  if(ancienne) db.storage.from(DEPOT_PHOTOS_ATTENTE).remove([ancienne]).catch(() => {});
  await chargerProfil();   // le statut est recalculé par la base
}

// Le membre voit sa propre photo en attente, par un lien temporaire : le
// dépôt est privé, aucune adresse permanente n'existe.
async function lienPhotoEnAttente(){
  if(!profil?.photo_en_attente) return null;
  const db = await clientSupabase();
  const { data } = await db.storage.from(DEPOT_PHOTOS_ATTENTE).createSignedUrl(profil.photo_en_attente, 3600);
  return data?.signedUrl ?? null;
}

async function retirerPhoto(){
  if(!estConnecte() || !profilAPhoto()) return;
  const db = await clientSupabase();
  if(profil.photo_en_attente) await db.storage.from(DEPOT_PHOTOS_ATTENTE).remove([profil.photo_en_attente]).catch(() => {});
  const publique = /\/avatars\/([^?]+)/.exec(profil.photo_url ?? '');
  if(publique) await db.storage.from(DEPOT_PHOTOS).remove([decodeURIComponent(publique[1])]).catch(() => {});
  const { error } = await db.rpc('retirer_ma_photo');
  if(error) throw error;
  await chargerProfil();
}

// Le choix est retenu sur le compte ; à défaut : base pas encore mise à
// jour, sur l'appareil. Par défaut : activé.
const CLE_NOTIF_MESSAGES = 'pokeclasseur-notif-messages';
function notificationsVoulues(){
  if(profilAPreferences()) return profil.pref_notif_messages !== false;
  try{ return localStorage.getItem(CLE_NOTIF_MESSAGES) !== 'non'; }catch{ return true; }
}

async function enregistrerNotifications(voulu){
  try{ localStorage.setItem(CLE_NOTIF_MESSAGES, voulu ? 'oui' : 'non'); }catch{}
  return enregistrerPreferences({ pref_notif_messages: voulu });
}

// Une notification du navigateur quand le nombre de messages non lus
// augmente. Le dernier nombre annoncé est gardé : changer de page ne
// renotifie pas les mêmes messages. L'étiquette commune fait que deux
// onglets ouverts ne montrent qu'une seule notification.
const CLE_NON_LUS_ANNONCES = 'pokeclasseur-non-lus-annonces';
function prevenirNouveauxMessages(nombre){
  let annonces = 0;
  try{ annonces = Number(localStorage.getItem(CLE_NON_LUS_ANNONCES) ?? 0); }catch{}
  try{ localStorage.setItem(CLE_NON_LUS_ANNONCES, String(nombre)); }catch{}
  if(nombre <= annonces) return;
  if(!notificationsVoulues() || !('Notification' in window) || Notification.permission !== 'granted') return;
  // L'onglet regardé affiche déjà la pastille : inutile d'y ajouter une
  // fenêtre. On ne prévient que si personne ne regarde la page.
  if(document.visibilityState === 'visible') return;
  try{
    const n = new Notification('PokéClasseur', {
      body: nombre === 1 ? 'Tu as un nouveau message.' : `Tu as ${nombre} messages non lus.`,
      icon: 'images/jeux/tcg-pocket.png', tag: 'pokeclasseur-messages',
    });
    n.onclick = () => { window.focus(); window.location.href = 'discussions.html'; n.close(); };
  }catch(err){ console.warn('Notification refusée', err); }
}

// La pastille se tient à jour d'elle-même, sans qu'on ait à changer de page.
//
// Le rythme est lent à dessein : c'est une pastille de notification, pas une
// conversation. Vérifier plus souvent depuis chaque onglet ouvert
// solliciterait la base sans rien apporter : la page Discussions, elle, a
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
// La pastille des non-lus n'était mise en forme que sur la page des
// discussions : ailleurs, elle sortait en texte nu au milieu du lien. Le
// style voyage donc avec elle, pour toutes les pages qui l'affichent.
const STYLE_PASTILLE = `
  nav .pastille{display:inline-block;min-width:18px;padding:1px 5px;margin-left:6px;
                border-radius:9px;background:#A8431C;color:#F6EFEA;font-size:11px;
                font-weight:600;line-height:16px;text-align:center;vertical-align:1px;}
`;

function poserStylePastille(){
  if(document.getElementById('style-pastille')) return;
  document.head.appendChild(Object.assign(document.createElement('style'),
    { id: 'style-pastille', textContent: STYLE_PASTILLE }));
}

// univers.js réécrit les liens de la barre (« /discussions.html?u=pocket »)
// pour qu'ils retiennent l'univers choisi : un lien se reconnaît donc à sa
// page, pas à son adresse exacte. Chercher « a[href="discussions.html"] »
// ne trouvait plus rien, et la pastille des messages ne s'affichait plus.
function lienDeNav(page){
  return [...document.querySelectorAll('nav .navlinks a')].find(a => {
    try{ return new URL(a.getAttribute('href'), location.href).pathname.endsWith('/' + page); }
    catch{ return false; }
  }) ?? null;
}

function poserPastille(lien, nombre, titre){
  lien.querySelector('.pastille')?.remove();
  if(nombre > 0){
    lien.insertAdjacentHTML('beforeend',
      ` <span class="pastille" title="${titre}">${nombre > 99 ? '99+' : nombre}</span>`);
  }
}

async function afficherNonLus(){
  poserStylePastille();
  const lien = lienDeNav('discussions.html');
  if(lien){
    try{
      const nombre = await totalNonLus();
      prevenirNouveauxMessages(nombre);
      poserPastille(lien, nombre, nombre > 1 ? `${nombre} messages non lus` : 'Un message non lu');
    }catch(err){
      console.warn('Compte des non-lus indisponible', err);
    }
  }
  afficherReponsesNonLues();
}

// La pastille de l'onglet Communauté : les réponses arrivées dans les sujets
// que le membre a ouverts ou auxquels il a répondu (sujets_suivis, dans
// supabase/espace-communaute.sql). Tant que la base n'a pas la fonction, on
// cesse de la demander.
let reponsesIndisponibles = false;
async function afficherReponsesNonLues(){
  const lien = lienDeNav('communaute.html');
  if(!lien || reponsesIndisponibles || !estConnecte()) return;
  try{
    const db = await clientSupabase();
    const { data, error } = await db.rpc('reponses_non_lues');
    if(error) throw error;
    const nombre = Number(data) || 0;
    poserPastille(lien, nombre, nombre > 1 ? `${nombre} nouvelles réponses à tes sujets` : 'Une nouvelle réponse à tes sujets');
  }catch(err){
    if(['PGRST202', '42883'].includes(err?.code)) reponsesIndisponibles = true;
    else console.warn('Compte des réponses indisponible', err);
  }
}

// ------------------------------------------ suppression de son compte ----
//
// Le droit à l'effacement (RGPD, article 17) donne à chacun le droit de
// faire disparaître ses données. Un bouton vaut mieux qu'un courriel à
// traiter à la main : le membre n'attend pas, et rien ne se perd en route.
//
// Le travail se fait côté base, par la fonction « supprimer_mon_compte »
// (voir supabase/rgpd.sql). Elle efface la ligne du compte ; toutes les
// tables du site pointent dessus en cascade, si bien que le profil, les
// cartes, les conversations, les messages, les blocages, les signalements
// et les lectures s'en vont avec, sans qu'on puisse en oublier une.
async function supprimerMonCompte(){
  if(!estConnecte()) throw new Error('Aucune session ouverte.');

  const db = await clientSupabase();
  const { error } = await db.rpc('supprimer_mon_compte');
  if(error) throw error;

  // Le compte n'existe plus : la session en mémoire ne vaut plus rien, et
  // la collection gardée localement appartenait à quelqu'un qui n'est plus
  // là. On nettoie les deux avant de rendre la main.
  try{
    await db.auth.signOut();
  }catch(err){
    // La session est déjà invalide côté serveur : ce n'est pas un échec.
    console.warn('Déconnexion après suppression', err);
  }
  membre = null;
  profil = null;
  // La page du compte ne charge pas tags.js : on nomme la clé quand elle
  // n'est pas là, plutôt que d'y faire dépendre la suppression.
  const cleDesTags = typeof TAG_STORAGE_KEY === 'string' ? TAG_STORAGE_KEY : 'pokeclasseur_tags';
  try{
    localStorage.removeItem(cleDesTags);
    localStorage.removeItem(PSEUDO_EN_ATTENTE);
  }catch(err){ /* stockage refusé : rien à nettoyer */ }
}
