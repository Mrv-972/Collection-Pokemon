import { writeFile, mkdir } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = args.sortie ?? 'donnees';
const maxPages = Number(args.pages ?? 0) || Infinity;

const API = 'https://www.pokepedia.fr/api.php';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (collecte de visuels francais ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function interroger(parametres){
  const url = API + '?' + new URLSearchParams({ format: 'json', ...parametres });
  for(let essai = 0; essai < 3; essai++){
    try{
      const r = await fetch(url, { headers: IDENTITE });
      if(r.status === 429 || r.status >= 500){ await dormir(5000 * (essai + 1)); continue; }
      if(!r.ok) return { erreur: r.status };
      return r.json();
    }catch(err){
      if(essai === 2) return { erreur: err.message };
      await dormir(3000 * (essai + 1));
    }
  }
  return { erreur: 'abandon' };
}

const infos = await interroger({ action: 'query', meta: 'siteinfo', siprop: 'rightsinfo|general' });
const licence = {
  texte: infos.query?.rightsinfo?.text ?? null,
  adresse: infos.query?.rightsinfo?.url ?? null,
  site: infos.query?.general?.sitename ?? null,
};
console.log(`licence : ${licence.texte}`);
console.log(`          ${licence.adresse}\n`);
await dormir(1000);

const DECOUPE = /^Carte_(.+)_([A-Za-z]{0,3}[0-9]+[a-z]?)\.(png|jpe?g|webp|gif)$/i;
const sansZeros = n => String(n ?? '').replace(/^0+/, '').toLowerCase();

const parSerie = {};
let suite = null, vus = 0, retenus = 0, pages = 0, ecartes = 0;

console.log('Énumération des visuels de cartes…');
for(let i = 0; i < maxPages; i++){
  const d = await interroger({
    action: 'query', list: 'allimages', aiprefix: 'Carte ',
    ailimit: '500', aiprop: 'url|size',
    ...(suite ? { aicontinue: suite } : {}),
  });
  if(d.erreur){ console.log(`  page ${i+1} : erreur ${d.erreur} : on s'arrête.`); break; }
  const images = d.query?.allimages ?? [];
  vus += images.length;
  pages++;
  for(const img of images){
    const m = DECOUPE.exec(img.name);
    if(!m){ ecartes++; continue; }
    const serie = m[1].replace(/_/g, ' ');
    const numero = sansZeros(m[2]);
    (parSerie[serie] ??= {});
    if(numero in parSerie[serie]) continue;
    parSerie[serie][numero] = img.url;
    retenus++;
  }
  suite = d.continue?.aicontinue;
  if(pages % 10 === 0 || !suite)
    console.log(`  ${pages} pages, ${vus} fichiers vus, ${retenus} cartes retenues` +
      `${suite ? '' : '  : fin de la liste'}`);
  if(!suite) break;
  await dormir(1200);
}

const series = Object.entries(parSerie).sort((a, b) =>
  Object.keys(b[1]).length - Object.keys(a[1]).length);

console.log(`\n================ bilan ================`);
console.log(`fichiers vus      : ${vus}`);
console.log(`cartes retenues   : ${retenus}`);
console.log(`écartés (sans n°) : ${ecartes}`);
console.log(`séries            : ${series.length}`);
console.log(`complet           : ${suite ? 'NON : relevé partiel' : 'oui'}`);

await mkdir(sortie, { recursive: true });
const fichier = `${sortie}/visuels-pokepedia.json`;
await writeFile(fichier, JSON.stringify({
  source: 'https://www.pokepedia.fr',
  releveLe: new Date().toISOString(),
  licence,
  pagesLues: pages,
  fichiersVus: vus,
  complet: !suite,
  series: Object.fromEntries(series),
}, null, 1) + '\n');
console.log(`\nécrit dans ${fichier}`);
