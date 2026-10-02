// La deuxième source tient-elle ses promesses ?
// =============================================
//
// pokemon-tcg-data est un dépôt GitHub qui décrit les extensions et les
// cartes du jeu physique, avec pour chacune l'adresse d'un visuel chez
// images.pokemontcg.io. Avant d'y bâtir quoi que ce soit, trois questions
// se posent, et aucune ne se devine :
//
//   1. ses adresses répondent-elles vraiment ?
//   2. autorisent-elles d'être peintes dans une image à partager, comme
//      TCGdex le fait avec « access-control-allow-origin » ?
//   3. combien de NOS trous comblerait-elle au juste ?
//
// La troisième est la seule qui dise si l'effort en vaut la peine. On la
// mesure sur les cartes dont on sait déjà que TCGdex n'a rien.
//
//   node outils/sonde-source-pokemontcg.mjs --instantane donnees --source /tmp/ptcgdata

import { readFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));
const dossier = args.instantane ?? 'donnees';
const source = args.source ?? '/tmp/ptcgdata';
const IDENTITE = { 'User-Agent': 'PokeClasseur (sonde de la deuxieme source)' };

// Notre « sv01 » est leur « sv1 » : un zéro de remplissage en trop.
const sansZero = id => id.replace(/^([a-z]+)0+(\d)/, '$1$2');

async function interroger(adresse){
  try{
    const r = await fetch(adresse, {
      headers: { ...IDENTITE, Origin: 'https://mrv-972.github.io' } });
    const type = r.headers.get('content-type') ?? '';
    const cors = r.headers.get('access-control-allow-origin');
    r.body?.cancel();
    return { ok: r.ok && type.startsWith('image/'), code: r.status, cors };
  }catch(err){
    return { ok: false, code: 'réseau', cors: null, err: err.message };
  }
}

const leursSets = JSON.parse(await readFile(`${source}/sets/en.json`, 'utf8'));
const parId = new Map(leursSets.map(s => [s.id, s]));
const nos = JSON.parse(await readFile(`${dossier}/physique/extensions.json`, 'utf8'));

// Les extensions dont on a mesuré que TCGdex n'a RIEN.
const MUETTES = new Set(`miscp bog ex5.5 tk-ex-latia tk-ex-latio exu tk-ex-m tk-ex-p
tk-dp-l tk-dp-m tk-hs-g tk-hs-r 2011bw tk-bw-e tk-bw-z 2012bw 2013bw xya tk-xy-n
tk-xy-sy 2014xy tk-xy-b tk-xy-w tk-xy-latia tk-xy-latio 2015xy tk-xy-p tk-xy-su
2016xy tk-sm-r tk-sm-l 2017sm sm3.5 2018sm-fr sm7.5 2018sm 2019sm 2019sm-fr
2021swsh swsh4.5sv cel25cc swsh9tg swsh10tg 2022swsh swsh11tg swsh12tg swsh12.5gg
sve 2023sv mfb 2024sv mee 30th-c`.split(/\s+/).filter(Boolean));

// --- 1 et 2 : la source répond-elle, et autorise-t-elle la peinture ? ----
console.log("Témoins — des visuels dont le dépôt affirme qu'ils existent :");
let corsPartout = true, repondPartout = true;
for(const set of ['base1', 'swsh1', 'sv1']){
  for(const quoi of [`${set}/logo.png`, `${set}/1.png`, `${set}/1_hires.png`]){
    const r = await interroger(`https://images.pokemontcg.io/${quoi}`);
    if(!r.ok) repondPartout = false;
    if(r.cors !== '*') corsPartout = false;
    console.log(`  ${String(r.code).padEnd(5)} ${r.ok ? 'image' : '     '}  ` +
      `cors: ${r.cors ?? '(absent)'}   ${quoi}`);
  }
}
if(!repondPartout){
  console.log('\nLa source ne répond pas : inutile d\'aller plus loin.');
  process.exit(1);
}
console.log(corsPartout
  ? "\nLes visuels sont peignables : le partage d'un classeur les accepterait."
  : "\nATTENTION : sans autorisation, ces visuels casseraient le partage d'un classeur.");

// --- 3 : combien de nos trous comblerait-elle ? --------------------------
console.log('\nCe que la source couvrirait, extension muette par extension muette :\n');
let cartesMuettes = 0, cartesCouvertes = 0;
const couvertes = [], hors = [];

