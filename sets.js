const ERA_NAMES = {
  base: 'Base', neo: 'Neo', ecard: 'e-Card', ex: 'EX',
  dp: 'Diamant & Perle', pl: 'Platine', hgss: 'HeartGold & SoulSilver',
  hs: 'HeartGold & SoulSilver', bw: 'Noir & Blanc', xy: 'XY',
  sm: 'Soleil et Lune', swsh: 'Épée et Bouclier',
  sv: 'Écarlate et Violet', me: 'Méga-Évolution',
};
const ERA_PREFIXES = ['ecard', 'hgss', 'swsh', 'base', 'neo', 'bw', 'xy', 'sm', 'sv', 'me', 'dp', 'pl', 'ex'];

function lettreSeriePocket(id){
  const m = String(id).match(/^([A-Z])\d/) || String(id).match(/^P-([A-Z])$/);
  return m ? m[1] : null;
}

const SERIES_PARTICULIERES = {
  gym1: 'Gym', gym2: 'Gym',
  lc: 'Legendary Collection',
  rc: 'Noir & Blanc',
  '30th': '30ᵉ Anniversaire', '30th-c': '30ᵉ Anniversaire',
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

function isPocketSet(setId){
  return lettreSeriePocket(setId) !== null;
}
