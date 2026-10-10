// Relever l'index des visuels français de Pokécardex.
// ====================================================
//
// Tout ce qui suit a été mesuré, pas supposé :
//
//   — robots.txt autorise tout ; seul Baidu est bloqué ;
//   — une lecture simple ne rend qu'une coquille de 159 Ko : c'est
//     Cloudflare, pas une application JavaScript. Il faut donc un vrai
//     navigateur, qui franchit sa page de vérification ;
//   — /series liste 249 séries sous la forme /series/<CODE> ; le code est
//     dans l'adresse ET dans l'attribut « alt » du symbole ;
//   — une page de série porte le nom français en <h1>, et chaque carte
//     une image dont l'adresse est de la forme
//         pokecardex-scans.b-cdn.net/sets/<CODE>/FR/<numéro>.jpg
//     avec « alt » valant « <nom> <numéro>/<total> » ;
//   — ces images sont en chargement différé (loading="lazy") : sans
//     descendre dans la page, on n'en voit qu'une partie. C'est l'erreur
//     qui m'avait fait rater dix cartes sur trente-quatre chez PkmCards ;
//   — leur CDN répond « access-control-allow-origin: * », donc on pourra
//     pointer vers ces images sans les copier.
//
//   node outils/moissonner-pokecardex.mjs --sortie donnees [--series 0]

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = args.sortie ?? 'donnees';
// 0 veut dire « toutes ». Une valeur vide serait remplacée par le défaut du
// formulaire GitHub, et la passe « complète » s'arrêterait sans le dire —
// c'est arrivé avec PkmCards.
const maxSeries = Number(args.series ?? 0) || Infinity;
const essai = Boolean(args.essai);

const RACINE = 'https://www.pokecardex.com';
const IDENTITE = 'PokeClasseur/1.0 (collecte de visuels francais ; ' +
                 'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)';
const dormir = ms => new Promise(r => setTimeout(r, ms));

const nav = await chromium.launch();
const contexte = await nav.newContext({ userAgent: IDENTITE, locale: 'fr-FR',
                                        viewport: { width: 1600, height: 1200 } });
// On laisse les images se charger, et c'est une leçon payée : refuser les
// images pour « alléger leur serveur » a rendu ZÉRO carte sur douze
// séries. Leur page pose deux images par carte — un fond provisoire et le
// vrai visuel — et bloquer le second déclenche leur gestion d'erreur, qui
// remet le fond provisoire à la place. L'adresse qu'on venait chercher
// disparaissait donc à cause de l'optimisation elle-même.
//
// On n'allège que ce qui ne porte aucune adresse de carte : vidéos et
// polices de caractères.
await contexte.route('**/*', route => {
  const t = route.request().resourceType();
  if(t === 'media' || t === 'font') return route.abort();
  route.continue();
});
const page = await contexte.newPage();

// --- 1. la liste des séries ----------------------------------------------
console.log('Lecture de la liste des séries…');
await page.goto(`${RACINE}/series`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3500);

const codes = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href*="/series/"]')]
    .map(a => (a.getAttribute('href') ?? '').split('/').filter(Boolean).pop())
    .filter(Boolean))]);
console.log(`${codes.length} séries listées.\n`);

// --- 2. chaque série, carte par carte ------------------------------------
// L'adresse d'un visuel porte le code et le numéro ; « alt » porte le nom.
// On lit les deux et on les recoupe, plutôt que de reconstruire l'adresse
// à partir d'une règle devinée.
const DECOUPE = /pokecardex-scans\.b-cdn\.net\/sets\/([^/]+)\/FR\/([^/?.]+)\.(jpg|jpeg|png|webp)/i;

const series = {};
let totalCartes = 0, sansCarte = [];
const retenues = codes.slice(0, maxSeries === Infinity ? undefined : maxSeries);

