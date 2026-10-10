// L'environnement d'administration, posé sur le site lui-même.
// =============================================================
//
// Il n'y a plus de page « Administrateur ». L'administrateur navigue sur le
// même site que tout le monde, et trouve, là où il en a besoin, de quoi
// modifier ce qu'il regarde : une carte sur sa vignette, une extension sur
// son en-tête, le logo d'une série sur son titre. Il n'a plus jamais à
// taper un identifiant — c'est le contexte qui le donne.
//
// Pour un visiteur ou un membre, ce fichier ne fait RIEN : il pose une
// question à la base, reçoit « non », et s'arrête. Aucun bouton n'est créé,
// aucune feuille de style posée, aucun script supplémentaire chargé.
//
// Mais ce fichier ne PROTÈGE rien, et c'est voulu. Un site statique livre
// tout son code au navigateur : quiconque le veut peut appeler ces
// fonctions. La protection est dans la base — elle refuse toute écriture
// dans « corrections », dans le stockage des visuels et dans la gestion des
// comptes à qui n'est pas administrateur — et supabase/securite-profils.sql
// empêche un membre de se déclarer administrateur. Si ce fichier
// disparaissait entièrement, rien ne serait moins sûr.

(() => {

const CLE_VUE_VISITEUR = 'pokeclasseur-vue-visiteur';
const CLE_CORRECTIONS = 'pokeclasseur-corrections';
// La version du site, lue sur ce script même, pour charger le tiroir avec
// le même tampon : sans lui, le navigateur pourrait servir un tiroir périmé
// depuis son cache.
const VERSION = (document.currentScript?.src.match(/[?&]v=([^&]+)/) ?? [])[1] ?? '';

const univers = () => (typeof universActuel === 'function'
  ? universActuel().cle
  : (document.documentElement.dataset.univers || 'physique'));

const echapper = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ----------------------------------------------------------- démarrage ---

async function demarrer(){
  if(typeof verifierAdmin !== 'function') return;
  const etat = await verifierAdmin();
  if(!etat.admin) return;          // visiteur ou membre : on s'arrête là

  document.documentElement.dataset.admin = 'oui';
  poserStyle();
  appliquerVue(vueVisiteur());
  poserBarre();
  decorer();
  // Les pages redessinent leur contenu à chaque filtre, recherche ou
  // changement d'univers : on décore à mesure, au lieu d'une seule fois.
  new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
}

let prevu = null;
function planifier(){
  if(prevu) return;
  prevu = requestAnimationFrame(() => { prevu = null; decorer(); });
}

// ------------------------------------------- les deux environnements ----
//
// « Voir comme un visiteur » retire tout ce qui est propre à
// l'administration, pour vérifier ce que voit réellement un membre. Le
// réglage est gardé d'une page à l'autre : il s'agit d'une manière de
// regarder le site, pas d'un geste ponctuel.

function vueVisiteur(){
  try{ return localStorage.getItem(CLE_VUE_VISITEUR) === 'oui'; }catch{ return false; }
}
function appliquerVue(visiteur){
  document.documentElement.dataset.vueVisiteur = visiteur ? 'oui' : 'non';
  try{ localStorage.setItem(CLE_VUE_VISITEUR, visiteur ? 'oui' : 'non'); }catch{}
  const bascule = document.getElementById('admin-bascule');
  if(bascule){
    bascule.setAttribute('aria-pressed', String(visiteur));
    bascule.textContent = visiteur ? 'Revenir en mode administrateur' : 'Voir comme un visiteur';
  }
}

function poserBarre(){
  if(document.getElementById('admin-barre')) return;
  const barre = document.createElement('div');
  barre.id = 'admin-barre';
  barre.setAttribute('role', 'region');
  barre.setAttribute('aria-label', 'Outils d\'administration');
  barre.innerHTML = `
    <span class="admin-insigne" aria-hidden="true">◆</span>
    <span class="admin-libelle">Mode administrateur</span>
    <button type="button" class="admin-outil" data-tiroir="corrections">Corrections</button>
    <button type="button" class="admin-outil" data-tiroir="comptes">Comptes</button>
    <button type="button" id="admin-bascule" class="admin-outil admin-bascule" aria-pressed="false">
      Voir comme un visiteur</button>`;
  document.body.appendChild(barre);
  barre.querySelector('#admin-bascule').onclick = () => appliquerVue(!vueVisiteur());
  barre.querySelectorAll('[data-tiroir]').forEach(b =>
    b.onclick = () => ouvrirLeTiroir(b.dataset.tiroir));
  appliquerVue(vueVisiteur());
}

// Le tiroir — comptes, corrections — n'est chargé qu'à la demande : la
// plupart des pages ouvertes par l'administrateur n'en ont pas besoin.
let tiroirCharge = null;
async function ouvrirLeTiroir(onglet){
  tiroirCharge ??= new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'admin-tiroir.js' + (VERSION ? `?v=${VERSION}` : '');
    s.onload = ok;
    s.onerror = () => { tiroirCharge = null; ko(new Error('Tiroir introuvable')); };
    document.head.appendChild(s);
  });
  try{
    await tiroirCharge;
    window.ouvrirTiroirAdmin(onglet);
  }catch(err){
    alert(`Impossible d'ouvrir le tiroir : ${err.message}`);
  }
}

