import { writeFile, mkdir } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = args.sortie ?? 'donnees';
const maxPages = Number(args.pages ?? 0) || Infinity;
const essai = Boolean(args.essai);
const PAUSE = Number(args.pause ?? 1200);

const RACINE = 'https://www.pkmcards.fr';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (collecte de visuels francais ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));

const VISUEL = /https?:\/\/static\.pkmcards\.fr\/cards\/fr\/[^"'\s)\\]+/gi;
const DECOUPE = /\/cards\/fr\/([^/]+)\/[^"'\s]*?-fr-([0-9a-z]+)-/i;
const LIEN = /\/cards\/([a-z0-9.]+)-fr-([0-9a-z]+)-/gi;

async function lire(adresse, essais = 3){
  for(let i = 0; i < essais; i++){
    try{
      const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
      if(r.status === 429 || r.status >= 500){
        await dormir(5000 * (i + 1));
        continue;
      }
      return { code: r.status, corps: await r.text(), finale: r.url };
    }catch(err){
      if(i === essais - 1) return { code: 'réseau', corps: '', finale: adresse, err: err.message };
      await dormir(3000 * (i + 1));
    }
  }
  return { code: 'abandon', corps: '', finale: adresse };
}

const releve = {};
const sansVisuel = [];
let pagesLues = 0, pagesVides = 0, liensVus = 0;

console.log('Parcours du catalogue (/cards/<numéro>)…\n');
for(let page = 1; page <= maxPages; page++){
  const r = await lire(`${RACINE}/cards/${page}`);

  if(r.code !== 200){
    console.log(`page ${page} : ${r.code} : on s'arrête là.`);
    break;
  }
  if(!r.finale.endsWith(`/cards/${page}`)){
    console.log(`page ${page} : détournée vers ${r.finale.replace(RACINE,'')} : fin du catalogue.`);
    break;
  }

  const visuels = [...new Set(r.corps.match(VISUEL) ?? [])];
  const liens = new Map();
  for(const m of r.corps.matchAll(LIEN)) liens.set(`${m[1].toLowerCase()}-${m[2]}`, true);
  liensVus += liens.size;

  let neufs = 0;
  const avecVisuel = new Set();
  for(const a of visuels){
    const m = DECOUPE.exec(a);
    if(!m) continue;
    const cle = `${m[1].toLowerCase()}-${m[2]}`;
    avecVisuel.add(cle);
    if(!(cle in releve)){ releve[cle] = a; neufs++; }
  }
  for(const cle of liens.keys()) if(!avecVisuel.has(cle)) sansVisuel.push(cle);

  pagesLues++;
  const manque = liens.size - avecVisuel.size;
  console.log(`page ${String(page).padStart(4)} : ${String(visuels.length).padStart(3)} visuels` +
    ` / ${String(liens.size).padStart(3)} liens` +
    `${manque > 0 ? `  (${manque} sans image)` : ''}` +
    `  +${String(neufs).padStart(3)} nouveaux  total ${Object.keys(releve).length}`);

  if(!liens.size){
    pagesVides++;
    if(pagesVides >= 2){ console.log('deux pages sans carte : fin.'); break; }
  }else pagesVides = 0;

  await dormir(PAUSE);
}

const codes = {};
for(const cle of Object.keys(releve)){
  const code = cle.replace(/-[^-]+$/, '');
  codes[code] = (codes[code] ?? 0) + 1;
}
const parCode = Object.entries(codes).sort((a,b) => b[1]-a[1]);

console.log(`\n================ bilan ================`);
console.log(`pages lues          : ${pagesLues}`);
console.log(`liens de carte vus  : ${liensVus}`);
console.log(`visuels relevés     : ${Object.keys(releve).length}`);
console.log(`vus sans image      : ${sansVisuel.length}`);
console.log(`codes d'extension   : ${parCode.length}`);
console.log('\nles plus fournies :');
for(const [code, n] of parCode.slice(0, 20)) console.log(`  ${String(n).padStart(5)}  ${code}`);
if(parCode.length > 20) console.log(`  … et ${parCode.length - 20} autres`);

if(essai){
  console.log("\n--essai : rien n'est écrit.");
}else{
  await mkdir(sortie, { recursive: true });
  const fichier = `${sortie}/visuels-pkmcards.json`;
  await writeFile(fichier, JSON.stringify({
    source: RACINE,
    releveLe: new Date().toISOString(),
    pagesLues,
    complet: maxPages === Infinity,
    codesSource: Object.fromEntries(parCode),
    visuels: releve,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
