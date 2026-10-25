let supabase = null;
let membre = null;
let profil = null;

let modeRecuperation = false;

const CONFIG_MANQUANTE = SUPABASE_URL.includes('REMPLACER');

async function clientSupabase(){
  if(supabase) return supabase;
  if(CONFIG_MANQUANTE) throw new Error("La base n'est pas encore configurée (voir supabase-config.js).");
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabase;
}

async function initCompte(){
  if(CONFIG_MANQUANTE) return null;

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

const AGE_MINIMUM = 15;

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
  const { data, error } = await db.rpc('mon_profil');
  if(error) console.warn('Profil illisible', error);
  profil = data?.[0] ?? null;
  return profil;
}

const PSEUDO_EN_ATTENTE = 'pokeclasseur_profil_en_attente';

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
    cgu_acceptees_le: cgu_acceptees_le ?? new Date().toISOString(),
    cgu_version: cgu_version ?? VERSION_CONDITIONS,
  });
  if(error){
    if(error.code === '23505') throw new Error('Ce pseudo est déjà utilisé.');
    throw error;
  }
  try{ localStorage.removeItem(PSEUDO_EN_ATTENTE); }catch(err){}
  await chargerProfil();
}

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

  const enAttente = pseudoEnAttente();
  if(!profil && enAttente){
    try{ await creerProfil(enAttente); }catch(err){ console.warn('Profil à reprendre', err); }
  }

  await fusionnerCollection();
  return membre;
}

function enRecuperation(){
  return modeRecuperation;
}

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

  modeRecuperation = false;
  membre = data.user;
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

async function definirLocalisation(commune){
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

  Object.entries(tagState).forEach(([carteId, etat]) => {
    if(!enLigne[carteId]) aRenvoyer.push([carteId, etat]);
  });

  saveTags();
  await enregistrerCartes(aRenvoyer);
}

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

  .menu-profil{position:relative;margin-left:12px}
  .menu-profil-bouton{display:inline-flex;align-items:center;gap:9px;background:none;border:0;cursor:pointer;
    color:var(--text-on-ink,#EDEAE0);font:inherit;font-size:14px;padding:6px 4px;border-radius:999px}
  .menu-profil-bouton .chevron{font-size:10px;opacity:.6;transition:transform .15s}
  .menu-profil-bouton .nom{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .menu-profil-liste{position:absolute;right:0;top:calc(100% + 6px);z-index:65;min-width:200px;
    padding:6px;border-radius:10px;background:var(--ink-soft,#20232A);
    border:1px solid rgba(var(--trait-rgb,237,234,224),0.14);box-shadow:0 14px 34px rgba(0,0,0,0.28);
    opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .12s,transform .12s,visibility .12s}
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
      <a role="menuitem" href="connexion.html"><span class="icone">${pictogramme('personne')}</span>Mon profil</a>
      <a role="menuitem" href="parametres.html"><span class="icone">${pictogramme('reglages')}</span>Paramètres</a>
      <hr>
      <button role="menuitem" type="button" class="deconnexion"><span class="icone">${pictogramme('sortie')}</span>Se déconnecter</button>
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

let modeleLienCompte = null;
function afficherEtatCompte(){
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

const avatarsConnus = new Map();
async function avatarsDe(ids){
  const manquants = [...new Set(ids)].filter(id => id && !avatarsConnus.has(id));
  if(manquants.length && estConnecte()){
    try{
      const db = await clientSupabase();
      const { data, error } = await db.from('profils').select('id, avatar, photo_url').in('id', manquants);
      if(!error) for(const p of data ?? []) avatarsConnus.set(p.id, p);
    }catch{ }
  }
  return avatarsConnus;
}

const profilAPreferences = () => profil && 'pref_theme' in profil;

function synchroniserTheme(){
  if(!profilAPreferences() || typeof choisirTheme !== 'function') return;
  if(profil.pref_theme && profil.pref_theme !== themeChoisi()) choisirTheme(profil.pref_theme);
}

const CLE_GRISER = 'pokeclasseur-griser-manquantes';
const profilAAffichage = () => profil && 'pref_vignettes' in profil;

function synchroniserAffichage(){
  if(!profilAAffichage()) return;
  if(typeof choisirAffichage === 'function')
    choisirAffichage({ vignettes: profil.pref_vignettes, contraste: !!profil.pref_contraste });
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
  if(ancienne) db.storage.from(DEPOT_PHOTOS_ATTENTE).remove([ancienne]).catch(() => {});
  await chargerProfil();
}

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

const CLE_NOTIF_MESSAGES = 'pokeclasseur-notif-messages';
function notificationsVoulues(){
  if(profilAPreferences()) return profil.pref_notif_messages !== false;
  try{ return localStorage.getItem(CLE_NOTIF_MESSAGES) !== 'non'; }catch{ return true; }
}

async function enregistrerNotifications(voulu){
  try{ localStorage.setItem(CLE_NOTIF_MESSAGES, voulu ? 'oui' : 'non'); }catch{}
  return enregistrerPreferences({ pref_notif_messages: voulu });
}

const CLE_NON_LUS_ANNONCES = 'pokeclasseur-non-lus-annonces';
function prevenirNouveauxMessages(nombre){
  let annonces = 0;
  try{ annonces = Number(localStorage.getItem(CLE_NON_LUS_ANNONCES) ?? 0); }catch{}
  try{ localStorage.setItem(CLE_NON_LUS_ANNONCES, String(nombre)); }catch{}
  if(nombre <= annonces) return;
  if(!notificationsVoulues() || !('Notification' in window) || Notification.permission !== 'granted') return;
  if(document.visibilityState === 'visible') return;
  try{
    const n = new Notification('PokéClasseur', {
      body: nombre === 1 ? 'Tu as un nouveau message.' : `Tu as ${nombre} messages non lus.`,
      icon: 'images/jeux/tcg-pocket.png', tag: 'pokeclasseur-messages',
    });
    n.onclick = () => { window.focus(); window.location.href = 'discussions.html'; n.close(); };
  }catch(err){ console.warn('Notification refusée', err); }
}

const DELAI_PASTILLE = 25000;
let suiviPastilleLance = false;

function suivreLesNonLus(){
  if(suiviPastilleLance) return;
  suiviPastilleLance = true;

  setInterval(() => {
    if(document.visibilityState === 'visible' && estConnecte()) afficherNonLus();
  }, DELAI_PASTILLE);

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible' && estConnecte()) afficherNonLus();
  });
}

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  nav .pastille{display:inline-block;min-width:18px;padding:1px 5px;border-radius:9px;background:#A8431C;color:#F6EFEA;font-size:11px;font-weight:600;line-height:16px;text-align:center;vertical-align:1px;}
`}));

async function totalNonLus(){
  const db = await clientSupabase();
  const { data, error } = await db.rpc('total_non_lus');
  if(error) throw error;
  return data ?? 0;
}

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

async function supprimerMonCompte(){
  if(!estConnecte()) throw new Error('Aucune session ouverte.');

  const db = await clientSupabase();
  const { error } = await db.rpc('supprimer_mon_compte');
  if(error) throw error;

  try{
    await db.auth.signOut();
  }catch(err){
    console.warn('Déconnexion après suppression', err);
  }
  membre = null;
  profil = null;
  const cleDesTags = typeof TAG_STORAGE_KEY === 'string' ? TAG_STORAGE_KEY : 'pokeclasseur_tags';
  try{
    localStorage.removeItem(cleDesTags);
    localStorage.removeItem(PSEUDO_EN_ATTENTE);
  }catch(err){ }
}
