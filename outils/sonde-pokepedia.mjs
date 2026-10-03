// Poképédia : ses visuels de cartes sont-ils énumérables, et utilisables ?
// ========================================================================
//
// Les deux autres pistes sont closes : Bulbapedia et Cardmarket répondent
// 403 à tout, robots.txt compris. Poképédia, elle, nous laisse entrer —
// son robots.txt ne bloque que ses pages techniques — et nomme ses
// fichiers selon une convention régulière, vue sur une vraie page :
//
//     Fichier:Carte Set de Base 4.png      (Dracaufeu, Set de Base n° 4)
//     Fichier:Carte Jungle 60.png          (Pikachu, Jungle n° 60)
//
// « Carte <série> <numéro> ». Si la convention tient, leurs visuels
// s'énumèrent par « allimages », l'interface officielle de MediaWiki, qui
// donne l'adresse exacte de chaque fichier. Pas une adresse devinée : une
// adresse déclarée. C'est ce qui a manqué quatre fois cette nuit.
//
// Cette sonde vérifie, dans l'ordre :
//   1. que « allimages » répond et pagine ;
//   2. quelles séries apparaissent, et sous quels noms (les leurs ne sont
//      pas forcément les nôtres) ;
//   3. que le serveur d'images autorise l'affichage chez nous (CORS),
//      sans quoi le partage d'un classeur casserait ;
//   4. combien de nos extensions manquantes leurs noms recouvrent.
//
//   node outils/sonde-pokepedia.mjs [--pages 4]

import { readFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));
const combien = Number(args.pages ?? 4);

const API = 'https://www.pokepedia.fr/api.php';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (reperage de visuels francais ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function interroger(parametres){
  const url = API + '?' + new URLSearchParams({ format: 'json', ...parametres });
  const r = await fetch(url, { headers: IDENTITE });
  if(!r.ok) return { erreur: r.status };
  return r.json();
}

// --- 1 et 2. énumérer, et voir les noms de série -------------------------
console.log('=============== énumération des visuels ===============');
// « Carte » suivi d'une espace : le préfixe commun vu sur leurs pages.
let suite = null, total = 0, lu = 0;
const parSerie = new Map();
const exemples = [];
for(let i = 0; i < combien; i++){
  const d = await interroger({
    action: 'query', list: 'allimages', aiprefix: 'Carte ',
    ailimit: '500', aiprop: 'url|size',
    ...(suite ? { aicontinue: suite } : {}),
  });
  if(d.erreur){ console.log(`  page ${i+1} : erreur ${d.erreur}`); break; }
  const images = d.query?.allimages ?? [];
  total += images.length;
  lu++;
  for(const img of images){
    // « Carte Set de Base 4.png » -> série « Set de Base », numéro « 4 ».
    // On exige un numéro final : sans lui, ce n'est pas une carte mais une
    // image d'habillage, et la compter gonflerait le bilan pour rien.
    const m = /^Carte (.+?) ([0-9]+[a-z]?)\.(png|jpe?g|webp|gif)$/i.exec(img.name);
    if(!m) continue;
    const serie = m[1];
    if(!parSerie.has(serie)) parSerie.set(serie, { n: 0, url: img.url });
    parSerie.get(serie).n++;
    if(exemples.length < 3) exemples.push(img);
  }
  suite = d.continue?.aicontinue;
  console.log(`  page ${i+1} : ${images.length} fichiers (total ${total})` +
    `${suite ? '' : '  — fin de la liste'}`);
  if(!suite) break;
  await dormir(1200);
}

console.log(`\n${parSerie.size} noms de série reconnus sur ${lu} page(s) lue(s).`);
console.log('les plus fournis :');
for(const [serie, x] of [...parSerie].sort((a,b) => b[1].n - a[1].n).slice(0, 25))
  console.log(`  ${String(x.n).padStart(4)}  ${serie}`);

console.log('\nexemples d’adresses :');
for(const e of exemples) console.log(`  ${e.name}\n      ${e.url}`);

// --- 3. le serveur autorise-t-il l'affichage chez nous ? ----------------
console.log('\n=============== affichage chez nous (CORS) ===============');
if(exemples.length){
  const r = await fetch(exemples[0].url, { headers: IDENTITE, method: 'GET' });
  const cors = r.headers.get('access-control-allow-origin');
  console.log(`  ${r.status}  ${r.headers.get('content-type')}` +
    `  ${r.headers.get('content-length') ?? '?'} octets`);
  console.log(`  access-control-allow-origin : ${cors ?? 'ABSENT'}`);
  console.log(cors
    ? "  -> l'image pourra figurer dans un classeur partagé."
    : "  -> ATTENTION : sans cet en-tête, le partage d'un classeur contenant\n" +
      "     cette image échouerait. L'affichage simple, lui, marcherait.");
}

// --- 4. ce que leurs noms recouvrent de nos manques ---------------------
console.log('\n=============== recoupement avec nos manques ===============');
try{
  const bilan = JSON.parse(await readFile('donnees/bilan-visuels.json', 'utf8'));
  const aplatir = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
  const leurs = new Map([...parSerie].map(([s, x]) => [aplatir(s), { nom: s, n: x.n }]));
  const manquants = [...bilan.aTrousSansSource, ...bilan.muettes.restantes
    .map(m => ({ ...m, manqueEstime: m.cartes }))];
  let trouves = 0, cartesTrouvees = 0;
  const absents = [];
  for(const m of manquants){
    const chez = leurs.get(aplatir(m.nom));
    if(chez){ trouves++; cartesTrouvees += m.manqueEstime;
      console.log(`  ${String(m.manqueEstime).padStart(4)} à combler  ${m.id.padEnd(12)}` +
        ` ${m.nom}  ->  « ${chez.nom} » (${chez.n} visuels)`); }
    else absents.push(m);
  }
  console.log(`\n  ${trouves} de nos extensions manquantes portent un nom que Poképédia connaît`);
  console.log(`  soit ${cartesTrouvees} cartes à combler`);
  console.log(`  ${absents.length} sans correspondance de nom — à revoir à la main,` +
    ` car un nom\n  peut différer sans que la série manque (nous : « Fossile »).`);
}catch(err){
  console.log(`  (bilan illisible : ${err.message})`);
}

console.log('\nRien n’a été téléchargé : seules des adresses ont été lues.');
