// Mon calcul d'adresse est-il faux, ou l'image n'existe-t-elle pas ?
// =================================================================
//
// La construction fabrique l'adresse d'un visuel par calcul :
//     https://assets.tcgdex.net/<langue>/<série>/<extension>/<numéro>/low.webp
// Quand elle répond 404 dans les deux langues, deux explications tiennent,
// et elles n'appellent pas du tout le même remède :
//
//   — le fichier n'existe pas          → il faut une autre source ;
//   — mon adresse est fausse           → il suffit de la corriger.
//
// L'API de TCGdex, elle, connaît la vraie adresse de chaque carte : elle la
// publie dans le champ « image ». On la lui demande et on compare. Rien
// n'est modifié ; on lit le journal.
//
//   node outils/sonde-adresses-tcgdex.mjs --instantane donnees

import { readFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));
const dossier = args.instantane ?? 'donnees';
const IDENTITE = { 'User-Agent': 'PokeClasseur (sonde des adresses)' };

// Les extensions dont la sonde précédente n'a rien tiré, dans aucune langue.
const MUETTES = `miscp bog ex5.5 tk-ex-latia tk-ex-latio exu tk-ex-m tk-ex-p tk-dp-l
tk-dp-m tk-hs-g tk-hs-r 2011bw tk-bw-e tk-bw-z 2012bw 2013bw xya tk-xy-n tk-xy-sy
2014xy tk-xy-b tk-xy-w tk-xy-latia tk-xy-latio 2015xy tk-xy-p tk-xy-su 2016xy
tk-sm-r tk-sm-l 2017sm sm3.5 2018sm-fr sm7.5 2018sm 2019sm 2019sm-fr 2021swsh
swsh4.5sv cel25cc swsh9tg swsh10tg 2022swsh swsh11tg swsh12tg swsh12.5gg sve
2023sv mfb 2024sv mee 30th-c`.split(/\s+/).filter(Boolean);

async function lireJson(adresse){
  try{
    const r = await fetch(adresse, { headers: IDENTITE });
    if(!r.ok) return { erreur: `HTTP ${r.status}` };
    return await r.json();
  }catch(err){
    return { erreur: err.message };
  }
}

async function estUneImage(adresse){
  if(!adresse) return false;
  try{
    const r = await fetch(adresse, { headers: IDENTITE });
    const type = r.headers.get('content-type') ?? '';
    r.body?.cancel();
    return r.ok && type.startsWith('image/');
  }catch{ return false; }
}

console.log(`${MUETTES.length} extensions muettes à éclaircir.\n`);
const verdicts = { 'adresse fausse': [], 'vraiment absente': [], 'extension inconnue': [] };

for(const setId of MUETTES){
  let nous = [];
  try{
    nous = JSON.parse(await readFile(
      `${dossier}/physique/sets/${encodeURIComponent(setId)}.json`, 'utf8'));
  }catch{ /* pas de fichier */ }
  if(!nous.length){ verdicts['extension inconnue'].push(`${setId} (aucune carte chez nous)`); continue; }

  const carte = nous[0];
  const fiche = await lireJson(`https://api.tcgdex.net/v2/fr/cards/${encodeURIComponent(carte.id)}`);
  if(fiche.erreur){
    verdicts['extension inconnue'].push(`${setId} — l'API ne connaît pas ${carte.id} (${fiche.erreur})`);
    console.log(`${setId.padEnd(12)} API : ${fiche.erreur}`);
    continue;
  }

  // L'API livre l'adresse sans extension de fichier : on la complète comme
  // le fait le site.
  const sienne = fiche.image ? `${fiche.image}/low.webp` : null;
  const notre = carte.image;
  const memeAdresse = sienne === notre;
  const sienneMarche = await estUneImage(sienne);

  if(!sienne){
    verdicts['vraiment absente'].push(`${setId} — l'API ne donne aucune image`);
    console.log(`${setId.padEnd(12)} l'API elle-même n'a pas d'image pour ${carte.id}`);
  }else if(sienneMarche && !memeAdresse){
    verdicts['adresse fausse'].push(`${setId} → ${sienne}`);
    console.log(`${setId.padEnd(12)} ADRESSE FAUSSE`);
    console.log(`${' '.repeat(12)}   la nôtre : ${notre}`);
    console.log(`${' '.repeat(12)}   la vraie : ${sienne}`);
  }else if(sienneMarche){
    console.log(`${setId.padEnd(12)} même adresse, et elle marche — à re-sonder`);
  }else{
    verdicts['vraiment absente'].push(`${setId} (${sienne})`);
    console.log(`${setId.padEnd(12)} absente : même l'adresse de l'API ne répond pas`);
  }
}

console.log('\n================ bilan ================');
for(const [verdict, liste] of Object.entries(verdicts)){
  console.log(`\n${verdict} : ${liste.length}`);
  for(const l of liste) console.log(`  ${l}`);
}
