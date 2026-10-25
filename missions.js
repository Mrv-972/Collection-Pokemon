const FICHIER_MISSIONS = 'donnees/missions-secretes.json';
const CLE_MISSIONS_FAITES = 'pokeclasseur-missions-faites';

function missionsFaites(){
  try{
    return new Set((JSON.parse(localStorage.getItem(CLE_MISSIONS_FAITES)) || [])
      .map(c => String(c).replace(/^B-plusieurs::/, 'plusieurs::')));
  }
  catch{ return new Set(); }
}

function enregistrerMissionsFaites(faites){
  try{ localStorage.setItem(CLE_MISSIONS_FAITES, JSON.stringify([...faites])); }
  catch(err){ console.warn('Impossible d\'enregistrer les missions faites', err); }
}

const cleMission = (idExtension, nom) => `${idExtension}::${nom}`;

async function chargerMissions(){
  const r = await fetch(FICHIER_MISSIONS, { cache: 'no-cache' });
  if(!r.ok) throw new Error(`Fichier des missions indisponible (HTTP ${r.status}).`);
  return r.json();
}

const CLE_EXTENSIONS_OUVERTES = 'pokeclasseur-missions-ouvertes';

function extensionsOuvertes(){
  try{ return new Set(JSON.parse(localStorage.getItem(CLE_EXTENSIONS_OUVERTES)) || []); }
  catch{ return new Set(); }
}

function enregistrerExtensionsOuvertes(ouvertes){
  try{ localStorage.setItem(CLE_EXTENSIONS_OUVERTES, JSON.stringify([...ouvertes])); }
  catch(err){ }
}

const PREFERENCES_PAR_VERSION = [
  [/gold\s*crown|couronne/i,                 ['Couronne']],
  [/immersive/i,                             ['Trois Étoiles']],
  [/arc.?en.?ciel|rainbow|bordered|2\s*★|deux\s*étoiles/i, ['Deux Étoiles', 'Une Étoile']],
  [/full\s*art|1\s*★|une\s*étoile|illustration\s*rare/i,  ['Une Étoile', 'Deux Étoiles']],
  [/shiny|chromatique/i,                     ['Chromatique', 'Chromatique deux étoiles']],
];

const ORDRE_DES_RARETES = ORDRE_RARETES_POCKET;

const rangDeRarete = r => {
  const i = ORDRE_DES_RARETES.indexOf(r);
  return i === -1 ? ORDRE_DES_RARETES.length : i;
};

function preferences(texte){
  if(!texte) return null;
  for(const [motif, raretes] of PREFERENCES_PAR_VERSION){
    if(motif.test(texte)) return raretes;
  }
  return null;
}

function lireLaCarteDemandee(libelle){
  const m = String(libelle).match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if(!m) return { nom: libelle.trim(), numero: null, version: null };
  const dedans = m[2].trim();
  const numero = dedans.match(/^(\d+)\s*\/\s*\d+$/);
  return numero
    ? { nom: m[1].trim(), numero: numero[1], version: null }
    : { nom: m[1].trim(), numero: null, version: dedans };
}

function formeComparable(nom){
  return String(nom).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function trouverLaCarte(libelle, condition, cartes){
  const { nom, numero, version } = lireLaCarteDemandee(libelle);

  if(numero) return cartes.find(c => c.localId === String(Number(numero))) ?? null;

  const candidates = cartes.filter(c => formeComparable(c.name) === formeComparable(nom));
  if(candidates.length === 0) return null;
  if(candidates.length === 1) return candidates[0];

  const indice = version || condition || '';
  const voulues = preferences(version) ?? preferences(condition) ?? [];

  const arcEnCiel = /arc.?en.?ciel|rainbow|bordered/i.test(indice);
  for(const rarete of voulues){
    const memeRarete = candidates.filter(c => c.rarity === rarete);
    if(memeRarete.length) return arcEnCiel ? memeRarete[memeRarete.length - 1] : memeRarete[0];
  }

  return candidates.slice().sort((a, b) => rangDeRarete(a.rarity) - rangDeRarete(b.rarity))[0];
}
