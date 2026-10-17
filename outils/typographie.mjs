// Le site n'écrit pas de tiret cadratin. Les textes récoltés ailleurs
// (titres d'actualités, explications de Poképédia, noms relevés sur un
// site de cartes) en contiennent parfois : on les remplace avant de les
// déposer, avec les mêmes règles que pour le reste du site.
//
//   « A, une incise, B » encadrée de deux tirets → « A (une incise) B »
//   un tiret suivi de « et », « ou », « sinon »…  → une virgule
//   un autre tiret entre deux mots                 → deux-points
//   un tiret en fin de texte                       → rien
//   un tiret collé à un mot                        → un trait d'union

const TIRET = '\u2014';
const LIAISONS = "(?:et|ou|mais|donc|sinon|puis|avec|sans|jamais|même|soit|voire|ni|pas|y compris|c'est-à-dire)\\b";

export function sansTiretCadratin(texte){
  if(typeof texte !== 'string' || !texte.includes(TIRET)) return texte;
  let t = texte.replace(/\s+\u2014\s*$/, '');
  for(let i = 0; i < 3; i++) t = t.replace(/ \u2014 ([^\u2014]{1,140}?) \u2014(?=[ ,.;:)]|$)/g, ' ($1)');
  t = t.replace(new RegExp(` \\u2014 (?=${LIAISONS})`, 'gi'), ', ');
  t = t.replace(/ \u2014 /g, ' : ');
  return t.replace(/\s*\u2014\s*/g, '-');
}

// Toutes les chaînes d'une structure de données, à n'importe quelle profondeur.
export const sansTiretPartout = valeur =>
  JSON.parse(JSON.stringify(valeur, (cle, v) => sansTiretCadratin(v)));
