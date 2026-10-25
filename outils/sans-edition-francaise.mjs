import { readFile, writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));
const sortie = typeof args.sortie === 'string' ? args.sortie : null;

const POKEDEX_FR = new Function((await readFile('pokedex-fr.js', 'utf8')) + '\nreturn POKEDEX_FR;')();
const plat = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/œ/gi, 'oe').toLowerCase();

const MOTS_ANGLAIS = /\b(the|of|with|at|and|friends|energy|trainer)\b|['’]s\b|^lt\.|special delivery|on the ball/i;
function langueDuNom(carte){
  const dex = carte.dexId ? POKEDEX_FR[carte.dexId - 1] : null;
  if(MOTS_ANGLAIS.test(carte.name ?? '')) return 'en';
  if(dex) return plat(carte.name).includes(plat(dex)) ? 'fr' : 'en';
  return '?';
}

const SERIE_ANGLAISE = 0.6;

let langues = {};
try{ langues = JSON.parse(await readFile('donnees/langue-visuels.json', 'utf8')).verdicts ?? {}; }catch{}
const lueEnFrancais = c => [c.image, String(c.image ?? '').replace('/low.webp', '/high.webp'),
  c.imageSecours, c.imageSecours && !/[?&]class=/.test(c.imageSecours) ? `${c.imageSecours}?class=md` : null,
  `depot:${c.id}`].some(u => u && langues[u]?.langue === 'fr');
const PREUVE_FRANCAISE = 3;

const verdict = JSON.parse(await readFile('donnees/verification-visuels.json', 'utf8'));
const sansEdition = [], visuelAnglais = [], introuvables = [];
const parExtension = {};

for(const [ext, e] of Object.entries(verdict.extensions)){
  const etat = new Map([
    ...(e.cartesAnglaises ?? []).map(c => [c.id, 'anglais']),
    ...(e.cartesManquantes ?? []).map(c => [c.id, 'aucun']),
  ]);
  if(!etat.size) continue;
  let cartes;
  try{ cartes = JSON.parse(await readFile(`donnees/physique/sets/${encodeURIComponent(ext)}.json`, 'utf8')); }
  catch{ continue; }
  const concernees = cartes.filter(c => etat.has(c.id)).map(c => ({ ...c, langueNom: langueDuNom(c) }));
  const jugees = concernees.filter(c => c.langueNom !== '?');
  const serieAuxNomsAnglais = concernees.length >= cartes.length / 2 && jugees.length >= 3 &&
    jugees.filter(c => c.langueNom === 'en').length / jugees.length >= SERIE_ANGLAISE;
  const editionFrancaisePrisee = serieAuxNomsAnglais &&
    cartes.filter(lueEnFrancais).length >= PREUVE_FRANCAISE;
  const anglaise = serieAuxNomsAnglais && !editionFrancaisePrisee;

  const b = parExtension[ext] = { nom: e.nom, sansEdition: 0, visuelAnglais: 0, introuvables: 0 };
  for(const c of concernees){
    if(anglaise || (c.langueNom === 'en' && !editionFrancaisePrisee)){ sansEdition.push(c.id); b.sansEdition++; }
    else if(etat.get(c.id) === 'anglais'){ visuelAnglais.push(c.id); b.visuelAnglais++; }
    else { introuvables.push(c.id); b.introuvables++; }
  }
}

const c = verdict.compte;
const francaises = c.depot + c.principal + c.secoursFrancais;
const editees = verdict.total - sansEdition.length;
const pc = (n, d) => `${(100 * n / d).toFixed(1)} %`;
console.log(`cartes du catalogue             : ${verdict.total}`);
console.log(`sans édition française          : ${sansEdition.length}`);
console.log(`éditées en français             : ${editees}`);
console.log(`  dont avec leur visuel français : ${francaises} (${pc(francaises, editees)})`);
console.log(`  visuel anglais faute du français : ${visuelAnglais.length}`);
console.log(`  aucun visuel trouvé             : ${introuvables.length}`);
console.log(`  indécises                       : ${c.indecis}`);
console.log('\npar extension :');
for(const [id, b] of Object.entries(parExtension).sort((x, y) =>
  (y[1].sansEdition + y[1].visuelAnglais + y[1].introuvables) - (x[1].sansEdition + x[1].visuelAnglais + x[1].introuvables)))
  console.log(`  ${id.padEnd(11)} sans édition ${String(b.sansEdition).padStart(4)}  visuel anglais ${String(b.visuelAnglais).padStart(3)}` +
    `  introuvable ${String(b.introuvables).padStart(3)}  ${b.nom}`);

if(sortie){
  const fichier = `${sortie}/sans-edition-francaise.json`;
  await writeFile(fichier, JSON.stringify({
    majLe: new Date().toISOString(),
    verificationDu: verdict.verifieLe,
    regle: "aucun visuel français trouvé ; « sans édition » si TCGdex n'en connaît que le nom anglais, " +
           "ou si l'extension a au moins la moitié de ses cartes sans visuel français, " +
           `dont au moins ${SERIE_ANGLAISE * 100} % à nom anglais`,
    couverture: { catalogue: verdict.total, editeesEnFrancais: editees, avecVisuelFrancais: francaises },
    sansEdition, visuelAnglais, introuvables, parExtension,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
