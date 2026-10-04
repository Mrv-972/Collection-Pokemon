// Quelle interface de données nourrit Pokécardex ?
// ================================================
//
// Mesuré : leur robots.txt autorise tout, mais chacune de leurs pages
// renvoie la même coquille de 159 Ko, sans un lien ni une image. C'est une
// application JavaScript — le contenu est construit dans le navigateur, à
// partir d'une interface de données qu'il faut trouver.
//
// Même situation que PkmCards, et la méthode qui avait fini par marcher :
// ouvrir dans un vrai navigateur et NOTER les requêtes émises, plutôt que
// d'en deviner une. Deviner m'a coûté quatre fausses pistes.
//
//   node outils/sonde-pokecardex-reseau.mjs

import { chromium } from 'playwright';

const RACINE = 'https://www.pokecardex.com';
const IDENTITE = 'PokeClasseur/1.0 (reperage ; ' +
                 'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)';

const nav = await chromium.launch();
const contexte = await nav.newContext({ userAgent: IDENTITE, locale: 'fr-FR',
                                        viewport: { width: 1280, height: 900 } });
const page = await contexte.newPage();

const demandes = [];
page.on('request', r => {
  const t = r.resourceType();
  if(t === 'xhr' || t === 'fetch')
    demandes.push({ methode: r.method(), url: r.url(), corps: (r.postData() ?? '').slice(0, 300) });
});
// Les adresses d'image sont le but final : on les note aussi, mais sans
// les télécharger.
const visuels = new Set();
page.on('response', r => {
  const t = r.request().resourceType();
  if(t === 'image') visuels.add(r.url());
});

async function voir(chemin, attente = 'networkidle'){
  console.log(`\n--- ${chemin} ---`);
  const avant = demandes.length;
  try{
    await page.goto(RACINE + chemin, { waitUntil: attente, timeout: 45000 });
  }catch(err){ console.log(`  (chargement : ${err.message.split('\n')[0]})`); }
  await page.waitForTimeout(3500);
  const titre = await page.title().catch(() => '?');
  const liens = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')))]
      .filter(h => h && h.startsWith('/')).slice(0, 10)).catch(() => []);
  console.log(`  titre : ${titre}`);
  console.log(`  liens : ${liens.join('  ') || '(aucun)'}`);
  for(const d of demandes.slice(avant)) console.log(`  -> ${d.methode} ${d.url}`);
}

await voir('/');
await voir('/series');
await voir('/db');

// --- les images servies -------------------------------------------------
console.log('\n=============== adresses d’image vues ===============');
const liste = [...visuels].filter(u => !/favicon|logo|icon|sprite/i.test(u));
console.log(`${liste.length} images (hors habillage) :`);
for(const u of liste.slice(0, 12)) console.log(`  ${u}`);

// --- l'affichage chez nous ----------------------------------------------
if(liste.length){
  console.log('\n=============== affichage chez nous (CORS) ===============');
  const r = await fetch(liste[0], { headers: { 'User-Agent': IDENTITE } });
  console.log(`  ${r.status}  ${r.headers.get('content-type')}` +
    `  ${r.headers.get('content-length') ?? '?'} octets`);
  console.log(`  access-control-allow-origin : ${r.headers.get('access-control-allow-origin') ?? 'ABSENT'}`);
}

console.log('\n=============== toutes les requêtes de données ===============');
if(!demandes.length) console.log('  aucune : tout arrive avec la page.');
for(const d of demandes.slice(0, 30)){
  console.log(`  ${d.methode} ${d.url}`);
  if(d.corps) console.log(`       corps: ${d.corps}`);
}

await nav.close();
