import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const valeur = nom => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : null;
};
const dossier = valeur('--instantane') ?? 'donnees';
const IDENTITE = { 'User-Agent': 'PokeClasseur (sonde des logos de serie)' };

async function interroger(adresse){
  try{
    const r = await fetch(adresse, { headers: IDENTITE });
    const type = r.headers.get('content-type') ?? '';
    r.body?.cancel();
    return { code: r.status, image: r.ok && type.startsWith('image/') };
  }catch(err){
    return { code: 'réseau', image: false, err: err.message };
  }
}

async function ligne(etiquette, adresse){
  const r = await interroger(adresse);
  console.log(`  ${String(r.code).padEnd(7)} ${r.image ? 'image' : '     '}  ${etiquette}  ${adresse}`);
  return r;
}

const extensions = JSON.parse(await readFile(`${dossier}/physique/extensions.json`, 'utf8'));

console.log('Témoins : des visuels dont on sait qu\'ils existent :');
const temoins = [
  ['logo base1  ', 'https://assets.tcgdex.net/fr/base/base1/logo.png'],
  ['logo sv01   ', 'https://assets.tcgdex.net/fr/sv/sv01/logo.png'],
  ['carte base1 ', 'https://assets.tcgdex.net/fr/base/base1/1/high.png'],
];
let unTemoinRepond = false;
for(const [nom, adresse] of temoins){
  if((await ligne(nom, adresse)).image) unTemoinRepond = true;
}
if(!unTemoinRepond){
  console.log('\nAucun témoin ne répond : le serveur est hors d\'atteinte ou refuse');
  console.log('nos requêtes. La sonde ne peut rien conclure sur les séries.');
  process.exit(1);
}

const series = new Map();
for(const e of extensions){
  if(e.serieId && !series.has(e.serieId)) series.set(e.serieId, e.serieNom);
}

const formes = id => [
  ['png ', `https://assets.tcgdex.net/fr/${id}/logo.png`],
  ['webp', `https://assets.tcgdex.net/fr/${id}/logo.webp`],
  ['nu  ', `https://assets.tcgdex.net/fr/${id}/logo`],
  ['en  ', `https://assets.tcgdex.net/en/${id}/logo.png`],
  ['symb', `https://assets.tcgdex.net/fr/${id}/symbol.png`],
];

console.log(`\n${series.size} séries à sonder.\n`);
const avec = [], sans = [];
for(const [id, nom] of series){
  let trouve = null;
  for(const [forme, adresse] of formes(id)){
    const r = await interroger(adresse);
    if(r.image){ trouve = { forme, adresse }; break; }
  }
  if(trouve){
    avec.push(`${id} : ${nom} → ${trouve.adresse}`);
    console.log(`oui  ${id.padEnd(8)} ${nom.padEnd(26)} ${trouve.adresse}`);
  }else{
    sans.push(`${id} : ${nom}`);
    console.log(`non  ${id.padEnd(8)} ${nom}`);
  }
}

console.log(`\n${avec.length} avec logo, ${sans.length} sans.`);
if(avec.length) console.log('\nAvec logo :\n  ' + avec.join('\n  '));
if(sans.length) console.log('\nSans logo :\n  ' + sans.join('\n  '));
