const TAGS = ['obt', 'rech', 'ech'];
const TAG_META = {
  obt:  { label: 'Obtenue' },
  rech: { label: 'Recherchée' },
  ech:  { label: 'Échangeable' },
};

const TAG_STORAGE_KEY = 'pokeclasseur_tags';
const tagState = {};

const emptyTagState = () => ({ obt:false, rech:false, ech:false });

function loadTags(){
  try{
    const saved = localStorage.getItem(TAG_STORAGE_KEY);
    if(saved) Object.assign(tagState, JSON.parse(saved));
  }catch(err){
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
  if(tag === 'ech' && raisonsParCarte.has(cardId)) return;
  if(!tagState[cardId]) tagState[cardId] = emptyTagState();
  tagState[cardId][tag] = !tagState[cardId][tag];
  saveTags();
  synchroniser(() => enregistrerCarte(cardId, tagState[cardId]));
}

function cartesDuLot(cards, tag){
  return tag === 'ech' ? cards.filter(c => !raisonNonEchangeable(c)) : cards;
}

function leLotRetire(cards, tag){
  const lot = cartesDuLot(cards, tag);
  return lot.length > 0 && lot.every(c => tagState[c.id]?.[tag]);
}

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

function synchroniser(envoi){
  if(typeof estConnecte !== 'function' || !estConnecte()) return;
  Promise.resolve()
    .then(envoi)
    .catch(err => {
      console.warn('Synchronisation en ligne impossible', err);
      if(typeof showSaveStatus === 'function') showSaveStatus('hors-ligne');
    });
}

const RARETES_NON_ECHANGEABLES = new Set(['Trois Étoiles', 'Couronne']);

const RAISON_PROMO   = "Les cartes Promo ne sont pas échangeables dans Pokemon TCG Pocket";
const RAISON_RARETE  = "Cette catégorie de carte n'est pas échangeable dans Pokemon TCG Pocket";

function raisonNonEchangeable(carte){
  if(!carte) return null;
  if(typeof universActuel === 'function' && universActuel().cle !== 'pocket') return null;
  if(/^P-[A-Z]-/.test(String(carte.id))) return RAISON_PROMO;
  if(RARETES_NON_ECHANGEABLES.has(carte.rarity)) return RAISON_RARETE;
  return null;
}

const raisonsParCarte = new Map();

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

function tagButtons(carte){
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
      return `<span class="ech-bloque" data-raison="${texte}" title="${texte}"><button class="tag-toggle ech bloque" disabled aria-label="${texte}">${pictogramme('ech')}</button></span>`;
    }
    return `<button class="tag-toggle ${tag} ${state[tag] ? 'active' : ''}" data-id="${c.id}" data-tag="${tag}" title="${TAG_META[tag].label}" aria-label="${TAG_META[tag].label}">${pictogramme(tag)}</button>`;
  }).join('');
}

async function confirmerMarquageGroupe(cartes, tag){
  const lot = cartesDuLot(cartes, tag);
  if(lot.length === 0) return false;

  const retrait = leLotRetire(lot, tag);
  const libelle = TAG_META[tag]?.label?.toLowerCase() ?? tag;
  const nombre = `<b>${lot.length} carte${lot.length > 1 ? 's' : ''}</b>`;
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