for(const ext of nos){
  if(!MUETTES.has(ext.id)) continue;
  let nous = [];
  try{
    nous = JSON.parse(await readFile(
      `${dossier}/physique/sets/${encodeURIComponent(ext.id)}.json`, 'utf8'));
  }catch{}
  cartesMuettes += nous.length;

  const leurId = parId.has(ext.id) ? ext.id
    : (parId.has(sansZero(ext.id)) ? sansZero(ext.id) : null);
  if(!leurId){
    hors.push(`${ext.id} (${nous.length} cartes) — ${ext.name}`);
    console.log(`non  ${ext.id.padEnd(12)} absente de la source        ${ext.name}`);
    continue;
  }

  let leurs = [];
  try{ leurs = JSON.parse(await readFile(`${source}/cards/en/${leurId}.json`, 'utf8')); }catch{}
  const leursNum = new Map(leurs.map(c => [String(c.number).toUpperCase(), c]));
  const appariees = nous.filter(c =>
    leursNum.has(String(c.localId).toUpperCase()) ||
    leursNum.has(String(Number(c.localId)))).length;

  // On vérifie que l'adresse annoncée répond vraiment, sur un échantillon.
  const temoin = leurs[0]?.images?.small;
  const vraie = temoin ? (await interroger(temoin)).ok : false;

  if(vraie) cartesCouvertes += appariees;
  couvertes.push(`${ext.id} → ${leurId} : ${appariees}/${nous.length}${vraie ? '' : ' (adresse muette)'}`);
  console.log(`${vraie ? 'oui' : 'NON'}  ${ext.id.padEnd(12)} ${String(appariees + '/' + nous.length).padEnd(10)} ` +
    `→ ${leurId.padEnd(10)} ${ext.name}`);
}

// --- 4 : et les trous À L'INTÉRIEUR des extensions couvertes ? ----------
//
// Les 53 extensions muettes ne sont pas tout le problème : une extension
// peut avoir la plupart de ses visuels et en manquer quelques-uns. Ces
// trous-là sont invisibles dans le décompte ci-dessus, et c'est peut-être
// là que la deuxième source rend le plus de services.
console.log("\nLes trous à l'intérieur des extensions par ailleurs servies :\n");
let sondees = 0, trous = 0, combles = 0;
const aideesParExtension = [];

for(const ext of nos){
  if(MUETTES.has(ext.id)) continue;
  let nous = [];
  try{
    nous = JSON.parse(await readFile(
      `${dossier}/physique/sets/${encodeURIComponent(ext.id)}.json`, 'utf8'));
  }catch{}
  if(!nous.length) continue;

  // Un échantillon réparti : les numéros élevés sont les cartes spéciales,
  // celles qui manquent le plus souvent.
  const pas = Math.max(1, Math.floor(nous.length / 5));
  const echantillon = [];
  for(let i = 0; i < nous.length && echantillon.length < 5; i += pas) echantillon.push(nous[i]);

  const leurId = parId.has(ext.id) ? ext.id
    : (parId.has(sansZero(ext.id)) ? sansZero(ext.id) : null);
  let leursNum = new Map();
  if(leurId){
    try{
      const leurs = JSON.parse(await readFile(`${source}/cards/en/${leurId}.json`, 'utf8'));
      leursNum = new Map(leurs.map(c => [String(c.number).toUpperCase(), c]));
    }catch{}
  }

  let trousIci = 0, comblesIci = 0;
  for(const c of echantillon){
    sondees++;
    const fr = await interroger(c.image);
    if(fr.ok) continue;
    const en = await interroger(c.image.replace('/fr/', '/en/'));
    if(en.ok) continue;          // l'anglais suffit : ce n'est pas un trou
    trous++; trousIci++;
    const sien = leursNum.get(String(c.localId).toUpperCase())
             ?? leursNum.get(String(Number(c.localId)));
    if(sien?.images?.small && (await interroger(sien.images.small)).ok){
      combles++; comblesIci++;
    }
  }
  if(trousIci){
    aideesParExtension.push(`${ext.id} : ${comblesIci}/${trousIci} comblés`);
    console.log(`${ext.id.padEnd(12)} ${comblesIci}/${trousIci} comblés   ${ext.name}`);
  }
}

console.log('\n================ bilan ================');
console.log(`cartes dans les extensions muettes : ${cartesMuettes}`);
console.log(`que la deuxième source comblerait  : ${cartesCouvertes} ` +
  `(${cartesMuettes ? (100*cartesCouvertes/cartesMuettes).toFixed(1) : 0} %)`);
console.log(`\nailleurs : ${sondees} cartes sondées hors extensions muettes,`);
console.log(`  dont ${trous} introuvables chez TCGdex dans les deux langues,`);
console.log(`  dont ${combles} que la deuxième source comblerait ` +
  `(${trous ? (100*combles/trous).toFixed(0) : 0} %)`);

console.log(`\n${hors.length} extensions restent hors de portée des deux sources :`);
for(const h of hors) console.log(`  ${h}`);
