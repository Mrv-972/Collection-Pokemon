// Relever les visuels français chez PkmCards.
// ===========================================
//
// L'outil ne télécharge AUCUNE image : il relève des adresses et les range
// dans un fichier. Ce qu'on en fera ensuite est une autre décision.
//
// Deux chemins possibles, et le premier essai a montré lequel vaut mieux :
//
//   « liste »  — leur page « liste des cartes françaises » est rendue par
//                le serveur : ses adresses d'image sont dans le code livré,
//                sans navigateur. C'est le chemin par défaut : plus simple
//                pour nous, et bien plus léger pour eux.
//
//   « series » — les pages de série, elles, construisent leur contenu par
//                JavaScript : il y faut un navigateur. Gardé en recours.
//
// Leçons du premier essai, inscrites ici pour ne pas les repayer :
//   — leur page /series n'annonce que 30 séries sur 240 : s'y fier conduit
//     à croire le catalogue bien plus petit qu'il n'est ;
//   — une page de série ne livrait que 24 visuels pour 34 liens, le reste
//     se chargeant au défilement ;
//   — « --series 3 » restait passé alors qu'on demandait tout : une valeur
//     vide est remplacée par le défaut du formulaire. D'où « 0 = toutes ».
//
//   node outils/moissonner-pkmcards.mjs --sortie donnees [--pages 0] [--essai]

import { writeFile, mkdir } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = args.sortie ?? 'donnees';
// 0 veut dire « toutes » : une valeur vide serait remplacée par le défaut
// du formulaire, et l'on croirait avoir tout pris alors que non.
const maxPages = Number(args.pages ?? 0) || Infinity;
const essai = Boolean(args.essai);
const PAUSE = Number(args.pause ?? 1500);

const RACINE = 'https://www.pkmcards.fr';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (collecte de visuels francais ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

const dormir = ms => new Promise(r => setTimeout(r, ms));

// Une adresse de visuel chez eux porte le code d'extension et le numéro :
//   static.pkmcards.fr/cards/fr/<code>/…-<code>-fr-<numéro>-<nom>.webp
const DECOUPE = /static\.pkmcards\.fr\/cards\/fr\/([^/]+)\/[^"'\s]*?-fr-(\d+[a-z]?)-/i;

async function lire(adresse){
  try{
    const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
    return { code: r.status, corps: await r.text(), finale: r.url };
  }catch(err){ return { code: 'réseau', corps: '', finale: adresse, err: err.message }; }
}

const releve = {};
let pagesLues = 0, pagesVides = 0;

console.log('Parcours de la liste des cartes françaises…\n');
for(let page = 1; page <= maxPages; page++){
  const adresse = page === 1
    ? `${RACINE}/cards/liste-cartes-francaises`
    : `${RACINE}/cards/liste-cartes-francaises?page=${page}`;
  const r = await lire(adresse);

  if(r.code !== 200){
    console.log(`page ${page} : ${r.code} — on s'arrête là.`);
    break;
  }
  // Une page au-delà de la dernière renvoie souvent la première : sans ce
  // garde-fou, on tournerait en rond jusqu'à la limite.
  if(page > 1 && !r.finale.includes(`page=${page}`)){
    console.log(`page ${page} : renvoyée vers ${r.finale} — fin de la pagination.`);
    break;
  }

  const adresses = [...new Set((r.corps.match(
    /https?:\/\/static\.pkmcards\.fr\/cards\/fr\/[^"'\s)\\]+/gi) ?? [])];
  let neuves = 0;
  for(const a of adresses){
    const m = DECOUPE.exec(a);
    if(!m) continue;
    const cle = `${m[1].toLowerCase()}-${m[2]}`;
    if(!(cle in releve)){ releve[cle] = a; neuves++; }
  }

  pagesLues++;
  console.log(`page ${String(page).padStart(3)} : ${String(adresses.length).padStart(3)} visuels, ${String(neuves).padStart(3)} nouveaux  (total ${Object.keys(releve).length})`);

  // Deux pages d'affilée sans rien de neuf : on a fait le tour.
  if(!neuves){
    pagesVides++;
    if(pagesVides >= 2){ console.log('deux pages sans nouveauté : fin.'); break; }
  }else pagesVides = 0;

  await dormir(PAUSE);
}

// ------------------------------------------------------------- bilan ------
const codes = [...new Set(Object.keys(releve).map(c => c.replace(/-[^-]+$/, '')))].sort();
console.log(`\n================ bilan ================`);
console.log(`pages lues        : ${pagesLues}`);
console.log(`visuels relevés   : ${Object.keys(releve).length}`);
console.log(`codes d'extension : ${codes.length}`);
console.log(`   ${codes.join(', ')}`);

if(essai){
  console.log("\n--essai : rien n'est écrit.");
}else{
  await mkdir(sortie, { recursive: true });
  const fichier = `${sortie}/visuels-pkmcards.json`;
  await writeFile(fichier, JSON.stringify({
    source: RACINE,
    releveLe: new Date().toISOString(),
    // On note ce qu'on a parcouru : un relevé partiel qu'on prendrait pour
    // complet ferait conclure à tort à l'absence d'une carte.
    pagesLues,
    complet: maxPages === Infinity,
    visuels: releve,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