for(const [i, code] of retenues.entries()){
  try{
    await page.goto(`${RACINE}/series/${code}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1800);

    // Descendre jusqu'à ce que le nombre d'images cesse de croître : c'est
    // la seule façon de savoir qu'on a tout vu, plutôt que d'espérer.
    let avant = -1, tours = 0;
    while(tours < 25){
      const n = await page.evaluate(() => document.querySelectorAll('img').length);
      if(n === avant) break;
      avant = n;
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await page.waitForTimeout(700);
      tours++;
    }

    const lu = await page.evaluate(() => ({
      nom: document.querySelector('h1')?.textContent?.trim() ?? '',
      cartes: [...document.querySelectorAll('img')].map(i => ({
        src: i.getAttribute('src') ?? '',
        // Le chargement différé range parfois l'adresse ailleurs que
        // dans « src » : on prend les deux.
        dataSrc: i.getAttribute('data-src') ?? '',
        alt: i.getAttribute('alt') ?? '',
      })),
    }));

    const parNumero = {};
    for(const c of lu.cartes){
      const m = DECOUPE.exec(c.src) ?? DECOUPE.exec(c.dataSrc);
      if(!m) continue;
      // On garde l'adresse sans son « ?class=md » : la taille se choisira
      // au moment de l'affichage, pas ici.
      const adresse = (c.src || c.dataSrc).split('?')[0];
      // « Noeunoeuf 001/128 » -> nom « Noeunoeuf ».
      const nom = c.alt.replace(/\s+[0-9a-z]+\/[0-9]+\s*$/i, '').trim();
      parNumero[String(m[2]).toLowerCase()] = { adresse, nom };
    }

    const combien = Object.keys(parNumero).length;
    totalCartes += combien;
    if(combien) series[code] = { nom: lu.nom, cartes: parNumero };
    else{
      sansCarte.push(code);
      // Une série sans carte doit dire POURQUOI. « 0 carte sur 273 images »
      // et « 0 carte sur 0 image » sont deux pannes différentes, et la
      // première m'aurait fait gagner une passe.
      console.log(`  ${code} : 0 carte retenue sur ${lu.cartes.length} images` +
        ` — exemple : ${JSON.stringify(lu.cartes.find(c => c.src || c.dataSrc) ?? null)}`);
    }

    if((i + 1) % 20 === 0 || i === retenues.length - 1)
      console.log(`  ${i + 1}/${retenues.length} séries — ${totalCartes} cartes relevées`);
  }catch(err){
    console.log(`  ÉCHEC ${code} : ${err.message.split('\n')[0]}`);
    sansCarte.push(code);
  }
  await dormir(600);
}

await nav.close();

// --------------------------------------------------------------- bilan ----
console.log(`\n================ bilan ================`);
console.log(`séries parcourues : ${retenues.length}`);
console.log(`séries avec cartes: ${Object.keys(series).length}`);
console.log(`séries sans carte : ${sansCarte.length}${sansCarte.length ? '  (' + sansCarte.slice(0, 12).join(', ') + (sansCarte.length > 12 ? '…' : '') + ')' : ''}`);
console.log(`cartes relevées   : ${totalCartes}`);
console.log('\nles plus fournies :');
for(const [code, s] of Object.entries(series)
    .sort((a, b) => Object.keys(b[1].cartes).length - Object.keys(a[1].cartes).length).slice(0, 15))
  console.log(`  ${String(Object.keys(s.cartes).length).padStart(4)}  ${code.padEnd(8)} ${s.nom}`);

if(essai){
  console.log("\n--essai : rien n'est écrit.");
}else{
  await mkdir(sortie, { recursive: true });
  const fichier = `${sortie}/visuels-pokecardex.json`;
  await writeFile(fichier, JSON.stringify({
    source: RACINE,
    cdn: 'https://pokecardex-scans.b-cdn.net',
    releveLe: new Date().toISOString(),
    // Leur CDN autorise l'affichage chez nous : c'est ce qui permet de
    // pointer vers ces images au lieu de les copier.
    cors: '*',
    seriesListees: codes.length,
    seriesParcourues: retenues.length,
    complet: maxSeries === Infinity,
    cartes: totalCartes,
    series,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