// ---------------------------------------------------------- décorer -----
//
// Chaque élément n'est décoré qu'une fois : on le marque. Sans cette marque,
// chaque passage de l'observateur ajouterait un bouton de plus.

function decorer(){
  decorerLesCartes();
  decorerLEnTeteDExtension();
  ajouterLaTuileDAjout();
  decorerLesSeries();
  ajouterLeBoutonDExtension();
}

function bouton(classe, libelle, titre){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `admin-editer ${classe}`;
  b.innerHTML = libelle;
  b.title = titre;
  b.setAttribute('aria-label', titre);
  return b;
}

function decorerLesCartes(){
  document.querySelectorAll('.card-tile[data-carte]:not([data-admin-decore])').forEach(tuile => {
    tuile.dataset.adminDecore = '1';
    const zone = tuile.querySelector('.card-img-wrap') ?? tuile;
    const b = bouton('admin-sur-carte', '✎', `Modifier la carte ${tuile.dataset.nom || tuile.dataset.carte}`);
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); modifierUneCarte(tuile); };
    zone.appendChild(b);
  });
}

function decorerLEnTeteDExtension(){
  const tete = document.getElementById('page-head');
  if(!tete?.dataset.extension || tete.querySelector('.admin-sur-extension')) return;
  const b = bouton('admin-sur-extension', '✎ Modifier l\'extension', `Modifier l'extension ${tete.dataset.nom}`);
  b.onclick = () => modifierUneExtension(tete);
  tete.appendChild(b);
}

function ajouterLaTuileDAjout(){
  const tete = document.getElementById('page-head');
  const grille = document.querySelector('#content .card-grid');
  if(!tete?.dataset.extension || !grille || grille.querySelector('.admin-ajout-carte')) return;
  const tuile = document.createElement('button');
  tuile.type = 'button';
  tuile.className = 'admin-editer admin-ajout-carte';
  tuile.innerHTML = '<span aria-hidden="true">+</span><span>Ajouter une carte</span>';
  tuile.onclick = () => ajouterUneCarte(tete, grille);
  grille.appendChild(tuile);
}

function decorerLesSeries(){
  // Seul le TCG physique affiche un logo de série : côté Pocket, un
  // remplacement serait enregistré sans rien changer à l'écran.
  if(univers() === 'pocket') return;
  document.querySelectorAll('.series-block[data-serie]:not([data-admin-decore])').forEach(bloc => {
    bloc.dataset.adminDecore = '1';
    const titre = bloc.querySelector('.series-title');
    if(!titre) return;
    const b = bouton('admin-sur-serie', '✎ Logo', `Changer le logo de la série ${bloc.dataset.serie}`);
    // Le titre d'une série replie et déplie son bloc : le clic sur le
    // bouton ne doit pas le faire en plus.
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); changerLeLogoDeSerie(bloc); };
    titre.appendChild(b);
  });
}

