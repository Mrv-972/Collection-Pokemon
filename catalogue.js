// Le catalogue des cartes, et lui seul, sait d'où viennent les données.
//
// Jusqu'ici chaque page appelait TCGdex directement. Le jour où une source
// se dégrade, il fallait donc repasser dans huit fichiers. Désormais les
// pages demandent « les extensions », « les cartes de celle-ci », et ce
// fichier décide à qui poser la question. Changer de fournisseur devient
// une modification à un seul endroit.
//
// C'est ce qui permet aux deux univers d'avoir chacun le sien :
//
//   — le jeu physique reste sur TCGdex, qui le suit de près (le dépôt reçoit
//     des contributions chaque semaine) ;
//   — l'application passe sur le jeu de données de flibustier, parce que
//     TCGdex a cessé de mettre Pocket à jour après le 26 février 2026, soit
//     sept extensions de retard.
//
// Toutes les sources rendent la même forme, décrite ici une fois pour
// toutes :
//
//   extension : { id, name, cardCount, logo, symbol, serieNom }
//   carte     : { id, localId, name, rarity, dexId, image, imageHaute }
//
// « image » est une adresse complète et utilisable telle quelle. Les
// sources n'ont pas les mêmes conventions — TCGdex demande qu'on ajoute la
// taille voulue au bout, l'autre non — et c'est précisément le genre de
// détail que les pages n'ont pas à connaître.

// ------------------------------------------------------- utilitaires ----

async function lireJson(adresses, cle){
  if(cle){
    try{
      const garde = sessionStorage.getItem(cle);
      if(garde) return JSON.parse(garde);
    }catch(err){}
  }
  // Plusieurs adresses possibles, essayées dans l'ordre : un miroir qui
  // tombe ne doit pas vider le site.
  let dernierSouci = null;
  for(const adresse of adresses){
    try{
      const r = await fetch(adresse);
      if(!r.ok) throw new Error(`Réponse ${r.status}`);
      const donnees = await r.json();
      if(cle){ try{ sessionStorage.setItem(cle, JSON.stringify(donnees)); }catch(err){} }
      return donnees;
    }catch(err){
      dernierSouci = err;
      console.warn(`Source indisponible : ${adresse}`, err);
    }
  }
  throw dernierSouci ?? new Error('Aucune source disponible');
}

// ============================ TCGdex ====================================
// Le jeu de cartes physique. Données multilingues, images sur leur propre
// hébergement, cotes relayées depuis Cardmarket.

const TCGDEX = 'https://api.tcgdex.net/v2';

// Le jeu de données français est incomplet : vingt et une extensions
// n'existent que dans sa version anglaise — Gym Heroes, Legendary
// Collection, Team Rocket Returns, Arceus... Les faire disparaître du
// classeur parce que personne ne les a traduites serait absurde.
async function extensionsTcgdex(){
  const [fr, en] = await Promise.all([
    lireJson([`${TCGDEX}/fr/sets`]).catch(() => []),
    lireJson([`${TCGDEX}/en/sets`]).catch(() => []),
  ]);
  if(fr.length === 0 && en.length === 0){
    throw new Error("Le catalogue des extensions est injoignable.");
  }
  // Le français l'emporte, mais champ par champ : une fiche française
  // incomplète ne doit pas effacer ce que l'anglaise savait.
  const parId = new Map();
  en.forEach(s => parId.set(s.id, { ...s }));
  fr.forEach(s => {
    const deja = parId.get(s.id) ?? {};
    const fusion = { ...deja };
    for(const [champ, valeur] of Object.entries(s)){
      if(valeur !== null && valeur !== undefined) fusion[champ] = valeur;
    }
    parId.set(s.id, fusion);
  });

  // L'anglais sert d'ossature : plus complet, et rangé dans le même ordre
  // chronologique. Les quelques extensions propres au français suivent.
  const connus = new Set(en.map(s => s.id));
  return en.map(s => parId.get(s.id))
    .concat(fr.filter(s => !connus.has(s.id)))
    .map(s => ({
      id: s.id,
      name: s.name,
      cardCount: s.cardCount,
      logo: s.logo ? `${s.logo}.png` : null,
      symbol: s.symbol ? `${s.symbol.replace('/univ/', '/fr/')}.png` : null,
      serieNom: guessSeriesName(s.id),
    }));
}

