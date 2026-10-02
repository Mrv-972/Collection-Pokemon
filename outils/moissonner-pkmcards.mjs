// Relever les visuels français chez PkmCards, au navigateur.
// ==========================================================
//
// Leurs pages construisent la liste des cartes par JavaScript : une simple
// lecture du code livré ne rend rien. Il faut donc un vrai navigateur, qui
// laisse la page s'exécuter avant qu'on regarde ce qu'elle contient.
//
// Cet outil NE TÉLÉCHARGE AUCUNE IMAGE. Il relève des adresses et les range
// dans un fichier, rien de plus. Ce qu'on en fera ensuite est une autre
// décision, qui n'est pas prise ici.
//
// Il est volontairement lent et bavard sur son identité : une pause entre
// chaque page, un seul onglet, et un « User-Agent » qui dit qui frappe à la
// porte. Un site de communauté n'a pas à subir notre impatience.
//
//   node outils/moissonner-pkmcards.mjs --sortie donnees [--series 3] [--essai]

import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = args.sortie ?? 'donnees';
const combienDeSeries = args.series ? Number(args.series) : Infinity;
const essai = Boolean(args.essai);
const PAUSE = Number(args.pause ?? 2500);   // entre deux pages, en millisecondes

const RACINE = 'https://www.pkmcards.fr';
const IDENTITE = 'PokeClasseur/1.0 (collecte de visuels francais ; ' +
                 'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)';

const dormir = ms => new Promise(r => setTimeout(r, ms));

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({
  userAgent: IDENTITE,
  locale: 'fr-FR',
  // Les visuels eux-mêmes ne nous intéressent pas : on veut leurs adresses.
  // Les bloquer allège la page et épargne leur serveur.
  viewport: { width: 1280, height: 2000 },
});
await contexte.route('**/*', route => {
  const type = route.request().resourceType();
  if(type === 'image' || type === 'media' || type === 'font') return route.abort();
  route.continue();
});
const page = await contexte.newPage();

// ------------------------------------------------- la liste des séries ---
console.log('Lecture de la liste des séries…');
await page.goto(`${RACINE}/series`, { waitUntil: 'domcontentloaded', timeout: 60000 });
const series = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href^="/series/"]')]
    .map(a => a.getAttribute('href')))]);
console.log(`${series.length} séries listées.\n`);

const retenues = series.slice(0, combienDeSeries);
if(retenues.length < series.length){
  console.log(`(on n'en traite que ${retenues.length} : passe de reconnaissance)\n`);
}

// ------------------------------------------------- chaque série -----------
// Une adresse de carte chez eux : /cards/<code>-fr-<numéro>-<nom en clair>
const DECOUPE = /^\/cards\/([a-z0-9.]+)-fr-(\d+[a-z]?)-/i;

const releve = {};      // "<code>-<numéro>" → adresse du visuel
const parSerie = [];
let sansRien = 0;

for(const chemin of retenues){
  await dormir(PAUSE);
  let cartes = [];
  try{
    await page.goto(`${RACINE}${chemin}`, { waitUntil: 'networkidle', timeout: 60000 });
    // La liste arrive après coup : on attend qu'une carte paraisse, sans
    // faire échouer la série si elle n'en a aucune.
    await page.waitForSelector('a[href^="/cards/"]', { timeout: 15000 }).catch(() => {});
    cartes = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="/cards/"]')].map(a => {
        const img = a.querySelector('img');
        return {
          lien: a.getAttribute('href'),
          // Une image paresseuse garde son adresse dans « data-src » tant
          // qu'elle n'est pas affichée : on regarde les deux.
          src: img?.getAttribute('src') || img?.getAttribute('data-src') || null,
        };
      }));
  }catch(err){
    console.log(`  ÉCHEC ${chemin} — ${err.message.split('\n')[0]}`);
    continue;
  }

  let gardees = 0;
  for(const c of cartes){
    const m = DECOUPE.exec(c.lien ?? '');
    if(!m || !c.src) continue;
    const adresse = c.src.startsWith('http') ? c.src : `https:${c.src}`;
    if(!adresse.includes('/cards/fr/')) continue;
    releve[`${m[1].toLowerCase()}-${m[2]}`] = adresse;
    gardees++;
  }
  if(!gardees) sansRien++;
  parSerie.push({ chemin, vues: cartes.length, gardees });
  console.log(`  ${String(gardees).padStart(4)} visuels  (${cartes.length} liens)  ${chemin}`);
}

await navigateur.close();

// ------------------------------------------------------------- bilan ------
console.log(`\n================ bilan ================`);
console.log(`séries parcourues   : ${parSerie.length}`);
console.log(`séries sans visuel  : ${sansRien}`);
console.log(`visuels relevés     : ${Object.keys(releve).length}`);
const codes = [...new Set(Object.keys(releve).map(c => c.replace(/-[^-]+$/, '')))];
console.log(`codes d'extension   : ${codes.length}`);
console.log(`   ${codes.slice(0, 40).join(', ')}`);

if(essai){
  console.log('\n--essai : rien n\'est écrit.');
  const apercu = Object.entries(releve).slice(0, 5);
  for(const [cle, a] of apercu) console.log(`   ${cle}  ${a}`);
}else{
  await mkdir(sortie, { recursive: true });
  const fichier = `${sortie}/visuels-pkmcards.json`;
  await writeFile(fichier, JSON.stringify({
    source: 'https://www.pkmcards.fr',
    releveLe: new Date().toISOString(),
    // On garde la trace de ce qu'on a parcouru : un relevé partiel qu'on
    // prendrait pour complet ferait conclure à tort à une absence.
    seriesParcourues: parSerie.length,
    seriesEnTout: series.length,
    visuels: releve,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