function ajouterLeBoutonDExtension(){
  const contenu = document.getElementById('content');
  const premiere = contenu?.querySelector('.series-block');
  if(!premiere || contenu.querySelector('.admin-ajout-extension')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'admin-editer admin-ajout-extension';
  b.textContent = '+ Ajouter une extension';
  b.onclick = ajouterUneExtension;
  contenu.insertBefore(b, premiere);
}

// --------------------------------------------- la fenêtre de saisie -----
//
// Une seule fenêtre pour toutes les modifications. <dialog> apporte de
// lui-même ce qu'une fenêtre modale exige : le focus enfermé dedans, la
// touche Échap pour fermer, et le reste de la page inerte.

function champHTML({ nom, etiquette, type = 'text', valeur = '', aide = '', obligatoire = false, options }){
  const id = `admin-champ-${nom}`;
  const saisie = options
    ? `<select id="${id}" name="${nom}">${options.map(o =>
        `<option value="${echapper(o)}" ${o === valeur ? 'selected' : ''}>${echapper(o)}</option>`).join('')}</select>`
    : type === 'file'
      ? `<input id="${id}" name="${nom}" type="file" accept="image/webp,image/png,image/jpeg">`
      : `<input id="${id}" name="${nom}" type="${type}" value="${echapper(valeur)}" ${obligatoire ? 'required' : ''}>`;
  return `<label class="admin-champ" for="${id}">
      <span>${etiquette}${obligatoire ? ' <b aria-hidden="true">*</b>' : ''}</span>
      ${saisie}
      ${aide ? `<span class="admin-aide">${aide}</span>` : ''}
    </label>`;
}

// Renvoie une promesse résolue à la fermeture. `enregistrer` reçoit les
// valeurs saisies et le fichier éventuel ; s'il lève une erreur, la
// fenêtre reste ouverte et l'affiche.
function fenetre({ titre, intro = '', apercu = '', champs, action = 'Enregistrer', enregistrer, annexe = '' }){
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'admin-fenetre';
    d.innerHTML = `
      <form method="dialog" novalidate>
        <h2>${titre}</h2>
        ${intro ? `<p class="admin-intro">${intro}</p>` : ''}
        <div class="admin-corps">
          ${apercu ? `<div class="admin-apercu">${apercu}</div>` : ''}
          <div class="admin-champs">${champs.map(champHTML).join('')}</div>
        </div>
        ${annexe}
        <p class="admin-msg" role="status" hidden></p>
        <div class="admin-boutons">
          <button type="button" class="admin-annuler">Annuler</button>
          <button type="submit" class="admin-valider">${action}</button>
        </div>
      </form>`;
    document.body.appendChild(d);

    const msg = d.querySelector('.admin-msg');
    const dire = (texte, ok) => { msg.hidden = false; msg.className = `admin-msg ${ok ? 'ok' : 'ko'}`; msg.textContent = texte; };
    const fermer = r => { d.close(); d.remove(); resolve(r); };

    d.querySelector('.admin-annuler').onclick = () => fermer(false);
    d.addEventListener('cancel', e => { e.preventDefault(); fermer(false); });
    d.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const valider = d.querySelector('.admin-valider');
      const valeurs = {};
      for(const c of champs){
        if(c.type === 'file') continue;
        valeurs[c.nom] = d.querySelector(`[name="${c.nom}"]`)?.value.trim() ?? '';
        if(c.obligatoire && !valeurs[c.nom]){ dire(`« ${c.etiquette} » est obligatoire.`); return; }
      }
      const fichier = d.querySelector('input[type="file"]')?.files?.[0] ?? null;
      valider.disabled = true;
      try{
        const rien = await enregistrer(valeurs, fichier, dire);
        if(rien === 'rien'){ dire('Rien n\'a changé.', true); valider.disabled = false; return; }
        dire('Enregistré. La page se recharge pour l\'afficher…', true);
        recharger();
      }catch(err){
        dire(`Échec : ${err.message}`);
        valider.disabled = false;
      }
    });

    // Retirer une correction depuis la fenêtre même : une erreur doit
    // pouvoir se défaire là où elle a été commise.
    d.querySelectorAll('[data-retirer]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try{
        await supprimerCorrection(Number(b.dataset.retirer));
        dire('Correction retirée. La page se recharge…', true);
        recharger();
      }catch(err){ dire(`Échec : ${err.message}`); b.disabled = false; }
    });

    d.showModal();
    d.querySelector('input:not([type="file"]), select')?.focus();
  });
}

// Le catalogue garde les corrections le temps d'une visite. Sans ce
// nettoyage, on ne verrait son propre changement qu'au prochain onglet.
function recharger(){
  try{ sessionStorage.removeItem(CLE_CORRECTIONS); }catch{}
  setTimeout(() => location.reload(), 700);
}

