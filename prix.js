const CACHE_PRIX = 'pokeclasseur_prix';
const prixEnMemoire = {};

function chargerCachePrix(){
  try{
    Object.assign(prixEnMemoire, JSON.parse(sessionStorage.getItem(CACHE_PRIX)) ?? {});
  }catch(err){
  }
}
chargerCachePrix();

function coteCardmarket(cardmarket){
  if(!cardmarket) return null;
  for(const champ of ['trend', 'avg30', 'avg7', 'avg', 'low', 'trend-holo', 'avg30-holo', 'avg-holo', 'low-holo']){
    const valeur = cardmarket[champ];
    if(typeof valeur === 'number' && valeur > 0){
      return { montant: valeur, devise: cardmarket.unit || 'EUR' };
    }
  }
  return null;
}

function coteTcgplayer(tcgplayer){
  if(!tcgplayer) return null;
  for(const variante of Object.values(tcgplayer)){
    if(!variante || typeof variante !== 'object') continue;
    for(const champ of ['marketPrice', 'midPrice', 'lowPrice']){
      const valeur = variante[champ];
      if(typeof valeur === 'number' && valeur > 0){
        return { montant: valeur, devise: tcgplayer.unit || 'USD' };
      }
    }
  }
  return null;
}

async function prixCarte(carteId){
  if(carteId in prixEnMemoire) return prixEnMemoire[carteId];

  let prix = null;
  try{
    const carte = await fetchJson(`https://api.tcgdex.net/v2/fr/cards/${carteId}`, 0);
    prix = coteCardmarket(carte?.pricing?.cardmarket) ?? coteTcgplayer(carte?.pricing?.tcgplayer);
    if(prix) prix.variantes = (carte?.variants_detailed?.length ?? 1) > 1;
  }catch(err){
    console.warn(`Prix indisponible pour ${carteId}`, err);
    return null;
  }

  prixEnMemoire[carteId] = prix;
  try{ sessionStorage.setItem(CACHE_PRIX, JSON.stringify(prixEnMemoire)); }catch(err){}
  return prix;
}

async function prixDeCartes(idsCartes, avancement){
  const resultat = {};
  for(let i = 0; i < idsCartes.length; i += 6){
    const lot = idsCartes.slice(i, i + 6);
    const prix = await Promise.all(lot.map(prixCarte));
    lot.forEach((id, n) => { resultat[id] = prix[n]; });
    if(avancement) avancement(Math.min(i + lot.length, idsCartes.length), idsCartes.length);
  }
  return resultat;
}

function prixConnu(carteId){
  return prixEnMemoire[carteId] ?? null;
}

function prixLisible(prix){
  if(!prix) return null;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: prix.devise,
    maximumFractionDigits: 2,
  }).format(prix.montant);
}

function totalLisible(prixParCarte, idsCartes){
  const parDevise = {};
  idsCartes.forEach(id => {
    const prix = prixParCarte[id];
    if(!prix) return;
    const d = (parDevise[prix.devise] ||= { total: 0, cotees: 0 });
    d.total += prix.montant;
    d.cotees++;
  });

  const devises = Object.entries(parDevise);
  if(devises.length === 0){
    return { total: 0, cotees: 0, sansCote: idsCartes.length, texte: null };
  }
  const [devise, retenu] = devises.sort((a, b) => b[1].cotees - a[1].cotees)[0];

  return {
    total: retenu.total,
    cotees: retenu.cotees,
    devise,
    sansCote: idsCartes.length - retenu.cotees,
    texte: prixLisible({ montant: retenu.total, devise }),
  };
}
