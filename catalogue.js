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

// On lit les fichiers par extension, et non le fichier français agrégé :
// celui-ci contient aujourd'hui des noms anglais, alors que les fichiers par
// extension sont bien traduits. Le fichier anglais sert de dernier recours,
// car un nom anglais vaut mieux qu'une extension vide.
async function cartesPocketDUneExtension(codeDistant){
  const chemins = [];
  for(const base of POCKET_DONNEES){
    chemins.push(`${base}/cards/fr/${encodeURIComponent(codeDistant)}.min.json`);
  }
  for(const base of POCKET_DONNEES){
    chemins.push(`${base}/cards/${encodeURIComponent(codeDistant)}.min.json`);
  }
  try{
    const cartes = await lireJson(chemins, `pokeclasseur_pocket_${codeDistant}`);
    return Array.isArray(cartes) ? cartes : Object.values(cartes).flat();
  }catch(err){
    console.warn(`Aucune carte pour ${codeDistant}`, err);
    return [];
  }
}

const sourcePocket = {
  cle: 'pocket',
  nom: 'Base communautaire TCG Pocket',

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

  // Repli seulement : sans instantané, il faut parcourir les extensions une
  // à une, cette source n'offrant pas de recherche par Pokémon.
  async cartesDuPokemon(dexId){
    const extensions = await this.extensions();
    const trouvees = [];
    for(const ext of extensions){
      const cartes = await cartesPocketDUneExtension(idSetDistant(ext.id));
      cartes.forEach(c => {
        if(dexDuNomDeCarte(c.name) === dexId) trouvees.push(cartePocket(c));
      });
    }
    return trouvees;
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


// ========================= L'instantané local ===========================
//
// Le site sert d'abord ses propres données, rangées dans « donnees/ » par
// outils/instantane.mjs et déposées là par une tâche quotidienne. Trois
// raisons : il reste debout quand une source tombe, il n'attend plus le
// réseau d'un tiers à chaque page, et ce qu'une source se trompe peut être
// corrigé chez nous.
//
// Les sources d'origine restent branchées en second : une extension parue
// depuis la dernière construction n'est pas encore dans l'instantané, et
// c'est exactement le cas où l'on veut aller la chercher en direct.

// Repère de version, lu par diagnostic.html : il permet de distinguer « le
// site ne marche pas » de « le navigateur sert encore l'ancien fichier ».
const CATALOGUE_VERSION = '2026-09-19-instantane';

const INSTANTANE = 'donnees';
const instantanePresent = new Map();   // par univers

async function lireInstantane(chemin){
  const r = await fetch(`${INSTANTANE}/${chemin}`);
  if(!r.ok) throw new Error(`Instantané absent : ${chemin}`);
  return r.json();
}

// Sert à distinguer « ce Pokémon n'a aucune carte » — une réponse, donc —
// de « l'instantané n'existe pas », qui appelle un repli.
async function instantaneDisponible(){
  const cle = universActuel().cle;
  if(!instantanePresent.has(cle)){
    try{
      await lireInstantane(`${cle}/extensions.json`);
      instantanePresent.set(cle, true);
    }catch(err){
      console.info("Pas d'instantané local : lecture directe des sources.");
      instantanePresent.set(cle, false);
    }
  }
  return instantanePresent.get(cle);
}

// ============================ L'interface ===============================
// Ce que les pages voient. Elles ne nomment jamais une source.

function sourceCourante(){
  return estPocket() ? sourcePocket : sourceTcgdex;
}

// Le catalogue entier de l'univers courant, du plus ancien au plus récent.
async function listerExtensionsBrutes(){
  try{
    return await lireInstantane(`${universActuel().cle}/extensions.json`);
  }catch(err){
    return sourceCourante().extensions();
  }
}

async function lireExtensionBrute(setId){
  try{
    const toutes = await lireInstantane(`${universActuel().cle}/extensions.json`);
    const trouvee = toutes.find(s => s.id === setId);
    if(trouvee) return trouvee;
  }catch(err){}
  return sourceCourante().extension(setId);
}

async function cartesDeLExtensionBrutes(setId){
  try{
    return await lireInstantane(`${universActuel().cle}/sets/${encodeURIComponent(setId)}.json`);
  }catch(err){
    return sourceCourante().cartesDeLExtension(setId);
  }
}

async function cartesDuPokemonBrutes(dexId){
  try{
    return await lireInstantane(`${universActuel().cle}/dex/${dexId}.json`);
  }catch(err){
    // Un fichier absent alors que l'instantané existe veut dire qu'aucune
    // carte de cet univers ne représente ce Pokémon. Aller le redemander en
    // direct ne ferait que confirmer un vide.
    if(await instantaneDisponible()) return [];
    return sourceCourante().cartesDuPokemon(dexId);
  }
}

// ======================================================================
// Corrections saisies depuis l'espace d'administration
//
// Une correction prend effet tout de suite, sans attendre la construction
// nocturne : elle se pose par-dessus l'instantané, au moment de l'affichage.
// La nuit suivante, la construction l'absorbe dans les fichiers du dépôt et
// la correction devient redondante — elle s'applique alors sur une donnée
// déjà identique, donc ne change plus rien.
//
// On interroge la base sans la bibliothèque Supabase : une seule requête de
// lecture, sur une table publique, ne justifie pas de charger 100 Ko de
// code sur chaque page. Et le catalogue doit rester utilisable si la base
// est injoignable — une correction en moins n'est pas une page cassée.
// ======================================================================

const CLE_CORRECTIONS = 'pokeclasseur-corrections';
let correctionsChargees = null;

async function lireCorrections(){
  if(correctionsChargees) return correctionsChargees;

  // Le temps d'une visite, on ne redemande pas : la liste est courte et ne
  // change qu'au rythme où l'administrateur la modifie.
  try{
    const gardee = sessionStorage.getItem(CLE_CORRECTIONS);
    if(gardee) return (correctionsChargees = JSON.parse(gardee));
  }catch(err){ /* stockage indisponible : on redemandera */ }

  let lignes = [];
  try{
    if(typeof SUPABASE_URL === 'string' && !SUPABASE_URL.includes('REMPLACER')){
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/corrections?select=univers,genre,cible,donnees,image_chemin`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if(r.ok) lignes = await r.json();
    }
  }catch(err){
    console.warn('Corrections indisponibles', err);
  }

  correctionsChargees = lignes;
  try{ sessionStorage.setItem(CLE_CORRECTIONS, JSON.stringify(lignes)); }catch(err){}
  return lignes;
}

function adresseVisuelCorrige(chemin){
  return `${SUPABASE_URL}/storage/v1/object/public/corrections/${chemin}`;
}

// Les champs qu'une correction peut écraser sur une carte. Une liste fermée
// plutôt qu'une fusion libre : sans elle, une donnée mal formée pourrait
// remplacer l'identifiant d'une carte et la détacher de sa collection.
const CHAMPS_CARTE = ['name', 'rarity', 'dexId'];

function appliquerAUneCarte(carte, corrections){
  const univers = universActuel().cle;
  for(const c of corrections){
    if(c.univers !== univers || c.cible !== carte.id) continue;
    if(c.genre === 'visuel' && c.image_chemin){
      carte.imageSecours = carte.image;
      carte.image = adresseVisuelCorrige(c.image_chemin);
      carte.imageHaute = carte.image;
    }
    if(c.genre === 'carte'){
      for(const champ of CHAMPS_CARTE){
        if(c.donnees?.[champ] !== undefined && c.donnees[champ] !== null) carte[champ] = c.donnees[champ];
      }
    }
  }
  return carte;
}

async function corrigerCartes(cartes, setId = null){
  const corrections = await lireCorrections();
  if(!corrections.length) return cartes;

  const univers = universActuel().cle;
  const corrigees = cartes.map(c => appliquerAUneCarte({ ...c }, corrections));

  // Les cartes ajoutées à la main pour cette extension, qui n'existent chez
  // aucune source. On les reconnaît à ce qu'aucune carte du même
  // identifiant n'est déjà là.
  if(setId){
    const connues = new Set(corrigees.map(c => c.id));
    for(const c of corrections){
      if(c.univers !== univers || c.genre !== 'carte' || connues.has(c.cible)) continue;
      if(!c.donnees?.ajout || !String(c.cible).startsWith(`${setId}-`)) continue;
      corrigees.push(appliquerAUneCarte({
        id: c.cible,
        localId: String(c.donnees.localId ?? c.cible.split('-').pop()).replace(/^0+/, ''),
        name: c.donnees.name ?? c.cible,
        rarity: c.donnees.rarity ?? null,
        dexId: c.donnees.dexId ?? null,
        image: null, imageHaute: null, imageSecours: null,
      }, corrections));
    }
    corrigees.sort((a, b) => Number(a.localId) - Number(b.localId));
  }
  return corrigees;
}

async function corrigerExtensions(extensions){
  const corrections = await lireCorrections();
  if(!corrections.length) return extensions;

  const univers = universActuel().cle;
  const liste = extensions.map(e => ({ ...e }));
  const connues = new Set(liste.map(e => e.id));

  for(const c of corrections){
    if(c.univers !== univers || c.genre !== 'extension') continue;
    const existante = liste.find(e => e.id === c.cible);
    if(existante){
      for(const champ of ['name', 'serieNom', 'dateSortie']){
        if(c.donnees?.[champ]) existante[champ] = c.donnees[champ];
      }
    }else if(c.donnees?.name && !connues.has(c.cible)){
      liste.push({
        id: c.cible,
        name: c.donnees.name,
        serieNom: c.donnees.serieNom ?? 'Autres',
        dateSortie: c.donnees.dateSortie ?? null,
        cardCount: { official: c.donnees.cardCount ?? null },
        logo: c.image_chemin ? adresseVisuelCorrige(c.image_chemin) : null,
        symbol: null,
        saisieManuelle: true,
      });
    }
  }

  // Même ordre que la construction : série, promos en tête, puis date.
  const estPromo = e => /^P-/.test(e.id);
  liste.sort((a, b) =>
    String(a.serieNom ?? '').localeCompare(String(b.serieNom ?? ''))
    || (estPromo(b) - estPromo(a))
    || String(a.dateSortie ?? '').localeCompare(String(b.dateSortie ?? '')));
  return liste;
}

// ----------------------------------------------------------------------
// Ce que les pages appellent
//
// Les fonctions « brutes » rendent l'instantané tel qu'il est publié ; ces
// trois-ci y posent les corrections en vigueur. Les pages n'ont rien à
// savoir de cette distinction : elles appellent les mêmes noms qu'avant.
// ----------------------------------------------------------------------

async function listerExtensions(){
  return corrigerExtensions(await listerExtensionsBrutes());
}

async function cartesDeLExtension(setId){
  return corrigerCartes(await cartesDeLExtensionBrutes(setId), setId);
}

async function cartesDuPokemon(dexId){
  return corrigerCartes(await cartesDuPokemonBrutes(dexId));
}

// Une extension ajoutée à la main n'existe dans aucun instantané : la
// chercher dans la liste corrigée est le seul moyen de lui donner une page.
async function lireExtension(setId){
  const corrigee = (await corrigerExtensions([])).find(e => e.id === setId);
  if(corrigee) return corrigee;

  const brute = await lireExtensionBrute(setId);
  if(!brute) return brute;
  return (await corrigerExtensions([brute]))[0] ?? brute;
}