// ------------------------------------------------ fusionner, pas écraser --
//
// Une correction est unique par univers, genre et cible : en enregistrer une
// nouvelle REMPLACE l'ancienne en entier. Corriger seulement la rareté d'une
// carte dont on avait déjà corrigé le nom effacerait donc la correction du
// nom. On part toujours de ce qui existe.

async function correctionsDe(cible, genres){
  const toutes = await listerCorrections();
  return toutes.filter(c => c.univers === univers() && c.cible === cible && genres.includes(c.genre));
}

async function enregistrerEnFusionnant({ genre, cible, changements, image_chemin = null }){
  const [existante] = await correctionsDe(cible, [genre]);
  await enregistrerCorrection({
    univers: univers(), genre, cible,
    donnees: { ...(existante?.donnees ?? {}), ...changements },
    image_chemin: image_chemin ?? existante?.image_chemin ?? null,
  });
}

// N'envoyer que ce qui a changé. Envoyer tous les champs préremplis
// figerait aussi ceux qu'on n'a pas touchés : le jour où la source
// corrigerait un nom, notre copie l'en empêcherait.
function changementsEntre(avant, apres, nombres = []){
  const c = {};
  for(const [cle, v] of Object.entries(apres)){
    if(v === '' || v === String(avant[cle] ?? '')) continue;
    c[cle] = nombres.includes(cle) ? Number(v) : v;
  }
  return c;
}

const libelleGenre = g => ({ visuel: 'visuel', carte: 'nom, rareté ou Pokédex',
  extension: 'informations', 'logo-extension': 'logo', 'logo-serie': 'logo' })[g] ?? g;

function blocCorrectionsEnPlace(corrections){
  if(!corrections.length) return '';
  return `<div class="admin-en-place">
      <p>Corrections déjà en place sur cet élément :</p>
      <ul>${corrections.map(c => `
        <li><span>${libelleGenre(c.genre)} — ${new Date(c.cree_le).toLocaleDateString('fr-FR')}</span>
            <button type="button" class="admin-retirer" data-retirer="${c.id}">Retirer</button></li>`).join('')}
      </ul>
    </div>`;
}

const apercuImage = src => src
  ? `<img src="${echapper(src)}" alt="Visuel actuel">`
  : '<div class="admin-sans-visuel">Aucun visuel</div>';

// ------------------------------------------------------------- cartes ---

async function modifierUneCarte(tuile){
  const id = tuile.dataset.carte;
  const avant = { name: tuile.dataset.nom, rarity: tuile.dataset.rarete, dexId: tuile.dataset.dex };
  const enPlace = await correctionsDe(id, ['visuel', 'carte']).catch(() => []);
  await fenetre({
    titre: `Modifier ${echapper(avant.name || id)}`,
    intro: `Carte <code>${echapper(id)}</code>. Ne change que ce que tu veux corriger : un champ laissé tel quel n'est pas enregistré.`,
    apercu: apercuImage(tuile.querySelector('img')?.src),
    champs: [
      { nom: 'name', etiquette: 'Nom français', valeur: avant.name },
      { nom: 'rarity', etiquette: 'Rareté', valeur: avant.rarity, aide: 'Par exemple : Un Diamant, Deux Étoiles, Couronne.' },
      { nom: 'dexId', etiquette: 'Numéro du Pokémon', type: 'number', valeur: avant.dexId,
        aide: 'Numéro au Pokédex national : rattache la carte à sa page Pokémon.' },
      { nom: 'fichier', etiquette: 'Remplacer le visuel', type: 'file', aide: 'WebP, PNG ou JPEG, 5 Mo maximum.' },
    ],
    annexe: blocCorrectionsEnPlace(enPlace),
    enregistrer: async (v, fichier, dire) => {
      const changements = changementsEntre(avant, v, ['dexId']);
      if(!fichier && !Object.keys(changements).length) return 'rien';
      if(fichier){
        dire('Envoi de l\'image…', true);
        const chemin = await televerserVisuel(id, fichier);
        await enregistrerCorrection({ univers: univers(), genre: 'visuel', cible: id, image_chemin: chemin });
      }
      if(Object.keys(changements).length)
        await enregistrerEnFusionnant({ genre: 'carte', cible: id, changements });
    },
  });
}

