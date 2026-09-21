// Tags de collection, partagés par toutes les pages : une carte marquée
// depuis la page d'une extension l'est aussi depuis la page d'un Pokémon.
// Tout est rangé dans la mémoire du navigateur, donc propre à cet appareil
// tant qu'il n'y a pas de comptes utilisateurs.

const TAGS = ['obt', 'rech', 'ech'];
const TAG_META = {
  obt:  { emoji: '✅', label: 'Obtenue' },
  rech: { emoji: '❤️', label: 'Recherchée' },
  ech:  { emoji: '🔁', label: 'Échangeable' },
};

const TAG_STORAGE_KEY = 'pokeclasseur_tags';
const tagState = {}; // { [cardId]: { obt: bool, rech: bool, ech: bool } }

const emptyTagState = () => ({ obt:false, rech:false, ech:false });

function loadTags(){
  try{
    const saved = localStorage.getItem(TAG_STORAGE_KEY);
    if(saved) Object.assign(tagState, JSON.parse(saved));
  }catch(err){
    // Navigation privée ou stockage refusé : on continue sans tags sauvegardés.
  }
}

function saveTags(){
  try{
    localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(tagState));
    if(typeof showSaveStatus === 'function') showSaveStatus('saved');
  }catch(err){
    console.warn('Échec de la sauvegarde des tags', err);
    if(typeof showSaveStatus === 'function') showSaveStatus('error');
  }
}

function toggleTag(cardId, tag){
  // L'affichage désactive déjà le bouton ; cette garde couvre les autres
  // chemins — marquage groupé, raccourci clavier, ou données héritées.
  if(tag === 'ech' && raisonsParCarte.has(cardId)) return;
  if(!tagState[cardId]) tagState[cardId] = emptyTagState();
  tagState[cardId][tag] = !tagState[cardId][tag];
  saveTags();
  synchroniser(() => enregistrerCarte(cardId, tagState[cardId]));
}

// Sur quelles cartes un marquage groupé va réellement porter. « Tout marquer
// échangeable » ne doit pas contourner la règle des cartes non échangeables.
function cartesDuLot(cards, tag){
  return tag === 'ech' ? cards.filter(c => !raisonNonEchangeable(c)) : cards;
}

// Un lot déjà entièrement marqué se démarque : c'est ce qui permet de
// défaire un clic malheureux aussi vite qu'il s'est fait.
function leLotRetire(cards, tag){
  const lot = cartesDuLot(cards, tag);
  return lot.length > 0 && lot.every(c => tagState[c.id]?.[tag]);
}

// Applique un tag à un lot de cartes — ou le retire si elles le portent déjà
// toutes.
function bulkToggleTag(cards, tag){
  cards = cartesDuLot(cards, tag);
  if(cards.length === 0) return;
  const allTagged = cards.every(c => tagState[c.id]?.[tag]);
  cards.forEach(c => {
    if(!tagState[c.id]) tagState[c.id] = emptyTagState();
    tagState[c.id][tag] = !allTagged;
  });
  saveTags();
  synchroniser(() => enregistrerCartes(cards.map(c => [c.id, tagState[c.id]])));
}

// Le marquage est d'abord enregistré dans le navigateur : l'envoi en ligne
// se fait ensuite, et son échec ne doit jamais faire perdre un tag ni
// interrompre la navigation.
function synchroniser(envoi){
  if(typeof estConnecte !== 'function' || !estConnecte()) return;
  Promise.resolve()
    .then(envoi)
    .catch(err => {
      console.warn('Synchronisation en ligne impossible', err);
      if(typeof showSaveStatus === 'function') showSaveStatus('hors-ligne');
    });
}

// --------------------------- ce qui ne s'échange pas dans TCG Pocket -----
//
// Le jeu interdit l'échange des cartes promotionnelles, des Trois Étoiles et
// des Couronne. Proposer de les marquer « échangeable » ferait espérer des
// échanges impossibles, et polluerait la mise en relation entre membres.
//
// Les marquer « recherchée » reste permis : on peut très bien vouloir une
// carte qu'on ne pourra jamais obtenir par échange.
//
// La liste s'arrête là, et c'est volontaire : les Deux Étoiles, les
// Chromatique et les Chromatique deux étoiles S'ÉCHANGENT. Elles ne le
// faisaient pas à une époque, ce qui rend l'erreur facile — ne les ajoute
// pas ici sans avoir revérifié dans le jeu.
//
// La règle ne vaut que pour l'univers Pocket. Le jeu physique n'a ni ces
// raretés ni cette contrainte — on n'y touche pas.

