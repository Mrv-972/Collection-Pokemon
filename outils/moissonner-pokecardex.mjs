import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { sansTiretPartout } from './typographie.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = args.sortie ?? 'donnees';
const maxSeries = Number(args.series ?? 0) || Infinity;
const essai = Boolean(args.essai);

const RACINE = 'https://www.pokecardex.com';
const IDENTITE = 'PokeClasseur/1.0 (collecte de visuels francais ; ' +
                 'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)';
const dormir = ms => new Promise(r => setTimeout(r, ms));

const nav = await chromium.launch();
const contexte = await nav.newContext({ userAgent: IDENTITE, locale: 'fr-FR',
                                        viewport: { width: 1600, height: 1200 } });
await contexte.route('**/*', route => {
  const t = route.request().resourceType();
  if(t === 'media' || t === 'font') return route.abort();
  route.continue();
});
const page = await contexte.newPage();

console.log('Lecture de la liste des séries…');
await page.goto(`${RACINE}/series`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3500);

const codes = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href*="/series/"]')]
    .map(a => (a.getAttribute('href') ?? '').split('/').filter(Boolean).pop())
    .filter(Boolean))]);
console.log(`${codes.length} séries listées.\n`);

const DECOUPE = /pokecardex-scans\.b-cdn\.net\/sets\/([^/]+)\/FR\/([^/?.]+)\.(jpg|jpeg|png|webp)/i;

const series = {};
let totalCartes = 0, sansCarte = [];
let totalTrous = 0; const seriesATrous = [];
const retenues = args.seule ? [String(args.seule)]
  : codes.slice(0, maxSeries === Infinity ? undefined : maxSeries);

for(const [i, code] of retenues.entries()){
  try{
    await page.goto(`${RACINE}/series/${code}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1800);

    let tours = 0, enBas = 0, avant = -1;
    while(tours < 400 && enBas < 3){
      const etat = await page.evaluate(() => {
        window.scrollBy(0, Math.round(window.innerHeight * 0.6));
        return {
          n: document.querySelectorAll('img').length,
          bas: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4,
        };
      });
      await page.waitForTimeout(350);
      enBas = etat.bas && etat.n === avant ? enBas + 1 : 0;
      avant = etat.n;
      tours++;
    }

    const lu = await page.evaluate(() => ({
      nom: document.querySelector('h1')?.textContent?.trim() ?? '',
      cartes: [...document.querySelectorAll('img')].map(i => ({
        src: i.getAttribute('src') ?? '',
        dataSrc: i.getAttribute('data-src') ?? '',
        alt: i.getAttribute('alt') ?? '',
      })),
    }));

    if(args.seule){
      for(const c of lu.cartes){
        const m = DECOUPE.exec(c.src) ?? DECOUPE.exec(c.dataSrc);
        if(m && Number(m[2]) >= 100) console.log(`  n° ${m[2]}  alt « ${c.alt} »  src ${c.src ? 'oui' : 'non'}  data-src ${c.dataSrc ? 'oui' : 'non'}`);
      }
    }
    const parNumero = {};
    for(const c of lu.cartes){
      const m = DECOUPE.exec(c.src) ?? DECOUPE.exec(c.dataSrc);
      if(!m) continue;
      const adresse = c.src || c.dataSrc;
      const FIN = /\s+([a-z]{0,3}[0-9]+[a-z]?)(?:\/[0-9a-z]+)?\s*$/i;
      const nom = c.alt.replace(FIN, '').trim();
      const imprime = FIN.exec(c.alt)?.[1] ?? null;
      const position = String(m[2]).toLowerCase();
      const fiche = { adresse, nom };
      if(imprime && imprime.replace(/^0+/, '').toLowerCase() !== position.replace(/^0+/, '')) fiche.imprime = imprime;
      parNumero[position] = fiche;
    }

    const combien = Object.keys(parNumero).length;
    totalCartes += combien;
    const entiers = Object.keys(parNumero).map(Number).filter(Number.isInteger);
    if(entiers.length){
      const presents = new Set(entiers);
      let trous = 0;
      for(let k = 1; k <= Math.max(...entiers); k++) if(!presents.has(k)) trous++;
      if(trous) seriesATrous.push(`${code} (${trous})`);
      totalTrous += trous;
    }
    if(combien) series[code] = { nom: lu.nom, cartes: parNumero };
    else{
      sansCarte.push(code);
      console.log(`  ${code} : 0 carte retenue sur ${lu.cartes.length} images` +
        ` : exemple : ${JSON.stringify(lu.cartes.find(c => c.src || c.dataSrc) ?? null)}`);
    }

    if((i + 1) % 20 === 0 || i === retenues.length - 1)
      console.log(`  ${i + 1}/${retenues.length} séries : ${totalCartes} cartes relevées`);
  }catch(err){
    console.log(`  ÉCHEC ${code} : ${err.message.split('\n')[0]}`);
    sansCarte.push(code);
  }
  await dormir(600);
}

await nav.close();

console.log(`\n================ bilan ================`);
console.log(`séries parcourues : ${retenues.length}`);
console.log(`séries avec cartes: ${Object.keys(series).length}`);
console.log(`séries sans carte : ${sansCarte.length}${sansCarte.length ? '  (' + sansCarte.slice(0, 12).join(', ') + (sansCarte.length > 12 ? '…' : '') + ')' : ''}`);
console.log(`cartes relevées   : ${totalCartes}`);
console.log(`numéros sautés   : ${totalTrous} sur ${seriesATrous.length} séries` +
  (seriesATrous.length ? `  (${seriesATrous.slice(0, 15).join(', ')}${seriesATrous.length > 15 ? '…' : ''})` : ''));
console.log('\nles plus fournies :');
for(const [code, s] of Object.entries(series)
    .sort((a, b) => Object.keys(b[1].cartes).length - Object.keys(a[1].cartes).length).slice(0, 15))
  console.log(`  ${String(Object.keys(s.cartes).length).padStart(4)}  ${code.padEnd(8)} ${s.nom}`);

if(essai){
  console.log("\n--essai : rien n'est écrit.");
}else{
  await mkdir(sortie, { recursive: true });
  const fichier = `${sortie}/visuels-pokecardex.json`;
  await writeFile(fichier, JSON.stringify(sansTiretPartout({
    source: RACINE,
    cdn: 'https://pokecardex-scans.b-cdn.net',
    releveLe: new Date().toISOString(),
    cors: '*',
    seriesListees: codes.length,
    seriesParcourues: retenues.length,
    complet: maxSeries === Infinity,
    cartes: totalCartes,
    numerosSautes: totalTrous,
    series,
  }), null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
