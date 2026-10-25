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

export const sansTiretPartout = valeur =>
  JSON.parse(JSON.stringify(valeur, (cle, v) => sansTiretCadratin(v)));
