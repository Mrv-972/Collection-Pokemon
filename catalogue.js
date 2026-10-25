async function lireJson(adresses, cle){
  if(cle){
    try{
      const garde = sessionStorage.getItem(cle);
      if(garde) return JSON.parse(garde);
    }catch(err){}
  }
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

const TCGDEX = 'https://api.tcgdex.net/v2';

async function extensionsTcgdex(){
  const [fr, en] = await Promise.all([
    lireJson([`${TCGDEX}/fr/sets`]).catch(() => []),
    lireJson([`${TCGDEX}/en/sets`]).catch(() => []),
  ]);
  if(fr.length === 0 && en.length === 0){
    throw new Error("Le catalogue des extensions est injoignable.");
  }
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

const POCKET_DONNEES = [
  'https://cdn.jsdelivr.net/npm/pokemon-tcg-pocket-database@2/dist',
  'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist',
];
const POCKET_IMAGES = [
  'https://cdn.jsdelivr.net/gh/flibustier/pokemon-tcg-exchange@main/public/images/cards-by-set',
  'https://raw.githubusercontent.com/flibustier/pokemon-tcg-exchange/main/public/images/cards-by-set',
];

const EQUIVALENCES_SET = { 'PROMO-A': 'P-A', 'PROMO-B': 'P-B' };
const EQUIVALENCES_INVERSES = Object.fromEntries(
  Object.entries(EQUIVALENCES_SET).map(([de, vers]) => [vers, de]));

const idSetLocal   = code => EQUIVALENCES_SET[code] ?? code;
const idSetDistant = id   => EQUIVALENCES_INVERSES[id] ?? id;

const idCartePocket = (setId, numero) => `${setId}-${String(numero).padStart(3, '0')}`;

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
    dexId: null,
    image: `${POCKET_IMAGES[0]}/${encodeURIComponent(c.set)}/${c.number}.webp`,
    imageHaute: `${POCKET_IMAGES[0]}/${encodeURIComponent(c.set)}/${c.number}.webp`,
    imageSecours: `${POCKET_IMAGES[1]}/${encodeURIComponent(c.set)}/${c.number}.webp`,
  };
}

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
    for(const [lettre, extensions] of Object.entries(parSerie)){
      extensions.forEach(s => liste.push({
        id: idSetLocal(s.code),
        name: s.name?.fr || s.name?.en || s.code,
        cardCount: { official: s.count ?? null },
        logo: null,
        symbol: null,
        serieNom: `Série ${lettre}`,
        dateSortie: s.releaseDate ?? null,
      }));
    }
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

let indexPokedex = null;

function normaliserNom(nom){
  return String(nom)
    .replace(/\u2640/g, 'f').replace(/\u2642/g, 'm')
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

  const mots = String(nom).split(/[\s\u00A0-]+/).filter(Boolean);
  for(let garde = mots.length; garde >= 1; garde--){
    let n = normaliserNom(mots.slice(0, garde).join(''));
    if(n.endsWith('ex') && n.length > 4) n = n.slice(0, -2);
    if(indexPokedex.has(n)) return indexPokedex.get(n);
    if(n.startsWith('mega') && n.length > 6 && indexPokedex.has(n.slice(4))){
      return indexPokedex.get(n.slice(4));
    }
  }
  return null;
}


const CATALOGUE_VERSION = '2026-09-19-instantane';

const INSTANTANE = 'donnees';
const instantanePresent = new Map();

async function lireInstantane(chemin){
  const r = await fetch(`${INSTANTANE}/${chemin}`);
  if(!r.ok) throw new Error(`Instantané absent : ${chemin}`);
  return r.json();
}

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

function sourceCourante(){
  return estPocket() ? sourcePocket : sourceTcgdex;
}

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
    if(await instantaneDisponible()) return [];
    return sourceCourante().cartesDuPokemon(dexId);
  }
}

const CLE_CORRECTIONS = 'pokeclasseur-corrections';
let correctionsChargees = null;

async function lireCorrections(){
  if(correctionsChargees) return correctionsChargees;

  try{
    const gardee = sessionStorage.getItem(CLE_CORRECTIONS);
    if(gardee) return (correctionsChargees = JSON.parse(gardee));
  }catch(err){ }

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
      if(['supporter', 'objet', 'outil', 'stade'].includes(c.donnees?.famille)){
        carte.categorie = 'dresseur';
        carte.famille = c.donnees.famille;
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
    if(c.univers !== univers) continue;

    if(c.genre === 'logo-extension'){
      if(!c.image_chemin) continue;
      const cible = liste.find(e => e.id === c.cible);
      if(cible) cible.logo = adresseVisuelCorrige(c.image_chemin);
      continue;
    }

    if(c.genre !== 'extension') continue;
    const existante = liste.find(e => e.id === c.cible);
    if(existante){
      for(const champ of ['name', 'serieNom', 'dateSortie']){
        if(c.donnees?.[champ]) existante[champ] = c.donnees[champ];
      }
      if(c.image_chemin) existante.logo = adresseVisuelCorrige(c.image_chemin);
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

  const estPromo = e => /^P-/.test(e.id);
  liste.sort((a, b) =>
    String(a.serieNom ?? '').localeCompare(String(b.serieNom ?? ''))
    || (estPromo(b) - estPromo(a))
    || String(a.dateSortie ?? '').localeCompare(String(b.dateSortie ?? '')));
  return liste;
}

async function logosDeSeriesCorriges(){
  const corrections = await lireCorrections();
  const univers = universActuel().cle;
  const par = new Map();
  for(const c of corrections){
    if(c.univers !== univers || c.genre !== 'logo-serie' || !c.image_chemin) continue;
    par.set(c.cible, adresseVisuelCorrige(c.image_chemin));
  }
  return par;
}

async function listerExtensions(){
  return corrigerExtensions(await listerExtensionsBrutes());
}

async function cartesDeLExtension(setId){
  return corrigerCartes(await cartesDeLExtensionBrutes(setId), setId);
}

async function cartesDuPokemon(dexId){
  return corrigerCartes(await cartesDuPokemonBrutes(dexId));
}

async function listerAutresCartes(){
  try{
    return await lireInstantane(`${universActuel().cle}/autres.json`);
  }catch(err){
    return [];
  }
}

async function cartesDuNom(cle){
  try{
    return corrigerCartes(await lireInstantane(`${universActuel().cle}/autres/${encodeURIComponent(cle)}.json`));
  }catch(err){
    return [];
  }
}

async function lireExtension(setId){
  const corrigee = (await corrigerExtensions([])).find(e => e.id === setId);
  if(corrigee) return corrigee;

  const brute = await lireExtensionBrute(setId);
  if(!brute) return brute;
  return (await corrigerExtensions([brute]))[0] ?? brute;
}
