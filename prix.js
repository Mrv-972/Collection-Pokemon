// Valeur marchande des cartes.
//
// TCGdex ne fournit le prix que dans la fiche détaillée d'une carte, jamais
// dans une liste : afficher un prix sous chacune des deux cents cartes d'une
// extension coûterait deux cents requêtes par page. On ne les récupère donc
// que là où ils servent à décider — un échange à peser, une carte qu'on
// regarde de près — et on les garde en mémoire pour la durée de la visite.
//
// Ces prix sont indicatifs. Ils valent pour la variante courante d'une carte
// en bon état, sont mis à jour une fois par jour, et ignorent tout ce qui
// fait vraiment le prix d'un échange : l'état réel de l'exemplaire, l'édition
// exacte, et ce que chacun attache à sa carte.

const CACHE_PRIX = 'pokeclasseur_prix';
const prixEnMemoire = {};

function chargerCachePrix(){
  try{
    Object.assign(prixEnMemoire, JSON.parse(sessionStorage.getItem(CACHE_PRIX)) ?? {});
  }catch(err){
    // Cache illisible : on repart de zéro, sans conséquence.
  }
}
chargerCachePrix();

// Le fournisseur européen propose plusieurs mesures. On prend la tendance,
// qui est la valeur de référence des collectionneurs, et on se rabat sur les
// suivantes quand elle manque — c'est fréquent sur les cartes peu échangées.
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

// Faute de cote européenne, celle du marché nord-américain vaut mieux que
// rien — signalée comme telle, car elle n'est pas dans la même devise.
function coteTcgplayer(tcgplayer){
  if(!tcgplayer) return null;
  // Les variantes (holofoil, normal...) sont des objets ; "unit" et "updated"
  // sont de simples textes, qu'on écarte.
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

// Renvoie { montant, devise } ou null si la carte n'est cotée nulle part.
async function prixCarte(carteId){
  if(carteId in prixEnMemoire) return prixEnMemoire[carteId];

  let prix = null;
  try{
    const carte = await fetchJson(`https://api.tcgdex.net/v2/fr/cards/${carteId}`, 0);
    prix = coteCardmarket(carte?.pricing?.cardmarket) ?? coteTcgplayer(carte?.pricing?.tcgplayer);
    // Une même carte existe souvent en plusieurs variantes dont les cotes
    // n'ont rien à voir : le Dracaufeu du Set de Base vaut environ 600 € en
    // holo illimité, mais dix fois plus en 1re édition sans ombre. Le prix
    // retenu est celui de la variante courante ; on le signale à l'affichage
    // plutôt que de laisser croire à un prix unique.
    if(prix) prix.variantes = (carte?.variants_detailed?.length ?? 1) > 1;
  }catch(err){
    console.warn(`Prix indisponible pour ${carteId}`, err);
    return null; // Sans mise en cache : une panne réseau n'est pas une absence de prix.
  }

  prixEnMemoire[carteId] = prix;
  try{ sessionStorage.setItem(CACHE_PRIX, JSON.stringify(prixEnMemoire)); }catch(err){}
  return prix;
}

// Par petits paquets : une carte coûte une requête, et une extension entière
// en compte deux cents. `avancement` permet d'en rendre compte à l'écran,
// car l'attente est perceptible.
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

// La cote déjà connue d'une carte, sans rien aller chercher.
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

// Somme d'un lot de cartes.
//
// Deux précautions : les cartes sans cote sont comptées à part, car annoncer
// un total en taisant qu'il en manque donnerait une fausse impression de
// précision ; et les devises ne sont jamais mélangées — additionner des
// euros et des dollars produirait un nombre faux présenté comme juste. En
// cas de mélange, on retient la devise majoritaire et on écarte le reste.
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
