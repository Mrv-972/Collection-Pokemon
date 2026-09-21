// Missions secrètes de Pokémon TCG Pocket.
//
// Le jeu cache, dans chaque extension, des missions qui n'apparaissent dans
// l'écran des missions qu'une fois accomplies. On ne peut donc pas les y
// lire : il faut savoir à l'avance ce qu'elles demandent. C'est tout l'objet
// de cette page.
//
// Ces missions ne figurent dans aucune base de données ouverte — ni TCGdex,
// ni le jeu de données de flibustier, ni le wiki francophone. Elles ont été
// relevées dans deux guides francophones, recoupées, et rangées à la main
// dans donnees/missions-secretes.json. Là où les guides se contredisent ou
// se trompent visiblement, la mission porte une réserve, affichée telle
// quelle : mieux vaut un doute annoncé qu'une certitude fausse.

const FICHIER_MISSIONS = 'donnees/missions-secretes.json';
const CLE_MISSIONS_FAITES = 'pokeclasseur-missions-faites';

// Le jeu ne dit nulle part « mission accomplie » à un site extérieur, et les
// versions full art ou chromatiques d'une carte ne sont pas distinguées dans
// les marquages du site. Cocher reste donc à la main — mais la coche, elle,
// est bien enregistrée.
function missionsFaites(){
  try{ return new Set(JSON.parse(localStorage.getItem(CLE_MISSIONS_FAITES)) || []); }
  catch{ return new Set(); }
}

function enregistrerMissionsFaites(faites){
  try{ localStorage.setItem(CLE_MISSIONS_FAITES, JSON.stringify([...faites])); }
  catch(err){ console.warn('Impossible d\'enregistrer les missions faites', err); }
}

// Une mission n'a pas d'identifiant propre : son extension et son nom
// suffisent à la retrouver, et survivent à une réorganisation du fichier.
const cleMission = (idExtension, nom) => `${idExtension}::${nom}`;

async function chargerMissions(){
  const r = await fetch(FICHIER_MISSIONS, { cache: 'no-cache' });
  if(!r.ok) throw new Error(`Fichier des missions indisponible (HTTP ${r.status}).`);
  return r.json();
}

// ------------------------------------------- extensions dépliées ou non ----
//
// Cent cinq missions déroulées d'un coup ne se lisent pas. La page les replie
// par extension, et se souvient de celles qu'on avait ouvertes : on revient
// souvent sur la même, celle qu'on est en train de jouer.

const CLE_EXTENSIONS_OUVERTES = 'pokeclasseur-missions-ouvertes';

function extensionsOuvertes(){
  try{ return new Set(JSON.parse(localStorage.getItem(CLE_EXTENSIONS_OUVERTES)) || []); }
  catch{ return new Set(); }
}

function enregistrerExtensionsOuvertes(ouvertes){
  try{ localStorage.setItem(CLE_EXTENSIONS_OUVERTES, JSON.stringify([...ouvertes])); }
  catch(err){ /* sans mémoire, tout se rouvrira fermé : pas de quoi gêner */ }
}

// --------------------------------------------- retrouver les visuels ------
//
// Une mission nomme ses cartes en toutes lettres — « Azurill », « Méga-
// Florizarre ex (full art) » — là où le site les connaît par identifiant.
// Il faut donc rapprocher les deux.
//
// Le nom seul ne suffit pas : Azurill existe deux fois dans Source Secrète,
// en Trois Diamants et en Une Étoile, et une mission « full art » réclame
// la seconde. La version demandée se lit soit entre parenthèses derrière le
// nom, soit dans la condition de la mission. À défaut de certitude, on
// n'affiche pas de visuel : une mauvaise image ferait chercher la mauvaise
// carte, ce qui est pire que pas d'image du tout.

// Dans l'application, « full art » ne désigne pas la même rareté selon la
// carte : une étoile pour un Pokémon ordinaire ou un Dresseur, deux pour une
// carte ex, qui n'a pas de version une étoile. On donne donc un ordre de
// préférence plutôt qu'une rareté unique, et on prend la première qui existe.
const PREFERENCES_PAR_VERSION = [
  [/gold\s*crown|couronne/i,                 ['Couronne']],
  [/immersive/i,                             ['Trois Étoiles']],
  [/arc.?en.?ciel|rainbow|bordered|2\s*★|deux\s*étoiles/i, ['Deux Étoiles', 'Une Étoile']],
  [/full\s*art|1\s*★|une\s*étoile/i,                      ['Une Étoile', 'Deux Étoiles']],
  [/shiny|chromatique/i,                     ['Chromatique', 'Chromatique deux étoiles']],
];

// Du plus courant au plus rare. Sert de repli quand la version demandée
// n'existe pas pour cette carte, et de choix par défaut quand rien n'est
// précisé : une carte nommée sans façon, c'est la carte ordinaire.
const ORDRE_DES_RARETES = [
  'Un Diamant', 'Deux Diamants', 'Trois Diamants', 'Quatre Diamants',
  'Une Étoile', 'Deux Étoiles', 'Chromatique', 'Chromatique deux étoiles',
  'Trois Étoiles', 'Couronne',
];

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

// « Milobellus (72/71) » → { nom: 'Milobellus', numero: '72' }
// « Méga-Florizarre ex (full art) » → { nom: 'Méga-Florizarre ex', version: 'full art' }
function lireLaCarteDemandee(libelle){
  const m = String(libelle).match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if(!m) return { nom: libelle.trim(), numero: null, version: null };
  const dedans = m[2].trim();
  const numero = dedans.match(/^(\d+)\s*\/\s*\d+$/);
  return numero
    ? { nom: m[1].trim(), numero: numero[1], version: null }
    : { nom: m[1].trim(), numero: null, version: dedans };
}

// Les guides écrivent « Évoli Ex », le catalogue « Évoli-ex » ; l'un met un
// tiret là où l'autre met une espace. On compare sur une forme rabotée.
function formeComparable(nom){
  return String(nom).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function trouverLaCarte(libelle, condition, cartes){
  const { nom, numero, version } = lireLaCarteDemandee(libelle);

  // Un numéro d'extension ne laisse aucune place au doute.
  if(numero) return cartes.find(c => c.localId === String(Number(numero))) ?? null;

  const candidates = cartes.filter(c => formeComparable(c.name) === formeComparable(nom));
  if(candidates.length === 0) return null;
  if(candidates.length === 1) return candidates[0];

  // La version demandée se lit derrière le nom, sinon dans la condition.
  const indice = version || condition || '';
  const voulues = preferences(version) ?? preferences(condition) ?? [];

  // Une même rareté peut couvrir deux cartes : Ogerpon Masque Turquoise-ex
  // paraît deux fois en Deux Étoiles dans Parade Onirique, une fois en full
  // art et une fois au cadre arc-en-ciel. Le jeu numérote toujours la
  // seconde après la première, et c'est la seule chose qui les distingue.
  const arcEnCiel = /arc.?en.?ciel|rainbow|bordered/i.test(indice);
  for(const rarete of voulues){
    const memeRarete = candidates.filter(c => c.rarity === rarete);
    if(memeRarete.length) return arcEnCiel ? memeRarete[memeRarete.length - 1] : memeRarete[0];
  }

  // Rien ne correspond : on montre la carte ordinaire. Le libellé affiché
  // sous la vignette garde, lui, la version exacte que la mission réclame.
  return candidates.slice().sort((a, b) => rangDeRarete(a.rarity) - rangDeRarete(b.rarity))[0];
}