function carteTcgdex(c){
  return {
    id: c.id,
    localId: c.localId,
    name: c.name,
    rarity: c.rarity ?? null,
    dexId: Array.isArray(c.dexId) ? c.dexId[0] : (c.dexId ?? null),
    image: c.image ? `${c.image}/low.webp` : null,
    imageHaute: c.image ? `${c.image}/high.webp` : null,
  };
}

const sourceTcgdex = {
  cle: 'tcgdex',
  nom: 'TCGdex',
  // TCGdex ne donne la rareté que carte par carte : les pages la complètent
  // après coup, par sondage.
  raretesFournies: false,
  extensions: extensionsTcgdex,

  async extension(setId){
    const s = await lireJson([`${TCGDEX}/fr/sets/${setId}`, `${TCGDEX}/en/sets/${setId}`]);
    return {
      id: s.id,
      name: s.name,
      cardCount: s.cardCount,
      logo: s.logo ? `${s.logo}.png` : null,
      symbol: s.symbol ? `${s.symbol.replace('/univ/', '/fr/')}.png` : null,
      serieNom: s.serie?.name ?? guessSeriesName(s.id),
    };
  },

  async cartesDeLExtension(setId){
    const cartes = await lireJson([`${TCGDEX}/fr/cards?set.id=eq:${encodeURIComponent(setId)}`]);
    return cartes.map(carteTcgdex);
  },

  async cartesDuPokemon(dexId){
    const cartes = await lireJson([`${TCGDEX}/fr/cards?dexId=eq:${dexId}`]);
    return cartes.map(carteTcgdex);
  },
};

// ======================= Pokémon TCG Pocket =============================
// Jeu de données de flibustier (licence MIT), servi par le CDN jsDelivr avec
// GitHub en second recours. Il couvre les vingt-trois extensions de
// l'application, noms français compris, là où TCGdex s'est arrêté à quinze.

const POCKET_DONNEES = [
  'https://cdn.jsdelivr.net/npm/pokemon-tcg-pocket-database@2/dist',
  'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist',
];
const POCKET_IMAGES = [
  'https://cdn.jsdelivr.net/gh/flibustier/pokemon-tcg-exchange@main/public/images/cards-by-set',
  'https://raw.githubusercontent.com/flibustier/pokemon-tcg-exchange/main/public/images/cards-by-set',
];

// Les deux sources ne nomment pas les extensions de promotion pareil. On
// garde la forme de TCGdex : les marquages déjà posés par les membres sont
// enregistrés sous ces identifiants-là, et changer de convention les
// détacherait de leurs cartes.
const EQUIVALENCES_SET = { 'PROMO-A': 'P-A', 'PROMO-B': 'P-B' };
const EQUIVALENCES_INVERSES = Object.fromEntries(
  Object.entries(EQUIVALENCES_SET).map(([de, vers]) => [vers, de]));

const idSetLocal   = code => EQUIVALENCES_SET[code] ?? code;
const idSetDistant = id   => EQUIVALENCES_INVERSES[id] ?? id;

// TCGdex numérote les cartes Pocket sur trois chiffres (« A1-001 »). On s'y
// tient, pour la même raison.
const idCartePocket = (setId, numero) => `${setId}-${String(numero).padStart(3, '0')}`;

// Les raretés de l'application se lisent en symboles : des losanges, des
// étoiles, une couronne. Le jeu de données les code en abrégé ; on rend le
// libellé français que le reste du site attend.
const RARETES_POCKET = {
  C:   'Un Diamant',      U:   'Deux Diamants',  R:  'Trois Diamants',
  RR:  'Quatre Diamants', AR:  'Une Étoile',     SR: 'Deux Étoiles',
  SAR: 'Deux Étoiles',    IM:  'Trois Étoiles',  UR: 'Couronne',
  S:   'Chromatique',     SSR: 'Chromatique deux étoiles',
};

