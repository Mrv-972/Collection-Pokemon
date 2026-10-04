// Pokécardex : trouver nos séries manquantes et la forme de leurs visuels.
// =========================================================================
//
// Rectification d'une erreur à moi : je les croyais en « application
// JavaScript » parce qu'une lecture simple ne rendait qu'une coquille de
// 159 Ko sans un lien. C'était Cloudflare — la sonde au navigateur a
// montré un « cdn-cgi/challenge-platform », donc une page de vérification
// anti-robot, pas une coquille vide. Avec un vrai navigateur, elle passe.
//
// Ce qu'on sait désormais, mesuré : robots.txt autorise tout ; les pages
// portent de vrais liens ; les images viennent de pokecardex.b-cdn.net et
// ce CDN répond « access-control-allow-origin: * », donc on pourrait les
// afficher sans les copier — contrairement à Poképédia.
//
// Reste à savoir : où sont listées les séries, comment on nomme les
// nôtres chez eux, et à quoi ressemble l'adresse d'un visuel de carte.
//
//   node outils/sonde-pokecardex-series.mjs

import { chromium } from 'playwright';

const RACINE = 'https://www.pokecardex.com';
const IDENTITE = 'PokeClasseur/1.0 (reperage de visuels francais ; ' +
                 'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)';

// Nos trous, et ce qu'on espère retrouver chez eux.
const CIBLES = [
  { id: 'swsh4.5sv',  nom: 'Destinées Radieuses Coffre Étincelant', manque: 96 },
  { id: 'sma',        nom: 'Destinées Occultes Coffre Étincelant',  manque: 94 },
  { id: 'swsh12.5gg', nom: 'Zénith Suprême Galerie Galaroise',      manque: 70 },
  { id: 'basep',      nom: 'Wizards Black Star Promos',             manque: 53 },
  { id: '2018sm-fr',  nom: "Collection McDonald's 2018",            manque: 40 },
  { id: 'tk-bw-z',    nom: 'BW Kit du dresseur (Zoroark)',          manque: 30 },
];

const nav = await chromium.launch();
const contexte = await nav.newContext({ userAgent: IDENTITE, locale: 'fr-FR',
                                        viewport: { width: 1400, height: 1000 } });
const page = await contexte.newPage();

// --- 1. la liste des séries ---------------------------------------------
console.log('=============== /series ===============');
await page.goto(`${RACINE}/series`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);

const series = await page.evaluate(() =>
  [...document.querySelectorAll('a[href]')]
    .map(a => ({ href: a.getAttribute('href'), texte: (a.textContent ?? '').trim().slice(0, 60) }))
    .filter(x => x.href && /\/(serie|set|db)s?\//i.test(x.href))
    .filter((x, i, t) => t.findIndex(y => y.href === x.href) === i));

console.log(`${series.length} liens de série trouvés.`);
for(const s of series.slice(0, 25)) console.log(`  ${s.href.padEnd(40)} ${s.texte}`);
if(series.length > 25) console.log(`  … et ${series.length - 25} autres`);

// --- 2. nos trous, cherchés dans cette liste -----------------------------
const aplatir = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '');
console.log('\n=============== nos trous dans leur liste ===============');
const trouves = [];
for(const c of CIBLES){
  // On cherche les mots marquants du nom plutôt que le nom entier : leurs
  // intitulés ne sont pas forcément les nôtres au caractère près.
  const mots = c.nom.split(/[\s()]+/).filter(m => m.length > 4).map(aplatir);
  const candidat = series.find(s => {
    const t = aplatir(s.texte);
    return mots.length && mots.every(m => t.includes(m));
  }) ?? series.find(s => {
    const t = aplatir(s.texte);
    return mots.some(m => m.length > 6 && t.includes(m));
  });
  console.log(`  ${c.id.padEnd(12)} ${String(c.manque).padStart(3)} à combler  ${c.nom}`);
  console.log(`       -> ${candidat ? candidat.href + '   « ' + candidat.texte + ' »' : 'PAS TROUVÉ dans la liste'}`);
  if(candidat) trouves.push({ ...c, href: candidat.href });
}

// --- 3. à quoi ressemble une page de série, et ses visuels ? -------------
console.log('\n=============== une page de série ===============');
const essai = trouves[0] ?? { href: series[0]?.href, id: '(première de la liste)' };
if(essai.href){
  const adresse = essai.href.startsWith('http') ? essai.href : RACINE + essai.href;
  console.log(`  ${essai.id} -> ${adresse}`);
  const visuels = new Set();
  page.on('response', r => {
    if(r.request().resourceType() === 'image') visuels.add(r.url());
  });
  await page.goto(adresse, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  // Descendre : beaucoup de sites ne chargent leurs images qu'à l'approche.
  for(let i = 0; i < 4; i++){
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
  }
  const cartes = [...visuels].filter(u => !/symbole|langue|logo|favicon|banner|partenaire/i.test(u));
  console.log(`  ${cartes.length} visuels de carte vus :`);
  for(const u of cartes.slice(0, 10)) console.log(`      ${u}`);
  const liens = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')))]
      .filter(h => h && /carte|card/i.test(h)).slice(0, 6));
  console.log(`  liens de carte : ${liens.join('  ') || '(aucun)'}`);
}

await nav.close();
console.log('\nRien n’a été téléchargé : seules des adresses ont été lues.');
