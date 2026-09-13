// Outils communs aux pages qui affichent une grille de cartes (page d'une
// extension, page d'un Pokémon) : accès à l'API TCGdex, raretés et images.

async function fetchJson(url, retries = 1){
  const res = await fetch(url);
  const text = await res.text();
  if(!res.ok || !text){
    if(retries > 0){
      await new Promise(r => setTimeout(r, 1200));
      return fetchJson(url, retries - 1);
    }
    throw new Error(`Réponse vide ou erreur HTTP ${res.status}.`);
  }
  return JSON.parse(text);
}

// Symboles imprimés sur les cartes, associés aux raretés telles que TCGdex
// les nomme en français. Les raretés récentes (Illustration rare, Hyper
// rare...) n'ont pas de symbole unique standardisé : on leur attribue le
// nombre d'étoiles le plus proche de l'usage courant chez les collectionneurs.
const RARITY_SYMBOLS = {
  'Sans Rareté': '',
  'Commune': '●',
  'Peu Commune': '◆',
  'Rare': '★',
  'Rare Holo': '★',
  'Holo Rare': '★',
  'Rare Noir Blanc': '★',
  'Rare Prime': '★★',
  'Rare Holo LV.X': '★★',
  'LÉGENDE': '★★',
  'Magnifique': '★★',
  'Magnifique rare': '★★',
  'Radieux Rare': '★★',
  'Collection Classique': '★★',
  'HIGH-TECH rare': '★★',
  'Holo Rare V': '★★',
  'Holo Rare VMAX': '★★',
  'Holo Rare VSTAR': '★★',
  'Double rare': '★★',
  'Shiny rare': '★★',
  'Shiny rare V': '★★',
  'Shiny rare VMAX': '★★',
  'Ultra Rare': '★★★',
  'Dresseur Full Art': '★★★',
  'Illustration rare': '★★★',
  'Chromatique ultra rare': '★★★',
  'Illustration spéciale rare': '★★★★',
  'Hyper rare': '★★★★',
  'Méga Hyper Rare': '★★★★',
  'Promo': '✦',
};

function raritySymbol(rarity){
  if(!rarity) return '';
  if(rarity in RARITY_SYMBOLS) return RARITY_SYMBOLS[rarity];
  if(/hyper|spéciale/i.test(rarity)) return '★★★★';
  if(/ultra|illustration/i.test(rarity)) return '★★★';
  if(/holo|rare/i.test(rarity)) return '★';
  if(/peu commune/i.test(rarity)) return '◆';
  if(/commune/i.test(rarity)) return '●';
  return '✦';
}

// Ordre d'affichage dans le filtre : du plus commun au plus rare.
const SYMBOL_RANK = { '': 0, '●': 1, '◆': 2, '★': 3, '★★': 4, '★★★': 5, '★★★★': 6, '✦': 7 };
function rarityRank(rarity){
  return SYMBOL_RANK[raritySymbol(rarity)] ?? 9;
}

function populateRarityFilter(cards){
  const select = document.getElementById('rarity-filter');
  const previous = select.value;
  const rarities = [...new Set(cards.map(c => c.rarity).filter(Boolean))];
  rarities.sort((a, b) => rarityRank(a) - rarityRank(b) || a.localeCompare(b));
  select.innerHTML = '<option value="">Toutes les raretés</option>' +
    rarities.map(r => `<option value="${r}">${raritySymbol(r)} ${r}</option>`).join('');
  select.value = previous;
}

// TCGdex ne renvoie pas la rareté dans une liste de cartes. On interroge donc
// l'API rareté par rareté ("parmi ces cartes, lesquelles sont communes ?")
// pour recomposer l'information. L'ordre part des raretés les plus répandues,
// ce qui permet de s'arrêter dès que chaque carte a trouvé la sienne.
// Les raretés propres à Pokémon TCG Pocket (Diamants, Étoiles, Couronne,
// Chromatiques) sont volontairement absentes : ce jeu est hors périmètre.
const RARITIES_TO_PROBE = [
  'Commune', 'Peu Commune', 'Rare', 'Rare Holo', 'Holo Rare', 'Double rare',
  'Ultra Rare', 'Illustration rare', 'Illustration spéciale rare', 'Hyper rare',
  'Holo Rare V', 'Holo Rare VMAX', 'Holo Rare VSTAR', 'Promo', 'Sans Rareté',
  'Dresseur Full Art', 'Shiny rare', 'Shiny rare V', 'Shiny rare VMAX',
  'Radieux Rare', 'Chromatique ultra rare', 'Magnifique rare', 'Magnifique',
  'Rare Prime', 'Rare Holo LV.X', 'Rare Noir Blanc', 'LÉGENDE',
  'Collection Classique', 'HIGH-TECH rare', 'Méga Hyper Rare',
];