const RARETES_NON_ECHANGEABLES = new Set(['Trois Étoiles', 'Couronne']);

const RAISON_PROMO   = "Les cartes Promo ne sont pas échangeables dans Pokemon TCG Pocket";
const RAISON_RARETE  = "Cette catégorie de carte n'est pas échangeable dans Pokemon TCG Pocket";

function raisonNonEchangeable(carte){
  if(!carte) return null;
  if(typeof universActuel === 'function' && universActuel().cle !== 'pocket') return null;
  // « P-A-001 », « P-B-034 » : les extensions promotionnelles.
  if(/^P-[A-Z]-/.test(String(carte.id))) return RAISON_PROMO;
  if(RARETES_NON_ECHANGEABLES.has(carte.rarity)) return RAISON_RARETE;
  return null;
}

// Retenu au fil de l'affichage : le gestionnaire de clic ne connaît que
// l'identifiant d'une carte, pas sa rareté.
const raisonsParCarte = new Map();

// Un membre a pu marquer une de ces cartes « échangeable » avant que la règle
// existe. On efface ces marquages devenus faux — une fois par affichage, et
// non carte par carte, pour n'écrire qu'une seule fois en base.
const aNettoyer = new Set();
let nettoyagePrevu = false;

function prevoirNettoyage(){
  if(nettoyagePrevu) return;
  nettoyagePrevu = true;
  queueMicrotask(() => {
    nettoyagePrevu = false;
    const ids = [...aNettoyer];
    aNettoyer.clear();
    if(!ids.length) return;
    ids.forEach(id => { tagState[id].ech = false; });
    saveTags();
    synchroniser(() => enregistrerCartes(ids.map(id => [id, tagState[id]])));
  });
}

