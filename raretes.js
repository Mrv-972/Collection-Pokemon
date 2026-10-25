const ICONES_RARETE = {
  'Un Diamant':               ['losange', 1],
  'Deux Diamants':            ['losange', 2],
  'Trois Diamants':           ['losange', 3],
  'Quatre Diamants':          ['losange', 4],
  'Une Étoile':               ['etoile', 1],
  'Deux Étoiles':             ['etoile', 2],
  'Trois Étoiles':            ['etoile', 3],
  'Couronne':                 ['couronne', 1],
  'Chromatique':              ['chromatique', 1],
  'Chromatique deux étoiles': ['chromatique', 2],
};

const ORDRE_RARETES_POCKET = [
  'Un Diamant', 'Deux Diamants', 'Trois Diamants', 'Quatre Diamants',
  'Une Étoile', 'Deux Étoiles', 'Chromatique', 'Chromatique deux étoiles',
  'Trois Étoiles', 'Couronne',
];

function rarityIcon(rarity){
  const icone = ICONES_RARETE[rarity];
  if(icone){
    const [nom, nombre] = icone;
    return `<img class="icone-rarete" src="images/raretes/${nom}.png" alt="" aria-hidden="true" loading="lazy">`.repeat(nombre);
  }
  return typeof raritySymbol === 'function' ? raritySymbol(rarity) : (rarity ?? '');
}

const STYLE_RARETES = `
  .icone-rarete{height:1.05em;width:auto;vertical-align:-.16em;display:inline-block}
  .icone-rarete + .icone-rarete{margin-left:1px}
`;
