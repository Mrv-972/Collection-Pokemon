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
  if(!tagState[cardId]) tagState[cardId] = emptyTagState();
  tagState[cardId][tag] = !tagState[cardId][tag];
  saveTags();
  synchroniser(() => enregistrerCarte(cardId, tagState[cardId]));
}

// Applique un tag à un lot de cartes — ou le retire si elles le portent déjà
// toutes, pour qu'un clic malheureux se défasse aussi vite qu'il s'est fait.
function bulkToggleTag(cards, tag){
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

// Boutons de tag d'une vignette de carte.
function tagButtons(cardId){
  const state = tagState[cardId] || emptyTagState();
  return TAGS.map(tag => `<button class="tag-toggle ${tag} ${state[tag] ? 'active' : ''}" data-id="${cardId}" data-tag="${tag}" title="${TAG_META[tag].label}" aria-label="${TAG_META[tag].label}">${TAG_META[tag].emoji}</button>`).join('');
}
