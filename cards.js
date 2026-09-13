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
  // La recherche peut renvoyer des cartes absentes de la grille (celles de
  // Pokémon TCG Pocket, par exemple) : on ne compte que celles affichées,
  // sinon on s'arrêterait avant d'avoir la rareté de toutes.
  const wanted = new Set(cards.map(c => c.id));
  let remaining = wanted.size;
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
        if(wanted.has(c.id) && !byCardId[c.id]){ byCardId[c.id] = rarity; remaining--; }
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
          ? `<img src="${c.image}/low.webp" alt="${c.name}" loading="lazy" data-card-id="${c.id}" data-fallback="images/cards/${c.id}.png" onerror="cardImgFallback(this)">`
          : `<img src="images/cards/${c.id}.png" alt="${c.name}" loading="lazy" data-card-id="${c.id}" onerror="cardImgFallback(this)">`}
      </div>
      <div class="card-num"><span>${subtitle ?? '#' + c.localId}</span><span class="rarity-symbol" title="${c.rarity || ''}">${raritySymbol(c.rarity)}</span></div>
      <div class="card-name">${c.name}</div>
      ${coteVignette(c.id)}
      <div class="tag-row">${tagButtons(c.id)}</div>
    </div>
  `;
}

// La cote n'est affichée que si elle a déjà été récupérée — c'est-à-dire
// après un tri par valeur. Sinon la ligne est absente, plutôt que d'occuper
// une place vide.
function coteVignette(carteId){
  if(typeof prixConnu !== 'function') return '';
  const prix = prixConnu(carteId);
  return prix ? `<div class="card-cote">≈ ${prixLisible(prix)}</div>` : '';
}

// --- Tri d'une grille ------------------------------------------------------
// Le tri par valeur suppose de connaître le prix de chaque carte, soit une
// requête par carte. On ne le paie donc qu'à la demande explicite du membre,
// et une seule fois par extension et par visite.

let triCritere = 'numero';
let triCroissant = true;

function trierCartes(cartes){
  const triees = [...cartes];
  if(triCritere === 'valeur'){
    triees.sort((a, b) => {
      const pa = prixConnu(a.id)?.montant;
      const pb = prixConnu(b.id)?.montant;
      // Une carte sans cote n'est pas une carte à zéro euro : elle va au
      // bout, quel que soit le sens du tri.
      if(pa == null && pb == null) return 0;
      if(pa == null) return 1;
      if(pb == null) return -1;
      return triCroissant ? pa - pb : pb - pa;
    });
  }else{
    triees.sort((a, b) => {
      const ordre = (a.localId || '').localeCompare(b.localId || '', undefined, { numeric: true });
      return triCroissant ? ordre : -ordre;
    });
  }
  return triees;
}

// Branche les deux contrôles de tri d'une page sur son propre rafraîchissement.
// `cartesAtrier` fournit les cartes concernées au moment du chargement des
// cotes ; `rafraichir` redessine la grille.
function installerTri(cartesAtrier, rafraichir){
  const choix = document.getElementById('tri');
  const sens = document.getElementById('tri-sens');
  const etat = document.getElementById('tri-etat');
  if(!choix || !sens) return;

  const majSens = () => {
    sens.textContent = triCroissant ? '↑' : '↓';
    sens.title = triCritere === 'valeur'
      ? (triCroissant ? 'De la moins chère à la plus chère' : 'De la plus chère à la moins chère')
      : (triCroissant ? 'Du plus petit au plus grand numéro' : 'Du plus grand au plus petit numéro');
  };

  const appliquer = async () => {
    if(triCritere === 'valeur'){
      const cartes = cartesAtrier();
      const manquantes = cartes.filter(c => prixConnu(c.id) === null).map(c => c.id);
      if(manquantes.length > 0){
        choix.disabled = sens.disabled = true;
        etat.textContent = `Chargement des cotes… 0/${manquantes.length}`;
        await prixDeCartes(manquantes, (faits, total) => {
          etat.textContent = `Chargement des cotes… ${faits}/${total}`;
        });
        etat.textContent = '';
        choix.disabled = sens.disabled = false;
      }
    }
    majSens();
    rafraichir();
  };

  choix.addEventListener('change', () => { triCritere = choix.value; appliquer(); });
  sens.addEventListener('click', () => { triCroissant = !triCroissant; appliquer(); });
  majSens();
}

// L'identifiant d'une carte est "<id de l'extension>-<numéro>", et un id
// d'extension peut lui-même contenir des tirets (tk-ex-latia) : on découpe
// donc au dernier.
function setIdOfCard(cardId){
  return cardId.slice(0, cardId.lastIndexOf('-'));
}

// --- Agrandissement d'une carte au clic -----------------------------------
// Le composant est autonome (styles compris) pour que les deux grilles en
// bénéficient sans dupliquer de CSS dans chaque page.

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .card-img-wrap img{cursor:zoom-in}
  .card-zoom{position:fixed;inset:0;z-index:50;background:rgba(10,11,13,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px;cursor:zoom-out;opacity:0;transition:opacity .15s;}
  .card-zoom.shown{opacity:1}
  .card-zoom img{max-width:min(460px,100%);max-height:78vh;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);}
  .card-zoom .caption{font-family:'IBM Plex Sans',sans-serif;font-size:13.5px;color:#EDEAE0;text-align:center;}
  .card-zoom .caption .hint{display:block;margin-top:4px;font-size:11.5px;color:#9B9E9C;}
  .card-zoom .valeur{display:block;margin-top:6px;font-size:15px;color:#E3C766;}
  .card-zoom .valeur small{display:block;margin-top:2px;font-size:11px;color:#9B9E9C;}
`}));

function openCardZoom(img){
  const thumbnail = img.currentSrc || img.src;
  // La vignette est déjà en cache : on l'affiche tout de suite, puis on la
  // remplace par la haute définition dès qu'elle est prête.
  const fullSize = thumbnail.includes('/low.webp') ? thumbnail.replace('/low.webp', '/high.webp') : thumbnail;

  const overlay = document.createElement('div');
  overlay.className = 'card-zoom';
  overlay.innerHTML = `
    <img src="${thumbnail}" alt="${img.alt}">
    <div class="caption">${img.alt}<span class="valeur" id="zoom-valeur"></span><span class="hint">Clique ou appuie sur Échap pour fermer</span></div>
  `;

  const close = () => {
    overlay.classList.remove('shown');
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 150);
  };
  const onKey = (e) => { if(e.key === 'Escape') close(); };

  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('shown'));

  // La cote arrive après coup : elle ne doit pas retarder l'agrandissement.
  const carteId = img.dataset.cardId;
  if(carteId && typeof prixCarte === 'function'){
    prixCarte(carteId).then(prix => {
      const zone = overlay.querySelector('#zoom-valeur');
      if(!zone) return; // Vue déjà refermée.
      zone.innerHTML = prix
        ? `≈ ${prixLisible(prix)}<small>Cote indicative pour une carte en bon état${prix.devise === 'USD' ? ', marché nord-américain faute de cote européenne' : ''}${prix.variantes ? ' — d\'autres éditions de cette carte se négocient à des prix très différents' : ''}</small>`
        : `<small>Pas de cote connue pour cette carte</small>`;
    });
  }

  if(fullSize !== thumbnail){
    const large = new Image();
    large.onload = () => { overlay.querySelector('img').src = fullSize; };
    large.src = fullSize;
  }
}

document.addEventListener('click', (e) => {
  const img = e.target.closest('.card-img-wrap img');
  if(img) openCardZoom(img);
});