async function ajouterUneCarte(tete, grille){
  const setId = tete.dataset.extension;
  // Le numéro suit la forme des cartes déjà là : « 001 » si l'extension
  // écrit ses numéros sur trois chiffres, « 1 » sinon. Sinon la carte
  // ajoutée ne se rangerait pas avec les autres.
  const exemple = grille.querySelector('.card-tile[data-local]')?.dataset.local ?? '';
  const largeur = /^0\d/.test(exemple) ? exemple.length : 0;
  await fenetre({
    titre: `Ajouter une carte à ${echapper(tete.dataset.nom || setId)}`,
    intro: 'Pour une carte absente de cette extension.',
    champs: [
      { nom: 'numero', etiquette: 'Numéro dans l\'extension', obligatoire: true,
        aide: largeur ? `Sur ${largeur} chiffres, comme les autres cartes de l'extension.` : '' },
      { nom: 'name', etiquette: 'Nom français', obligatoire: true },
      { nom: 'rarity', etiquette: 'Rareté' },
      { nom: 'dexId', etiquette: 'Numéro du Pokémon', type: 'number' },
      { nom: 'fichier', etiquette: 'Visuel (facultatif)', type: 'file' },
    ],
    action: 'Ajouter la carte',
    enregistrer: async (v, fichier, dire) => {
      const numero = largeur ? v.numero.padStart(largeur, '0') : v.numero;
      const cible = `${setId}-${numero}`;
      if(grille.querySelector(`.card-tile[data-carte="${CSS.escape(cible)}"]`))
        throw new Error(`La carte ${cible} existe déjà : modifie-la plutôt avec son bouton ✎.`);
      let chemin = null;
      if(fichier){ dire('Envoi de l\'image…', true); chemin = await televerserVisuel(cible, fichier); }
      const donnees = { ajout: true, localId: String(Number(numero) || numero), name: v.name };
      if(v.rarity) donnees.rarity = v.rarity;
      if(v.dexId) donnees.dexId = Number(v.dexId);
      await enregistrerCorrection({ univers: univers(), genre: 'carte', cible, donnees, image_chemin: chemin });
    },
  });
}

// --------------------------------------------------------- extensions ---

async function modifierUneExtension(tete){
  const id = tete.dataset.extension;
  const avant = { name: tete.dataset.nom, serieNom: tete.dataset.serie, dateSortie: tete.dataset.date };
  const enPlace = await correctionsDe(id, ['extension', 'logo-extension']).catch(() => []);
  await fenetre({
    titre: `Modifier ${echapper(avant.name || id)}`,
    intro: `Extension <code>${echapper(id)}</code>. Ne change que ce que tu veux corriger.`,
    apercu: apercuImage(tete.querySelector('img.logo-extension')?.src),
    champs: [
      { nom: 'name', etiquette: 'Nom français', valeur: avant.name },
      { nom: 'serieNom', etiquette: 'Série', valeur: avant.serieNom,
        aide: 'Range l\'extension dans « Par extension ». À écrire exactement comme le titre de la série.' },
      { nom: 'dateSortie', etiquette: 'Date de sortie', type: 'date', valeur: avant.dateSortie },
      { nom: 'fichier', etiquette: 'Remplacer le logo', type: 'file' },
    ],
    annexe: blocCorrectionsEnPlace(enPlace),
    enregistrer: async (v, fichier, dire) => {
      const changements = changementsEntre(avant, v);
      if(!fichier && !Object.keys(changements).length) return 'rien';
      if(fichier){
        dire('Envoi du logo…', true);
        const chemin = await televerserVisuel(id, fichier);
        await enregistrerCorrection({ univers: univers(), genre: 'logo-extension', cible: id, image_chemin: chemin });
      }
      if(Object.keys(changements).length)
        await enregistrerEnFusionnant({ genre: 'extension', cible: id, changements });
    },
  });
}