function echapperAttribut(texte){
  return String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Boutons de tag d'une vignette de carte.
function tagButtons(carte){
  // Les pages passent la carte entière ; un identifiant seul reste accepté,
  // mais la règle d'échange a besoin de la rareté pour s'appliquer.
  const c = typeof carte === 'string' ? { id: carte } : carte;
  const state = tagState[c.id] || emptyTagState();
  const raison = raisonNonEchangeable(c);

  if(raison){
    raisonsParCarte.set(c.id, raison);
    if(state.ech){ aNettoyer.add(c.id); prevoirNettoyage(); }
  }else{
    raisonsParCarte.delete(c.id);
  }

  return TAGS.map(tag => {
    if(tag === 'ech' && raison){
      const texte = echapperAttribut(raison);
      // Le bouton est désactivé, donc muet au clic. L'enveloppe, elle,
      // reçoit le clic et sert à expliquer pourquoi — sans quoi un visiteur
      // sur téléphone, qui n'a pas de survol, n'aurait aucune explication.
      return `<span class="ech-bloque" data-raison="${texte}" title="${texte}"><button class="tag-toggle ech bloque" disabled aria-label="${texte}">${TAG_META.ech.emoji}</button></span>`;
    }
    return `<button class="tag-toggle ${tag} ${state[tag] ? 'active' : ''}" data-id="${c.id}" data-tag="${tag}" title="${TAG_META[tag].label}" aria-label="${TAG_META[tag].label}">${TAG_META[tag].emoji}</button>`;
  }).join('');
}

// ------------------------------- confirmation d'un marquage groupé -------
//
// Les trois boutons « Marquer d'un coup » touchent cent cartes d'un clic.
// Cliqués par mégarde, ils obligeaient à repasser sur chaque carte pour
// défaire. On demande donc confirmation, en disant exactement ce qui va se
// passer : le nombre de cartes concernées, et dans quel sens.
//
// Une fenêtre à nous plutôt que celle du navigateur : celle-ci se traduit,
// se met aux couleurs du site, et certains navigateurs bloquent l'autre.

const STYLE_CONFIRMATION = `
  .confirmation{position:fixed;inset:0;z-index:75;display:flex;align-items:center;
                justify-content:center;padding:24px;background:rgba(10,11,13,0.72);
                opacity:0;transition:opacity .15s;}
  .confirmation.vue{opacity:1}
  .confirmation .boite{background:#15171B;border:1px solid rgba(237,234,224,0.14);
                       border-radius:10px;padding:22px 24px;max-width:420px;width:100%;
                       box-shadow:0 24px 60px rgba(0,0,0,0.55);
                       font-family:'IBM Plex Sans',sans-serif;}
  .confirmation h2{font-family:'Newsreader',serif;font-size:20px;font-weight:500;
                   color:var(--text-on-ink,#EDEAE0);margin:0 0 10px;}
  .confirmation p{font-size:13.5px;line-height:1.6;color:var(--text-on-ink-dim,#9B9E9C);margin:0}
  .confirmation p b{color:var(--text-on-ink,#EDEAE0);font-weight:600}
  .confirmation .boutons{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
  .confirmation button{font-family:inherit;font-size:13.5px;padding:9px 18px;border-radius:5px;
                       cursor:pointer;border:1px solid rgba(237,234,224,0.16);
                       background:transparent;color:var(--text-on-ink,#EDEAE0);transition:.12s;}
  .confirmation button:hover{background:rgba(237,234,224,0.07)}
  .confirmation button.principal{background:var(--gold,#C9A227);border-color:transparent;
                                 color:var(--ink,#15171B);font-weight:600;}
  .confirmation button.principal:hover{filter:brightness(1.1);background:var(--gold,#C9A227)}
  @media(max-width:520px){
    .confirmation .boutons{flex-direction:column-reverse}
    .confirmation button{width:100%;min-height:44px}
  }
  @media(prefers-reduced-motion:reduce){ .confirmation{transition:none} }
`;

function demanderConfirmation({ titre, message, action }){
  return new Promise(resolve => {
    if(!document.getElementById('style-confirmation')){
      const style = document.createElement('style');
      style.id = 'style-confirmation';
      style.textContent = STYLE_CONFIRMATION;
      document.head.appendChild(style);
    }

    const voile = document.createElement('div');
    voile.className = 'confirmation';
    voile.setAttribute('role', 'dialog');
    voile.setAttribute('aria-modal', 'true');
    voile.innerHTML = `
      <div class="boite">
        <h2>${titre}</h2>
        <p>${message}</p>
        <div class="boutons">
          <button class="annuler" type="button">Annuler</button>
          <button class="principal" type="button">${action}</button>
        </div>
      </div>`;

    const rendreLaMain = document.activeElement;
    function fermer(reponse){
      document.removeEventListener('keydown', auClavier);
      voile.classList.remove('vue');
      setTimeout(() => voile.remove(), 160);
      // Le focus revient au bouton d'où l'on vient : sans cela, il repartait
      // en haut de page et la navigation au clavier perdait le fil.
      if(rendreLaMain?.focus) rendreLaMain.focus();
      resolve(reponse);
    }
    function auClavier(e){
      if(e.key === 'Escape') fermer(false);
      // Entrée confirme : le bouton principal a le focus, mais on couvre
      // aussi le cas où il l'aurait perdu.
      if(e.key === 'Enter' && !e.target.classList?.contains('annuler')) fermer(true);
    }

    voile.querySelector('.annuler').addEventListener('click', () => fermer(false));
    voile.querySelector('.principal').addEventListener('click', () => fermer(true));
    // Cliquer à côté vaut annulation : c'est le geste de qui se ravise.
    voile.addEventListener('click', e => { if(e.target === voile) fermer(false); });
    document.addEventListener('keydown', auClavier);

    document.body.appendChild(voile);
    requestAnimationFrame(() => {
      voile.classList.add('vue');
      voile.querySelector('.principal').focus();
    });
  });
}

// Le libellé dit ce qui va arriver, pas ce qu'on demande : « Marquer les 105
// cartes comme obtenues » se relit avant de cliquer.
async function confirmerMarquageGroupe(cartes, tag){
  const lot = cartesDuLot(cartes, tag);
  if(lot.length === 0) return false;

  const retrait = leLotRetire(lot, tag);
  const libelle = TAG_META[tag]?.label?.toLowerCase() ?? tag;
  const nombre = `<b>${lot.length} carte${lot.length > 1 ? 's' : ''}</b>`;
  // Le décompte des cartes écartées se dit : sans quoi « 105 cartes » à
  // l'écran et 98 marquées passeraient pour une erreur.
  const ecartees = cartes.length - lot.length;
  const reserve = ecartees > 0
    ? ` ${ecartees} carte${ecartees > 1 ? 's' : ''} non échangeable${ecartees > 1 ? 's' : ''} `
      + `${ecartees > 1 ? 'sont écartées' : 'est écartée'} du lot.`
    : '';

  return demanderConfirmation({
    titre: retrait ? 'Retirer le marquage ?' : 'Marquer toutes ces cartes ?',
    message: retrait
      ? `Le marquage « ${libelle} » va être retiré de ${nombre}.${reserve}`
      : `${nombre} vont être marquées « ${libelle} ».${reserve}`,
    action: retrait ? 'Retirer' : 'Marquer',
  });
}