function cartePocket(c){
  const setId = idSetLocal(c.set);
  return {
    id: idCartePocket(setId, c.number),
    localId: String(c.number),
    name: c.name,
    rarity: RARETES_POCKET[c.rarity] ?? null,
    dexId: null,                       // absent de cette source : déduit du nom
    image: `${POCKET_IMAGES[0]}/${encodeURIComponent(c.set)}/${c.number}.webp`,
    imageHaute: `${POCKET_IMAGES[0]}/${encodeURIComponent(c.set)}/${c.number}.webp`,
    imageSecours: `${POCKET_IMAGES[1]}/${encodeURIComponent(c.set)}/${c.number}.webp`,
  };
}

// Toutes les cartes françaises tiennent dans un fichier de 459 Ko, chargé
// une fois par visite. Le découper par extension ferait une requête de plus
// à chaque page pour économiser des miettes.
async function toutesLesCartesPocket(){
  const cartes = await lireJson(
    POCKET_DONNEES.map(base => `${base}/cards.fr.min.json`),
    'pokeclasseur_pocket_cartes');
  return (Array.isArray(cartes) ? cartes : Object.values(cartes).flat());
}

// La traduction française retarde d'une extension sur la saisie des cartes :
// au moment d'écrire, tout est traduit jusqu'à B4, et la toute dernière
// n'existe qu'en anglais. Plutôt qu'une extension vide, on va chercher son
// fichier anglais — un nom anglais vaut mieux qu'une page blanche.
async function cartesPocketDUneExtension(codeDistant){
  const toutes = await toutesLesCartesPocket();
  const siennes = toutes.filter(c => c.set === codeDistant);
  if(siennes.length > 0) return siennes;

  try{
    const secours = await lireJson(
      POCKET_DONNEES.map(base => `${base}/cards/${encodeURIComponent(codeDistant)}.min.json`),
      `pokeclasseur_pocket_${codeDistant}`);
    return Array.isArray(secours) ? secours : Object.values(secours).flat();
  }catch(err){
    console.warn(`Aucune carte pour ${codeDistant}`, err);
    return [];
  }
}

const sourcePocket = {
  cle: 'pocket',
  nom: 'Base communautaire TCG Pocket',
  raretesFournies: true,   // la rareté vient avec la carte : rien à sonder

  async extensions(){
    const parSerie = await lireJson(
      POCKET_DONNEES.map(base => `${base}/sets.json`),
      'pokeclasseur_pocket_sets');
    const liste = [];
    // Le fichier est rangé par série — « A », « B » — ce qui est justement
    // le découpage que le catalogue affiche.
    for(const [lettre, extensions] of Object.entries(parSerie)){
      extensions.forEach(s => liste.push({
        id: idSetLocal(s.code),
        name: s.name?.fr || s.name?.en || s.code,
        cardCount: { official: s.count ?? null },
        logo: null,      // cette source n'héberge pas de logo d'extension
        symbol: null,
        serieNom: `Série ${lettre}`,
        dateSortie: s.releaseDate ?? null,
      }));
    }
    // Du plus ancien au plus récent, comme TCGdex : le catalogue inverse
    // ensuite lui-même pour montrer les nouveautés d'abord.
    return liste.sort((a, b) => String(a.dateSortie).localeCompare(String(b.dateSortie)));
  },

  async extension(setId){
    const toutes = await this.extensions();
    const trouvee = toutes.find(s => s.id === setId);
    if(!trouvee) throw new Error(`Extension inconnue : ${setId}`);
    return trouvee;
  },

  async cartesDeLExtension(setId){
    const cartes = await cartesPocketDUneExtension(idSetDistant(setId));
    return cartes.slice().sort((a, b) => a.number - b.number).map(cartePocket);
  },

  async cartesDuPokemon(dexId){
    const toutes = await toutesLesCartesPocket();
    return toutes.filter(c => dexDuNomDeCarte(c.name) === dexId).map(cartePocket);
  },
};