async function ajouterUneExtension(){
  // Les séries existantes, lues sur la page : on choisit au lieu de
  // recopier un nom au caractère près.
  const series = [...document.querySelectorAll('.series-block[data-serie]')].map(b => b.dataset.serie);
  await fenetre({
    titre: 'Ajouter une extension',
    intro: 'Pour une extension qu\'aucune source ne publie encore. Elle apparaîtra dans sa série, prête à recevoir ses cartes.',
    champs: [
      { nom: 'cible', etiquette: 'Identifiant', obligatoire: true, aide: 'Court, sans espace — par exemple B5. Il figurera dans l\'adresse de la page.' },
      { nom: 'name', etiquette: 'Nom français', obligatoire: true },
      { nom: 'serieNom', etiquette: 'Série', options: series, valeur: series[0] },
      { nom: 'dateSortie', etiquette: 'Date de sortie', type: 'date' },
      { nom: 'cardCount', etiquette: 'Nombre de cartes annoncé', type: 'number' },
      { nom: 'fichier', etiquette: 'Logo (facultatif)', type: 'file' },
    ],
    action: 'Ajouter l\'extension',
    enregistrer: async (v, fichier, dire) => {
      if(/\s/.test(v.cible)) throw new Error('L\'identifiant ne doit pas contenir d\'espace.');
      let chemin = null;
      if(fichier){ dire('Envoi du logo…', true); chemin = await televerserVisuel(v.cible, fichier); }
      const donnees = { name: v.name, serieNom: v.serieNom };
      if(v.dateSortie) donnees.dateSortie = v.dateSortie;
      if(v.cardCount) donnees.cardCount = Number(v.cardCount);
      await enregistrerCorrection({ univers: univers(), genre: 'extension', cible: v.cible, donnees, image_chemin: chemin });
    },
  });
}

// ------------------------------------------------------------- séries ---

async function changerLeLogoDeSerie(bloc){
  const nom = bloc.dataset.serie;
  const enPlace = await correctionsDe(nom, ['logo-serie']).catch(() => []);
  await fenetre({
    titre: `Logo de la série ${echapper(nom)}`,
    apercu: apercuImage(bloc.querySelector('img.logo-serie')?.src),
    champs: [{ nom: 'fichier', etiquette: 'Nouveau logo', type: 'file', aide: 'WebP, PNG ou JPEG, 5 Mo maximum.' }],
    annexe: blocCorrectionsEnPlace(enPlace),
    action: 'Remplacer le logo',
    enregistrer: async (v, fichier, dire) => {
      if(!fichier) return 'rien';
      dire('Envoi du logo…', true);
      // Une série n'a pas d'identifiant : son nom la désigne. On le prend
      // sur la page, donc exactement tel qu'il s'affiche.
      const chemin = await televerserVisuel(nom.replace(/[^\w-]+/g, '_'), fichier);
      await enregistrerCorrection({ univers: univers(), genre: 'logo-serie', cible: nom, image_chemin: chemin });
    },
  });
}

// ------------------------------------------------------------- style ----
//
// Tout est rangé sous html[data-admin="oui"], posé seulement pour
// l'administrateur : un visiteur ne reçoit même pas ces règles. Et la vue
// « visiteur » masque tout d'une seule ligne.

