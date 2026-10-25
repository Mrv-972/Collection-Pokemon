import { chromium } from 'playwright';

const RACINE = 'https://www.pokecardex.com';
const IDENTITE = 'PokeClasseur/1.0 (reperage de visuels francais ; ' +
                 'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)';

const nav = await chromium.launch();
const contexte = await nav.newContext({ userAgent: IDENTITE, locale: 'fr-FR',
                                        viewport: { width: 1400, height: 1200 } });
const page = await contexte.newPage();

console.log('=============== /series : la structure d’une vignette ===============');
await page.goto(`${RACINE}/series`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);

const echantillon = await page.evaluate(() => {
  const liens = [...document.querySelectorAll('a[href*="/series/"]')];
  return liens.slice(0, 3).map(a => a.outerHTML.slice(0, 600));
});
for(const h of echantillon) console.log(`\n  ${h}\n`);

const series = await page.evaluate(() =>
  [...document.querySelectorAll('a[href*="/series/"]')].map(a => {
    const img = a.querySelector('img');
    return {
      code: (a.getAttribute('href') ?? '').split('/').pop(),
      texte: (a.textContent ?? '').trim(),
      titre: a.getAttribute('title') ?? '',
      alt: img?.getAttribute('alt') ?? '',
      aria: a.getAttribute('aria-label') ?? '',
      voisin: (a.parentElement?.textContent ?? '').trim().slice(0, 70),
    };
  }).filter((x, i, t) => t.findIndex(y => y.code === x.code) === i));

console.log(`${series.length} séries. Les quinze premières, tous champs :`);
for(const s of series.slice(0, 15))
  console.log(`  ${String(s.code).padEnd(8)} texte="${s.texte}" titre="${s.titre}" alt="${s.alt}" aria="${s.aria}" voisin="${s.voisin}"`);

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

const grille = await page.evaluate(() => {
  const candidat = document.querySelector('[class*=card], [class*=carte], [class*=grid]');
  return candidat ? candidat.outerHTML.slice(0, 900) : '(aucun conteneur reconnu)';
});
console.log(`\n  un bout de la grille :\n${grille}`);

await nav.close();
