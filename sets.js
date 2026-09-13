// Rattachement d'une extension à sa série, partagé par le catalogue des
// extensions et la page d'un Pokémon.
//
// La liste des extensions renvoyée par l'API ne précise pas leur série (Base,
// XY, Écarlate et Violet...) — seule la fiche détaillée d'une extension le
// fait. On la déduit donc du début de l'identifiant (ex : "swsh8" → Épée et
// Bouclier), en se basant sur les codes utilisés par TCGdex pour chaque
// grande période du jeu.

const ERA_NAMES = {
  base: 'Base', neo: 'Neo', ecard: 'e-Card', ex: 'EX',
  dp: 'Diamant & Perle', pl: 'Platine', hgss: 'HeartGold & SoulSilver',
  hs: 'HeartGold & SoulSilver', bw: 'Noir & Blanc', xy: 'XY',
  sm: 'Soleil et Lune', swsh: 'Épée et Bouclier',
  sv: 'Écarlate et Violet', me: 'Méga-Évolution',
};
const ERA_PREFIXES = ['ecard', 'hgss', 'swsh', 'base', 'neo', 'bw', 'xy', 'sm', 'sv', 'me', 'dp', 'pl', 'ex'];

const POCKET_SERIES = 'Pokémon TCG Pocket';

function guessSeriesName(id){
  if(/^[AB]\d/.test(id) || id === 'P-A') return POCKET_SERIES;
  if(id === 'dv1') return ERA_NAMES.bw;
  if(id === 'col1') return ERA_NAMES.hgss;
  if(id === 'g1' || id === 'dc1') return ERA_NAMES.xy;
  if(id === 'det1') return ERA_NAMES.sm;
  if(id.startsWith('cel')) return ERA_NAMES.swsh;
  let m = id.match(/^tk-([a-z]+)-/) || id.match(/^\d{4}([a-z]+)/);
  if(m && ERA_NAMES[m[1]]) return ERA_NAMES[m[1]];
  for(const p of ERA_PREFIXES) if(id.startsWith(p)) return ERA_NAMES[p];
  return 'Autres';
}

// Pokémon TCG Pocket est un jeu mobile, hors périmètre de cette première
// version consacrée aux cartes physiques.
function isPocketSet(setId){
  return guessSeriesName(setId) === POCKET_SERIES;
}