function poserStyle(){
  if(document.getElementById('admin-site-style')) return;
  const s = document.createElement('style');
  s.id = 'admin-site-style';
  s.textContent = `
  html[data-vue-visiteur="oui"] .admin-editer{display:none !important}
  html[data-vue-visiteur="oui"] #admin-barre [data-tiroir],
  html[data-vue-visiteur="oui"] #admin-barre .admin-libelle{display:none}

  #admin-barre{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9000;
    display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;
    max-width:calc(100vw - 32px);padding:8px 10px 8px 14px;border-radius:999px;
    background:#15171B;color:#EDEAE0;border:1px solid rgba(201,162,39,.55);
    box-shadow:0 8px 28px rgba(0,0,0,.4);font-size:13.5px}
  #admin-barre .admin-insigne{color:#C9A227}
  #admin-barre .admin-libelle{font-weight:600;margin-right:4px}
  #admin-barre .admin-outil{background:rgba(255,255,255,.06);color:#EDEAE0;cursor:pointer;
    border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:6px 12px;font:inherit;min-height:34px}
  #admin-barre .admin-outil:hover{border-color:rgba(201,162,39,.6)}
  #admin-barre .admin-bascule[aria-pressed="true"]{background:rgba(201,162,39,.18);border-color:#C9A227}
  html[data-vue-visiteur="oui"] #admin-barre{padding:6px;opacity:.85}

  .admin-editer{font:inherit;cursor:pointer}
  .card-img-wrap{position:relative}
  .admin-sur-carte{position:absolute;top:6px;right:6px;z-index:3;width:34px;height:34px;
    border-radius:50%;border:1px solid rgba(201,162,39,.7);background:rgba(21,23,27,.86);
    color:#E3C766;font-size:16px;line-height:1;opacity:.82;transition:opacity .15s,transform .15s}
  .card-tile:hover .admin-sur-carte,.admin-sur-carte:focus-visible{opacity:1;transform:scale(1.06)}
  .admin-sur-extension,.admin-sur-serie,.admin-ajout-extension{
    border:1px solid rgba(201,162,39,.6);background:rgba(201,162,39,.1);color:#E3C766;
    border-radius:999px;padding:7px 14px;font-size:13px;min-height:36px}
  .admin-sur-extension{align-self:flex-start;margin-left:auto}
  .admin-sur-serie{margin-left:auto;padding:4px 11px;min-height:30px}
  .admin-ajout-extension{display:block;margin:0 0 18px}
  .admin-ajout-carte{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
    min-height:220px;border:2px dashed rgba(201,162,39,.5);border-radius:12px;background:rgba(201,162,39,.05);
    color:#E3C766;font-size:14px}
  .admin-ajout-carte span:first-child{font-size:34px;line-height:1}

  .admin-fenetre{border:1px solid rgba(201,162,39,.45);border-radius:14px;padding:0;
    background:#1B1E24;color:#EDEAE0;width:min(620px,calc(100vw - 32px));max-height:calc(100vh - 48px)}
  .admin-fenetre::backdrop{background:rgba(0,0,0,.6)}
  .admin-fenetre form{padding:22px 22px 18px;display:flex;flex-direction:column;gap:12px}
  .admin-fenetre h2{margin:0;font-size:19px}
  .admin-intro{margin:0;font-size:13.5px;color:#B9BCB9;line-height:1.55}
  .admin-intro code{background:rgba(255,255,255,.07);padding:1px 6px;border-radius:4px}
  .admin-corps{display:flex;gap:18px;align-items:flex-start}
  .admin-apercu{flex:0 0 140px}
  .admin-apercu img{width:140px;border-radius:8px;display:block}
  .admin-sans-visuel{width:140px;aspect-ratio:63/88;display:grid;place-items:center;border-radius:8px;
    border:1px dashed rgba(255,255,255,.2);color:#9B9E9C;font-size:12.5px}
  .admin-champs{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px}
  .admin-champ{display:flex;flex-direction:column;gap:5px}
  .admin-champ > span:first-child{font-size:13px;color:#B9BCB9}
  .admin-champ b{color:#E3C766}
  .admin-champ input,.admin-champ select{background:rgba(255,255,255,.05);color:#EDEAE0;font:inherit;
    border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:9px 11px;min-height:42px}
  .admin-champ input:focus,.admin-champ select:focus{outline:2px solid rgba(201,162,39,.7);outline-offset:1px}
  .admin-aide{font-size:12px;color:#9B9E9C;line-height:1.5}
  .admin-en-place{border-top:1px solid rgba(255,255,255,.1);padding-top:10px;font-size:13px}
  .admin-en-place p{margin:0 0 6px;color:#B9BCB9}
  .admin-en-place ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
  .admin-en-place li{display:flex;justify-content:space-between;align-items:center;gap:10px}
  .admin-retirer{background:none;border:1px solid rgba(168,67,28,.6);color:#E7A88E;border-radius:6px;
    padding:4px 10px;cursor:pointer;font:inherit;font-size:12.5px}
  .admin-msg{margin:0;padding:10px 12px;border-radius:8px;font-size:13.5px}
  .admin-msg.ok{background:rgba(31,111,99,.22);border:1px solid rgba(31,111,99,.5)}
  .admin-msg.ko{background:rgba(168,67,28,.2);border:1px solid rgba(168,67,28,.55)}
  .admin-boutons{display:flex;justify-content:flex-end;gap:10px;margin-top:4px}
  .admin-annuler{background:none;border:1px solid rgba(255,255,255,.2);color:#B9BCB9;
    border-radius:8px;padding:9px 16px;cursor:pointer;font:inherit;min-height:42px}
  .admin-valider{background:#1F6F63;color:#fff;border:0;border-radius:8px;padding:9px 18px;
    cursor:pointer;font:inherit;font-weight:600;min-height:42px}
  .admin-valider[disabled]{opacity:.55;cursor:default}
  @media (max-width:560px){
    .admin-corps{flex-direction:column}
    .admin-apercu{flex:none;align-self:center}
    #admin-barre{border-radius:14px;bottom:10px}
  }
  @media (prefers-reduced-motion:reduce){ .admin-sur-carte{transition:none} }`;
  document.head.appendChild(s);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
else demarrer();

})();