// ------------------ retrouver le Pokémon derrière une carte -------------
//
// TCGdex donne le numéro de Pokédex de chaque carte ; le jeu de données
// Pocket, non. Sans lui, la page « Par Pokémon » n'a plus rien à filtrer.
// On le retrouve donc par le nom, en retirant ce que le jeu de cartes
// ajoute autour : « Dracaufeu ex » reste Dracaufeu, « Méga-Léviator ex »
// reste Léviator.
//
// La méthode a ses limites, et il faut les connaître : une carte de
// Dresseur ne correspond à aucun Pokémon — c'est voulu — et une forme
// régionale ou une appellation inhabituelle peut ne pas être reconnue. Elle
// est donc inexacte par construction, là où TCGdex était exact.

let indexPokedex = null;

function normaliserNom(nom){
  return String(nom)
    // Le genre de Nidoran fait partie de son nom : sans ça, Nidoran femelle
    // et Nidoran mâle se confondent et l'un écrase l'autre.
    .replace(/\u2640/g, 'f').replace(/\u2642/g, 'm')
    // La ligature « oe » ne se décompose pas toute seule : Noeunoeuf resterait
    // introuvable face à l'orthographe de l'autre source.
    .replace(/\u0153/g, 'oe').replace(/\u00e6/g, 'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}


function construireIndexPokedex(){
  indexPokedex = new Map();
  if(typeof POKEDEX_FR === 'undefined') return;
  POKEDEX_FR.forEach((nom, i) => indexPokedex.set(normaliserNom(nom), i + 1));
}

function dexDuNomDeCarte(nom){
  if(!indexPokedex) construireIndexPokedex();
  if(indexPokedex.size === 0) return null;

  const entier = normaliserNom(nom);
  if(indexPokedex.has(entier)) return indexPokedex.get(entier);

  // Le nom complet ne tombe pas juste : on rogne. D'abord ce que le jeu de
  // cartes ajoute autour (« ex », « Méga- »), puis, mot à mot depuis la fin,
  // ce que le jeu vidéo ajoute — « Noadkoko d'Alola », « Motisma Tonte »,
  // « Palkia Forme Originelle » désignent tous un Pokémon du Pokédex.
  const mots = String(nom).split(/[\s\u00A0-]+/).filter(Boolean);
  for(let garde = mots.length; garde >= 1; garde--){
    let n = normaliserNom(mots.slice(0, garde).join(''));
    // « ex » seulement : l'application n'a jamais eu de cartes V, VMAX ni
    // GX, et retirer un « v » final décapitait Tadmorv, Grotadmorv et leurs
    // semblables.
    if(n.endsWith('ex') && n.length > 4) n = n.slice(0, -2);
    if(indexPokedex.has(n)) return indexPokedex.get(n);
    if(n.startsWith('mega') && n.length > 6 && indexPokedex.has(n.slice(4))){
      return indexPokedex.get(n.slice(4));
    }
  }
  return null;
}


// ============================ L'interface ===============================
// Ce que les pages voient. Elles ne nomment jamais une source.

function sourceCourante(){
  return estPocket() ? sourcePocket : sourceTcgdex;
}

function raretesFourniesParLaSource(){
  return sourceCourante().raretesFournies;
}

// Le catalogue entier de l'univers courant, du plus ancien au plus récent.
async function listerExtensions(){
  return sourceCourante().extensions();
}

async function lireExtension(setId){
  return sourceCourante().extension(setId);
}

async function cartesDeLExtension(setId){
  return sourceCourante().cartesDeLExtension(setId);
}

async function cartesDuPokemon(dexId){
  return sourceCourante().cartesDuPokemon(dexId);
}