// `scopeQuery` restreint la recherche au même ensemble que la grille affichée
// (par exemple "set.id=eq:base1" ou "dexId=eq:25"). Renvoie { [cardId]: rareté }.
async function probeRarities(scopeQuery, cacheKey, cards){
  const cached = sessionStorage.getItem(cacheKey);
  if(cached) return JSON.parse(cached);

  const byCardId = {};
  let remaining = cards.length;
  // Par lots, pour ne pas saturer le navigateur ni l'API.
  for(let i = 0; i < RARITIES_TO_PROBE.length && remaining > 0; i += 5){
    const batch = RARITIES_TO_PROBE.slice(i, i + 5);
    const results = await Promise.all(batch.map(async rarity => {
      try{
        const url = `https://api.tcgdex.net/v2/fr/cards?${scopeQuery}&rarity=eq:${encodeURIComponent(rarity)}`;
        return { rarity, cards: await fetchJson(url, 0) };
      }catch(err){
        return { rarity, cards: [] };
      }
    }));
    // Garde-fou : si une rareté "correspond" à toutes les cartes, c'est que
    // le filtre n'a pas été appliqué par l'API. Mieux vaut aucune rareté
    // qu'une rareté fausse sur toutes les cartes.
    if(results.some(r => r.cards.length === cards.length && cards.length > 12)){
      console.warn("Le filtre par rareté n'est pas appliqué par l'API — raretés ignorées.");
      return null;
    }
    results.forEach(({ rarity, cards: matched }) => {
      matched.forEach(c => {
        if(!byCardId[c.id]){ byCardId[c.id] = rarity; remaining--; }
      });
    });
  }

  sessionStorage.setItem(cacheKey, JSON.stringify(byCardId));
  return byCardId;
}

// Quand TCGdex n'a pas le visuel français d'une carte, on retombe sur une
// image ajoutée à la main dans le dépôt (images/cards/<id de la carte>.png),
// puis sur un point d'interrogation.
function cardImgFallback(img){
  const fallback = img.dataset.fallback;
  if(fallback){
    img.removeAttribute('data-fallback');
    img.src = fallback;
    return;
  }
  img.replaceWith(Object.assign(document.createElement('span'), { className: 'glyph', textContent: '?', title: 'Image non disponible' }));
}

// Vignette d'une carte. `subtitle` remplace le numéro quand la grille mélange
// plusieurs extensions (page d'un Pokémon), où le seul numéro ne dit rien.
function cardTile(c, subtitle){
  return `
    <div class="card-tile">
      <div class="card-img-wrap">
        ${c.image
          ? `<img src="${c.image}/low.webp" alt="${c.name}" loading="lazy" data-fallback="images/cards/${c.id}.png" onerror="cardImgFallback(this)">`
          : `<img src="images/cards/${c.id}.png" alt="${c.name}" loading="lazy" onerror="cardImgFallback(this)">`}
      </div>
      <div class="card-num"><span>${subtitle ?? '#' + c.localId}</span><span class="rarity-symbol" title="${c.rarity || ''}">${raritySymbol(c.rarity)}</span></div>
      <div class="card-name">${c.name}</div>
      <div class="tag-row">${tagButtons(c.id)}</div>
    </div>
  `;
}

// L'identifiant d'une carte est "<id de l'extension>-<numéro>", et un id
// d'extension peut lui-même contenir des tirets (tk-ex-latia) : on découpe
// donc au dernier.
function setIdOfCard(cardId){
  return cardId.slice(0, cardId.lastIndexOf('-'));
}
