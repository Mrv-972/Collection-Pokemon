// Relever les visuels français chez PkmCards.
// ===========================================
//
// L'outil ne télécharge AUCUNE image : il relève des adresses et les range
// dans un fichier. Ce qu'on en fera ensuite est une autre décision.
//
// La porte, trouvée après plusieurs fausses pistes : /cards/<numéro> est
// leur paginateur, 45 cartes par page, et il couvre toute l'histoire du
// jeu. Mesuré : page 100 = tef (2024), page 300 = unm (2019),
// page 500 = la (2008), page 576 = n4 (2002, 31 cartes), page 577 vide.
// Tout est en français. Soit environ 25 900 cartes.
//
// Les fausses pistes, inscrites ici pour ne pas les repayer :
//   — /cards/liste-cartes-francaises est une VITRINE : 34 cartes, aucun
//     paginateur, aucune requête de données. Elle ignore ?page=, ?p=,
//     ?offset=, ?skip=, ?start= en rendant toujours les mêmes cartes.
//   — /series n'annonce que 30 séries, les plus récentes, et refuse
//     ?page=, ?p=, ?tout=1, ?all=1, ?limit=500. Partir de là fait manquer
//     tout ce qui précède 2022.
//   — il n'y a pas de plan de site, pas de Next.js, pas d'API publique.
//   — deviner une adresse de carte sans son nom (/cards/base1-fr-001)
//     renvoie 200 : leur site détourne l'inconnu vers /cards. Un 200 ne
//     prouve donc jamais qu'une carte existe chez eux.
//
//   node outils/moissonner-pkmcards.mjs --sortie donnees [--pages 0] [--essai]

import { writeFile, mkdir } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = args.sortie ?? 'donnees';
// 0 veut dire « toutes ». Une valeur vide serait remplacée par le défaut du
// formulaire GitHub, et l'on croirait avoir tout pris alors que non : c'est
// arrivé, et la passe « complète » s'était arrêtée à trois.
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

// Un visuel chez eux :
//   static.pkmcards.fr/cards/fr/<code>/…-<code>-fr-<numéro>-<nom>.webp
const VISUEL = /https?:\/\/static\.pkmcards\.fr\/cards\/fr\/[^"'\s)\\]+/gi;
const DECOUPE = /\/cards\/fr\/([^/]+)\/[^"'\s]*?-fr-([0-9a-z]+)-/i;
// Et un lien de carte, qui porte le même couple sans l'image. Le compter
// séparément dit si la page a livré ses visuels ou seulement ses liens :
// la dernière fois, 24 visuels pour 34 liens, et je ne l'avais pas vu.
const LIEN = /\/cards\/([a-z0-9.]+)-fr-([0-9a-z]+)-/gi;

async function lire(adresse, essais = 3){
  for(let i = 0; i < essais; i++){
    try{
      const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
      if(r.status === 429 || r.status >= 500){
        // Leur serveur demande à souffler : on l'écoute plutôt que d'insister.
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

const releve = {};          // « code-numéro » -> adresse du visuel
const sansVisuel = [];      // les couples vus en lien mais sans image
let pagesLues = 0, pagesVides = 0, liensVus = 0;

console.log('Parcours du catalogue (/cards/<numéro>)…\n');
for(let page = 1; page <= maxPages; page++){
  const r = await lire(`${RACINE}/cards/${page}`);

  if(r.code !== 200){
    console.log(`page ${page} : ${r.code} — on s'arrête là.`);
    break;
  }
  // Leur site détourne l'inconnu vers /cards : si l'on n'est plus sur la
  // page demandée, c'est qu'on a dépassé la fin.
  if(!r.finale.endsWith(`/cards/${page}`)){
    console.log(`page ${page} : détournée vers ${r.finale.replace(RACINE,'')} — fin du catalogue.`);
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

// ------------------------------------------------------------- bilan ------
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
    // On note ce qu'on a parcouru : un relevé partiel qu'on prendrait pour
    // complet ferait conclure à tort qu'une carte est absente de chez eux.
    pagesLues,
    complet: maxPages === Infinity,
    // Leurs codes d'extension ne sont pas les nôtres (« tef », « n4 »…) :
    // le rapprochement avec notre instantané reste à faire, et ce fichier
    // ne le présume pas.
    codesSource: Object.fromEntries(parCode),
    visuels: releve,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
