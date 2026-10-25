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

const RARITY_SYMBOLS = {
  'Un Diamant': '◆', 'Deux Diamants': '◆◆', 'Trois Diamants': '◆◆◆',
  'Quatre Diamants': '◆◆◆◆', 'Une Étoile': '★', 'Deux Étoiles': '★★',
  'Trois Étoiles': '★★★', 'Couronne': '♛',
  'Chromatique': '✦', 'Chromatique deux étoiles': '✦✦',
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

const SYMBOL_RANK = { '': 0, '●': 1, '◆': 2, '★': 3, '★★': 4, '★★★': 5, '★★★★': 6, '✦': 7 };
function rarityRank(rarity){
  const rangPocket = typeof ORDRE_RARETES_POCKET !== 'undefined' ? ORDRE_RARETES_POCKET.indexOf(rarity) : -1;
  if(rangPocket >= 0) return rangPocket;
  return 100 + (SYMBOL_RANK[raritySymbol(rarity)] ?? 9);
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

const RARITIES_TO_PROBE = [
  'Commune', 'Peu Commune', 'Rare', 'Rare Holo', 'Holo Rare', 'Double rare',
  'Ultra Rare', 'Illustration rare', 'Illustration spéciale rare', 'Hyper rare',
  'Holo Rare V', 'Holo Rare VMAX', 'Holo Rare VSTAR', 'Promo', 'Sans Rareté',
  'Dresseur Full Art', 'Shiny rare', 'Shiny rare V', 'Shiny rare VMAX',
  'Radieux Rare', 'Chromatique ultra rare', 'Magnifique rare', 'Magnifique',
  'Rare Prime', 'Rare Holo LV.X', 'Rare Noir Blanc', 'LÉGENDE',
  'Collection Classique', 'HIGH-TECH rare', 'Méga Hyper Rare',
];

async function probeRarities(scopeQuery, cacheKey, cards){
  const cached = sessionStorage.getItem(cacheKey);
  if(cached) return JSON.parse(cached);

  const byCardId = {};
  const wanted = new Set(cards.map(c => c.id));
  let remaining = wanted.size;
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
    if(results.some(r => r.cards.length === cards.length && cards.length > 12)){
      console.warn("Le filtre par rareté n'est pas appliqué par l'API : raretés ignorées.");
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

function cardImgFallback(img){
  const fallback = img.dataset.fallback;
  if(fallback){
    img.removeAttribute('data-fallback');
    if(img.dataset.fallbackHaute){
      img.dataset.haute = img.dataset.fallbackHaute;
      img.removeAttribute('data-fallback-haute');
    }
    img.src = fallback;
    return;
  }
  img.replaceWith(Object.assign(document.createElement('span'), { className: 'glyph', textContent: '?', title: 'Image non disponible' }));
}

function classeObtention(carteId){
  return typeof estObtenue === 'function' && !estObtenue(carteId) ? CLASSE_NON_OBTENUE : '';
}

const attrCarte = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const LANGUE_CARTE = {
  'sans-edition':   { bandeau: 'N\'existe pas en français', classe: '',
    explication: 'Cette carte n\'existe pas en français : le visuel est celui de la version anglaise.' },
  'visuel-anglais': { bandeau: 'Visuel en anglais', classe: ' bandeau-langue-visuel',
    explication: 'Cette carte existe en français, mais seule son image anglaise a été trouvée pour l\'instant.' },
};
const langueDeLaCarte = c => c.sansEditionFr ? 'sans-edition' : c.visuelAnglais ? 'visuel-anglais' : null;

function cardTile(c, subtitle){
  const langue = langueDeLaCarte(c);
  const attrLangue = langue ? ` data-langue="${langue}"` : '';
  const bandeau = langue
    ? `<span class="bandeau-langue${LANGUE_CARTE[langue].classe}" title="${attrCarte(LANGUE_CARTE[langue].explication)}">${LANGUE_CARTE[langue].bandeau}</span>`
    : '';
  return `
    <div class="card-tile" data-carte="${attrCarte(c.id)}" data-local="${attrCarte(c.localId)}"
         data-nom="${attrCarte(c.name)}" data-rarete="${attrCarte(c.rarity)}"
         data-dex="${attrCarte(c.dexId)}" data-categorie="${attrCarte(c.categorie)}" data-famille="${attrCarte(c.famille)}">
      <div class="card-img-wrap">
        ${c.image
          ? `<img class="${classeObtention(c.id)}" src="${c.image}" alt="${c.name}" loading="lazy" data-card-id="${c.id}"${attrLangue} data-haute="${c.imageHaute ?? c.image}" data-fallback="${c.imageSecours ?? `images/cards/${c.id}.png`}"${c.imageHauteSecours ? ` data-fallback-haute="${c.imageHauteSecours}"` : ''} onerror="cardImgFallback(this)">`
          : `<img class="${classeObtention(c.id)}" src="images/cards/${c.id}.png" alt="${c.name}" loading="lazy" data-card-id="${c.id}"${attrLangue} onerror="cardImgFallback(this)">`}
        ${bandeau}
      </div>
      <div class="card-num"><span>${subtitle ?? '#' + c.localId}</span><span class="rarity-symbol" title="${c.rarity || ''}">${rarityIcon(c.rarity)}</span></div>
      <div class="card-name">${c.name}</div>
      ${coteVignette(c.id)}
      <div class="tag-row">${tagButtons(c)}</div>
    </div>
  `;
}

function coteVignette(carteId){
  if(typeof estPocket === 'function' && estPocket()) return '';
  if(typeof prixConnu !== 'function') return '';
  const prix = prixConnu(carteId);
  return prix ? `<div class="card-cote">≈ ${prixLisible(prix)}</div>` : '';
}

let triCritere = 'numero';
let triCroissant = true;

function trierCartes(cartes){
  const triees = [...cartes];
  if(triCritere === 'valeur'){
    triees.sort((a, b) => {
      const pa = prixConnu(a.id)?.montant;
      const pb = prixConnu(b.id)?.montant;
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

function installerTri(cartesAtrier, rafraichir){
  const choix = document.getElementById('tri');
  const sens = document.getElementById('tri-sens');
  const etat = document.getElementById('tri-etat');
  if(!choix || !sens) return;

  if(typeof estPocket === 'function' && estPocket()){
    choix.querySelector('option[value="valeur"]')?.remove();
    if(triCritere === 'valeur'){ triCritere = 'numero'; choix.value = 'numero'; }
  }

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

function setIdOfCard(cardId){
  return cardId.slice(0, cardId.lastIndexOf('-'));
}

if(typeof poserStyleNonObtenue === 'function') poserStyleNonObtenue();
if(typeof poserInterrupteurGrisaille === 'function'){
  const poser = () => poserInterrupteurGrisaille(document.querySelector('.toolbar'));
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poser);
  else poser();
}

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .card-img-wrap img{cursor:zoom-in}
  .bandeau-langue{position:absolute;left:0;right:0;bottom:0;z-index:2;pointer-events:none;
    padding:4px 6px 5px;text-align:center;font:600 10.5px/1.25 'IBM Plex Sans',sans-serif;letter-spacing:.2px;
    color:#15171A;background:rgba(227,199,102,0.95);box-shadow:0 -1px 0 rgba(0,0,0,0.25)}
  .bandeau-langue-visuel{background:rgba(185,188,185,0.95)}
  .card-zoom .note-langue{display:block;margin:0 auto 6px;max-width:420px;font-size:12.5px;color:#E3C766}
  .card-zoom img{filter:none !important;opacity:1 !important}
  .card-zoom{position:fixed;inset:0;z-index:70;background:rgba(10,11,13,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px;cursor:zoom-out;opacity:0;transition:opacity .15s;
}
  .card-zoom.shown{opacity:1}
  .card-zoom img{max-width:min(460px,100%);max-height:78vh;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);}
  .card-zoom .caption{font-family:'IBM Plex Sans',sans-serif;font-size:13.5px;color:#EDEAE0;text-align:center;}
  .card-zoom .caption .hint{display:block;margin-top:4px;font-size:11.5px;color:#9B9E9C;}
  .card-zoom .valeur{display:block;margin-top:6px;font-size:15px;color:#E3C766;}
  .card-zoom .valeur small{display:block;margin-top:2px;font-size:11px;color:#9B9E9C;}
  .card-zoom .fleche{position:fixed;top:50%;transform:translateY(-50%);width:52px;height:52px;
    display:flex;align-items:center;justify-content:center;cursor:pointer;
    background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);
    color:#EDEAE0;border-radius:50%;font:22px/1 'IBM Plex Sans',sans-serif;
    padding:0;transition:background .12s,opacity .12s;
    z-index:2;}
  .card-zoom .fleche:hover{background:rgba(255,255,255,.18)}
  .card-zoom .fleche[disabled]{opacity:.22;cursor:default}
  .card-zoom .fleche.avant{left:16px}
  .card-zoom .fleche.apres{right:16px}
  @media(max-width:620px){
    .card-zoom .fleche{top:auto;bottom:18px;transform:none;width:46px;height:46px}
    .card-zoom .fleche.avant{left:22px}
    .card-zoom .fleche.apres{right:22px}
  }
`}));

function openCardZoom(img){
  const vignettes = [...document.querySelectorAll('.card-grid img[data-card-id]')];
  let position = Math.max(0, vignettes.indexOf(img));

  const overlay = document.createElement('div');
  overlay.className = 'card-zoom';
  overlay.innerHTML = `
    <button class="fleche avant" aria-label="Carte précédente">‹</button>
    <img alt="">
    <div class="caption"><span class="titre"></span><span class="valeur" id="zoom-valeur"></span><span class="hint">${
      typeof ecranTactile === 'function' && ecranTactile() ? 'Glisse vers la gauche ou la droite pour défiler · Touche le fond pour fermer'
                     : 'Flèches ← → pour défiler · Échap pour fermer'}</span></div>
    <button class="fleche apres" aria-label="Carte suivante">›</button>
  `;

  const elImage  = overlay.querySelector('img');
  const elTitre  = overlay.querySelector('.titre');
  const elValeur = overlay.querySelector('#zoom-valeur');
  const avant    = overlay.querySelector('.fleche.avant');
  const apres    = overlay.querySelector('.fleche.apres');

  let jeton = 0;

  function afficher(indice){
    position = indice;
    const source = vignettes[position];
    const monJeton = ++jeton;

    const vignette = source.currentSrc || source.src;
    elImage.src = vignette;
    elImage.alt = source.alt;
    elTitre.textContent = source.alt;
    elValeur.innerHTML = '';
    avant.disabled = position === 0;
    apres.disabled = position === vignettes.length - 1;

    decrire(source, monJeton);

    const grande = source.dataset.haute
      || (vignette.includes('/low.webp') ? vignette.replace('/low.webp', '/high.webp') : vignette);
    if(grande !== vignette){
      const chargement = new Image();
      chargement.onload = () => { if(monJeton === jeton) elImage.src = grande; };
      chargement.src = grande;
    }
  }

  async function decrire(source, monJeton){
    const carteId = source.dataset.cardId;
    if(!carteId) return;

    const pocket = typeof universActuel === 'function' && universActuel().cle === 'pocket';
    if(pocket){
      const setId = setIdOfCard(carteId);
      const numero = Number(carteId.slice(setId.length + 1));
      let extension = setId;
      let total = null;
      try{
        const fiche = typeof lireExtension === 'function' ? await lireExtension(setId) : null;
        if(fiche){
          extension = fiche.name ?? setId;
          total = fiche.cardCount?.official ?? fiche.cardCount?.total ?? null;
        }
      }catch(err){ }
      if(monJeton !== jeton) return;
      elValeur.innerHTML =
        `<small>${echapperTexte(extension)} · n° ${numero}${total ? ` / ${total}` : ''}</small>`;
      return;
    }

    const langue = LANGUE_CARTE[source.dataset.langue];
    const noteLangue = langue ? `<span class="note-langue">${langue.explication}</span>` : '';
    if(typeof prixCarte !== 'function'){ elValeur.innerHTML = noteLangue; return; }
    const prix = await prixCarte(carteId).catch(() => null);
    if(monJeton !== jeton) return;
    elValeur.innerHTML = noteLangue + (prix
      ? `≈ ${prixLisible(prix)}<small>Cote indicative pour une carte en bon état${prix.devise === 'USD' ? ', marché nord-américain faute de cote européenne' : ''}${prix.variantes ? '. D\'autres éditions de cette carte se négocient à des prix très différents' : ''}</small>`
      : `<small>Pas de cote connue pour cette carte</small>`);
  }

  const aller = pas => {
    const cible = position + pas;
    if(cible >= 0 && cible < vignettes.length) afficher(cible);
  };

  const glissement = typeof brancherGlissement === 'function'
    ? brancherGlissement({
        zone: overlay, image: elImage,
        peutAller: pas => position + pas >= 0 && position + pas < vignettes.length,
        changer: aller,
      })
    : null;

  const fermer = () => {
    overlay.classList.remove('shown');
    document.removeEventListener('keydown', auClavier);
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 150);
  };

  const auClavier = (e) => {
    if(e.key === 'Escape') return fermer();
    if(e.key === 'ArrowLeft'){ e.preventDefault(); aller(-1); }
    if(e.key === 'ArrowRight'){ e.preventDefault(); aller(1); }
  };

  overlay.addEventListener('click', (e) => {
    if(glissement?.vientDeGlisser()) return;
    const fleche = e.target.closest('.fleche');
    if(!fleche) return fermer();
    e.stopPropagation();
    aller(fleche.classList.contains('avant') ? -1 : 1);
  });

  document.addEventListener('keydown', auClavier);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  afficher(position);
  requestAnimationFrame(() => overlay.classList.add('shown'));
}

function echapperTexte(texte){
  return String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.addEventListener('click', (e) => {
  const img = e.target.closest('.card-img-wrap img');
  if(img) openCardZoom(img);
});


let messageFugaceElement = null;
let messageFugaceMinuteur = null;

function messageFugace(texte){
  if(!texte) return;
  if(!messageFugaceElement){
    messageFugaceElement = document.createElement('div');
    messageFugaceElement.setAttribute('role', 'status');
    Object.assign(messageFugaceElement.style, {
      position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
      maxWidth: 'min(520px, calc(100vw - 32px))', padding: '12px 18px',
      background: 'rgba(18,63,56,.97)', color: '#EDEAE0',
      border: '1px solid rgba(255,255,255,.18)', borderRadius: '10px',
      font: '14px/1.4 "IBM Plex Sans", sans-serif', textAlign: 'center',
      zIndex: '9999', boxShadow: '0 8px 28px rgba(0,0,0,.45)',
      opacity: '0', transition: 'opacity .18s',
    });
    document.body.appendChild(messageFugaceElement);
  }
  messageFugaceElement.textContent = texte;
  requestAnimationFrame(() => { messageFugaceElement.style.opacity = '1'; });
  clearTimeout(messageFugaceMinuteur);
  messageFugaceMinuteur = setTimeout(() => {
    messageFugaceElement.style.opacity = '0';
  }, 3600);
}
