// Quelles séries ont un logo chez TCGdex ?
//
// Le logo d'une série se range au même endroit que celui d'une extension,
// mais d'un cran plus haut : <langue>/<série>/logo.png. Toutes n'en ont pas,
// et rien dans les données ne le dit — seul le serveur sait. On lui demande,
// depuis un exécuteur GitHub : le bac à sable où ce fichier a été écrit
// n'atteint pas ce domaine.
//
//   node outils/sonde-logos-series.mjs --instantane donnees

import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const valeur = nom => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : null;
};
const dossier = valeur('--instantane') ?? 'donnees';

const IDENTITE = { 'User-Agent': 'PokeClasseur (sonde des logos de série)' };

async function existe(adresse){
  try{
    const r = await fetch(adresse, { method: 'HEAD', headers: IDENTITE });
    return r.ok;
  }catch{
    return false;
  }
}

const extensions = JSON.parse(await readFile(`${dossier}/physique/extensions.json`, 'utf8'));

// Un témoin : le logo d'une extension, dont on sait qu'il existe. Sans lui,
// « aucune série n'a de logo » pourrait vouloir dire « la sonde ne sonde
// rien » — un refus du réseau ressemble à une absence.
const temoin = extensions.find(e => e.logo)?.logo;
console.log(`Témoin (logo d'extension) ${temoin}`);
console.log(`  → ${await existe(temoin) ? 'trouvé' : 'ABSENT : la sonde ne prouve rien'}\n`);
const series = new Map();
for(const e of extensions){
  if(e.serieId && !series.has(e.serieId)) series.set(e.serieId, e.serieNom);
}

console.log(`${series.size} séries à sonder.\n`);
const avec = [], sans = [];
const FORMES = id => [
  `https://assets.tcgdex.net/fr/${id}/logo.png`,
  `https://assets.tcgdex.net/fr/${id}/logo.webp`,
  `https://assets.tcgdex.net/fr/${id}/logo`,
  `https://assets.tcgdex.net/en/${id}/logo.png`,
  `https://assets.tcgdex.net/fr/${id}/symbol.png`,
];

for(const [id, nom] of series){
  let trouvee = null;
  for(const adresse of FORMES(id)){
    if(await existe(adresse)){ trouvee = adresse; break; }
  }
  (trouvee ? avec : sans).push(`${id} — ${nom}${trouvee ? ' → ' + trouvee : ''}`);
  console.log(`${trouvee ? 'oui' : 'non'}  ${id.padEnd(16)} ${nom}${trouvee ? '  ' + trouvee : ''}`);
}

console.log(`\n${avec.length} avec logo, ${sans.length} sans.`);
if(sans.length) console.log('\nSans logo :\n  ' + sans.join('\n  '));
