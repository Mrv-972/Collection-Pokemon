// Pokécardex peut-il combler ce qui reste ?
// ==========================================
//
// Ce qui reste, mesuré carte par carte : 869 cartes sans aucun visuel et
// 397 affichées en anglais. Les sources déjà éprouvées n'en ont pas :
// TCGdex, PkmCards et Poképédia ont toutes été passées.
//
// Pokécardex est annoncé avec plus de 24 000 cartes sur 240 séries, « des
// plus récentes aux plus anciennes », bloc Wizards et promotionnelles
// comprises. C'est exactement la forme de notre trou : coffrets, galeries,
// kits du dresseur, McDonald's, promos.
//
// La sonde ne suppose rien de leur structure. Elle regarde, dans l'ordre :
//   1. ce que robots.txt autorise — une piste close se referme ici ;
//   2. par où l'on entre : leurs pages de séries ;
//   3. à quoi ressemble une page de série, et où sont ses images ;
//   4. si leur serveur autorise l'affichage chez nous (CORS), sans quoi le
//      partage d'un classeur casserait, comme chez Poképédia ;
//   5. sous quelle licence, car cela a engagé le projet la dernière fois.
//
//   node outils/sonde-pokecardex.mjs

const RACINE = 'https://www.pokecardex.com';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (reperage de visuels francais ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function lire(adresse){
  try{
    const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
    return { code: r.status, corps: await r.text(), finale: r.url,
             cors: r.headers.get('access-control-allow-origin'),
             type: r.headers.get('content-type') ?? '' };
  }catch(err){ return { code: 'réseau', corps: '', finale: adresse, err: err.message }; }
}

// --- 1. ce qu'ils autorisent ---------------------------------------------
console.log('=============== robots.txt ===============');
const robots = await lire(`${RACINE}/robots.txt`);
console.log(`code ${robots.code}`);
console.log(robots.corps.slice(0, 1200) || '(vide)');

// --- 2. par où entre-t-on ? ----------------------------------------------
await dormir(1500);
console.log('\n=============== pages d’entrée ===============');
for(const chemin of ['/', '/series', '/sets', '/cartes', '/db']){
  await dormir(1500);
  const r = await lire(RACINE + chemin);
  const liens = [...new Set([...(r.corps.matchAll(/href=["'](\/[^"'#?]{1,90})["']/g))].map(m => m[1]))];
  const familles = {};
  for(const l of liens){
    const f = '/' + (l.split('/').filter(Boolean)[0] ?? '');
    familles[f] = (familles[f] ?? 0) + 1;
  }
  console.log(`\n${chemin} -> code ${r.code}, arrivé sur ${r.finale.replace(RACINE,'') || '/'}`);
  console.log('  ' + Object.entries(familles).sort((a,b)=>b[1]-a[1]).slice(0,10)
    .map(([f,n]) => `${f}×${n}`).join('  '));
  // Un échantillon de liens, pour voir la forme réelle plutôt que l'imaginer.
  const parlants = liens.filter(l => /serie|set|carte|card|db/i.test(l)).slice(0, 6);
  for(const l of parlants) console.log(`    ${l}`);
}

// --- 3. où sont les images ? ---------------------------------------------
await dormir(1500);
console.log('\n=============== les images ===============');
// On prend la page d'accueil et on regarde les adresses d'image qu'elle sert.
const accueil = await lire(RACINE);
const images = [...new Set((accueil.corps.match(
  /https?:\/\/[^"'\s)]*?(?:assets|static|img|images|cdn)[^"'\s)]*?\.(?:png|jpe?g|webp)/gi) ?? [])];
console.log(`${images.length} adresses d'image distinctes sur l'accueil :`);
for(const i of images.slice(0, 10)) console.log(`  ${i}`);

// --- 4. affichage chez nous, et poids ------------------------------------
if(images.length){
  await dormir(1500);
  console.log('\n=============== affichage chez nous (CORS) ===============');
  const r = await lire(images[0]);
  console.log(`  ${r.code}  ${r.type}`);
  console.log(`  access-control-allow-origin : ${r.cors ?? 'ABSENT'}`);
  console.log(r.cors
    ? "  -> utilisable directement dans un classeur partagé."
    : "  -> comme Poképédia : il faudrait copier les images chez nous.");
}

// --- 5. nos trous, chez eux ? --------------------------------------------
// On cherche par leur moteur plutôt qu'en devinant une adresse : deviner
// m'a déjà coûté quatre fausses pistes.
await dormir(1500);
console.log('\n=============== nos trous, cherchés chez eux ===============');
const CIBLES = [
  'Coffre Étincelant',     // swsh4.5sv et sma, 216 cartes a nous deux
  'Galerie Galaroise',     // swsh12.5gg, 70 cartes
  'Wizards Black Star',    // basep, 53 cartes
  'Kit du Dresseur',       // les tk-*, 30 cartes chacun
  'McDonald',              // 2018sm-fr et 2019sm-fr, 81 cartes
];
for(const terme of CIBLES){
  await dormir(2000);
  for(const forme of [`/recherche?q=${encodeURIComponent(terme)}`,
                      `/search?q=${encodeURIComponent(terme)}`]){
    const r = await lire(RACINE + forme);
    if(r.code === 200){
      const n = [...new Set(r.corps.match(/\/(?:serie|set)s?\/[a-z0-9_-]+/gi) ?? [])].length;
      console.log(`  « ${terme} » via ${forme.split('?')[0]} -> ${r.code}, ${r.corps.length} octets, ${n} liens de série`);
      break;
    }
    console.log(`  « ${terme} » via ${forme.split('?')[0]} -> ${r.code}`);
  }
}

console.log('\nRien n’a été téléchargé : cette sonde ne lit que du texte.');
