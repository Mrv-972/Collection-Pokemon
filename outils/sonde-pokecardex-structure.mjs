// Pokécardex : lire leur structure réelle, au lieu de la supposer.
// =================================================================
//
// La sonde précédente a conclu « PAS TROUVÉ » pour nos six trous. Ce
// n'était pas un verdict sur Pokécardex, c'était mon outil qui était
// cassé : leurs liens de série n'ont AUCUN texte — ce sont des vignettes —
// donc je comparais des noms à du vide. Troisième fois aujourd'hui que je
// prends un outil défaillant pour une absence de données.
//
// Alors cette fois : on DUMPE ce que la page contient réellement, et on
// regarde, plutôt que d'interroger avec une hypothèse.
//
// Acquis, mesuré : robots.txt autorise tout ; 235 séries listées sous la
// forme /series/<CODE> (SSP, TEF, 30C, PBL…) ; leur CDN répond
// « access-control-allow-origin: * », donc leurs images seraient
// utilisables sans copie.
//
//   node outils/sonde-pokecardex-structure.mjs

import { chromium } from 'playwright';

const RACINE = 'https://www.pokecardex.com';
const IDENTITE = 'PokeClasseur/1.0 (reperage de visuels francais ; ' +
                 'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)';

const nav = await chromium.launch();
const contexte = await nav.newContext({ userAgent: IDENTITE, locale: 'fr-FR',
                                        viewport: { width: 1400, height: 1200 } });
const page = await contexte.newPage();

// --- 1. la liste des séries : où est le NOM ? ---------------------------
console.log('=============== /series : la structure d’une vignette ===============');
await page.goto(`${RACINE}/series`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);

// Le code HTML brut d'un lien de série dit tout : alt, title, texte voisin.
const echantillon = await page.evaluate(() => {
  const liens = [...document.querySelectorAll('a[href*="/series/"]')];
  return liens.slice(0, 3).map(a => a.outerHTML.slice(0, 600));
});
for(const h of echantillon) console.log(`\n  ${h}\n`);

// Toutes les séries, avec tout ce qui pourrait porter leur nom.
const series = await page.evaluate(() =>
  [...document.querySelectorAll('a[href*="/series/"]')].map(a => {
    const img = a.querySelector('img');
    return {
      code: (a.getAttribute('href') ?? '').split('/').pop(),
      texte: (a.textContent ?? '').trim(),
      titre: a.getAttribute('title') ?? '',
      alt: img?.getAttribute('alt') ?? '',
      aria: a.getAttribute('aria-label') ?? '',
      // Le nom est souvent à côté du lien, pas dedans.
      voisin: (a.parentElement?.textContent ?? '').trim().slice(0, 70),
    };
  }).filter((x, i, t) => t.findIndex(y => y.code === x.code) === i));

console.log(`${series.length} séries. Les quinze premières, tous champs :`);
for(const s of series.slice(0, 15))
  console.log(`  ${String(s.code).padEnd(8)} texte="${s.texte}" titre="${s.titre}" alt="${s.alt}" aria="${s.aria}" voisin="${s.voisin}"`);

// --- 2. une page de série : où sont les cartes ? ------------------------
console.log('\n=============== /series/30C : la structure ===============');
await page.goto(`${RACINE}/series/30C`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);
for(let i = 0; i < 6; i++){
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1800);
}

const dedans = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')];
  return {
    titre: document.title,
    h1: document.querySelector('h1')?.textContent?.trim() ?? '',
    combienImages: imgs.length,
    // Une image de carte se reconnaît à son adresse ; on montre tout ce
    // qui n'est pas de l'habillage, avec src ET data-src (chargement
    // différé), puisque c'est ce qui m'a piégé chez PkmCards.
    echantillon: imgs.slice(0, 25).map(i => ({
      src: i.getAttribute('src') ?? '',
      dataSrc: i.getAttribute('data-src') ?? '',
      alt: (i.getAttribute('alt') ?? '').slice(0, 40),
    })).filter(i => !/icon|login|appstore|googlePlay|rarete|langue|logo/i.test(i.src + i.dataSrc)),
  };
});
console.log(`  titre : ${dedans.titre}`);
console.log(`  h1    : ${dedans.h1}`);
console.log(`  ${dedans.combienImages} images dans la page ; hors habillage :`);
for(const i of dedans.echantillon.slice(0, 15))
  console.log(`    src="${i.src}" data-src="${i.dataSrc}" alt="${i.alt}"`);

// Un bout du code de la grille, pour voir comment une carte est posée.
const grille = await page.evaluate(() => {
  const candidat = document.querySelector('[class*=card], [class*=carte], [class*=grid]');
  return candidat ? candidat.outerHTML.slice(0, 900) : '(aucun conteneur reconnu)';
});
console.log(`\n  un bout de la grille :\n${grille}`);

await nav.close();
