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

// Pokémon TCG Pocket range ses extensions en grandes séries désignées par
// une lettre : A1, A1a, A2... pour la série A, puis B1, B1a... pour la
// suivante. Les cartes promotionnelles de chaque série portent « P-A »,
// « P-B ».
//
// La lettre est lue plutôt qu'énumérée, pour deux raisons. La première est
// qu'une liste figée laissait « P-B » dehors — et pas simplement absent :
// faute de correspondre à quoi que ce soit, il atterrissait du côté des
// cartes physiques, dans « Autres ». La seconde est qu'une série C sortira,
// et qu'elle doit apparaître sans que j'aie à repasser derrière.
//
// Une majuscule suivie d'un chiffre ne se rencontre que là : le jeu physique
// n'utilise que des identifiants en minuscules (base1, swsh5, sv03.5...).
function lettreSeriePocket(id){
  const m = String(id).match(/^([A-Z])\d/) || String(id).match(/^P-([A-Z])$/);
  return m ? m[1] : null;
}

// Une vingtaine d'extensions physiques ne commencent par aucun des préfixes
// d'époque et atterrissaient toutes dans « Autres » : les deux séries Gym,
// les neuf POP Series, les promotions, et jusqu'à l'extension du 30e
// anniversaire. Les voici rangées.
const SERIES_PARTICULIERES = {
  gym1: 'Gym', gym2: 'Gym',
  lc: 'Legendary Collection',
  rc: 'Noir & Blanc',                 // la Radiant Collection accompagnait Trésors Légendaires
  '30th': '30ᵉ Anniversaire', '30th-c': '30ᵉ Anniversaire',
  // Promotions, distributions et hors-format : des extensions bien réelles,
  // mais qui n'appartiennent à aucune époque du jeu.
  np: 'Promos et hors-série', wp: 'Promos et hors-série', miscp: 'Promos et hors-série',
  jumbo: 'Promos et hors-série', si1: 'Promos et hors-série', sp: 'Promos et hors-série',
  bog: 'Promos et hors-série', ru1: 'Promos et hors-série',
  fut2020: 'Promos et hors-série', mfb: 'Promos et hors-série',
};

function guessSeriesName(id){
  const lettre = lettreSeriePocket(id);
  if(lettre) return `Série ${lettre}`;
  if(SERIES_PARTICULIERES[id]) return SERIES_PARTICULIERES[id];
  if(/^pop\d/.test(id)) return 'POP Series';
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

// Pokémon TCG Pocket est un jeu mobile : ses extensions vivent dans l'autre
// moitié du site.
function isPocketSet(setId){
  return lettreSeriePocket(setId) !== null;
}
