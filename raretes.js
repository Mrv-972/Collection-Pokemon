// Icônes de rareté, partagées par les pages qui montrent des cartes.
//
// Pokémon TCG Pocket dit la rareté d'une carte en symboles — des losanges,
// des étoiles, une couronne — et le jeu en publie les dessins. Ils valent
// mieux que les caractères typographiques qui les approchaient.
//
// Cette table a été sortie de cards.js le jour où la page des missions en a
// eu besoin : deux copies auraient fini par diverger. Les quarante raretés
// du jeu physique, elles, n'ont pas d'icône et restent dans cards.js avec
// leurs symboles typographiques.

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

function rarityIcon(rarity){
  const icone = ICONES_RARETE[rarity];
  if(icone){
    const [nom, nombre] = icone;
    return `<img class="icone-rarete" src="images/raretes/${nom}.png" alt="" aria-hidden="true" loading="lazy">`.repeat(nombre);
  }
  // Hors Pocket, cards.js sait rendre un symbole ; à défaut, le nom de la
  // rareté en toutes lettres vaut mieux qu'un vide.
  return typeof raritySymbol === 'function' ? raritySymbol(rarity) : (rarity ?? '');
}

// Les pages sans grille de cartes n'ont pas la règle de style qui dimensionne
// ces icônes : elle voyage avec elles.
const STYLE_RARETES = `
  .icone-rarete{height:1.05em;width:auto;vertical-align:-.16em;display:inline-block}
  .icone-rarete + .icone-rarete{margin-left:1px}
`;
