// Jusqu'où descend le catalogue de PkmCards ?
// ===========================================
//
// C'est LA question qui décide de tout. Mesuré jusqu'ici :
//   — /series n'annonce que 30 séries, et refuse toute pagination
//     (?page=, ?p=, ?tout=1, ?all=1, ?limit=500 : les 30 mêmes) ;
//   — /cards porte 38 liens de listes ;
//   — /cards?q=... répond 200 mais rend les 30 cartes habituelles.
//
// Si ces 30 séries sont les 30 plus récentes, PkmCards ne peut pas combler
// nos extensions muettes, qui sont anciennes. Mieux vaut le savoir
// maintenant que d'écrire un moissonneur pour rien.
//
//   node outils/sonde-pkmcards-portee.mjs

import { readFile } from 'node:fs/promises';

const RACINE = 'https://www.pkmcards.fr';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (reperage ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));
const lire = async a => {
  try{ const r = await fetch(a, { headers: IDENTITE, redirect: 'follow' });
       return { code: r.status, corps: await r.text(), finale: r.url }; }
  catch(e){ return { code: 'réseau', corps: '', finale: a, err: e.message }; }
};

// --- 1. les 38 listes de /cards, en entier -------------------------------
console.log('=============== les listes de /cards ===============');
const cards = await lire(`${RACINE}/cards`);
const listes = [...new Set([...(cards.corps.matchAll(/href=["'](\/cards\/[^"'#?]+)["']/g))].map(m => m[1]))];
for(const l of listes.sort()) console.log('  ' + l);

// --- 2. les 30 séries, en entier -----------------------------------------
await dormir(1200);
console.log('\n=============== les séries annoncées ===============');
const series = await lire(`${RACINE}/series`);
const slugs = [...new Set([...(series.corps.matchAll(/href=["'](\/series\/[^"'#?]+)["']/g))].map(m => m[1]))];
for(const s of slugs) console.log('  ' + s);

// --- 3. nos extensions, les leur : y a-t-il recouvrement ? ---------------
// On prend les plus anciennes de notre instantané : si leur site les
// connaît, c'est jouable ; sinon, cette piste est close pour nous.
console.log('\n=============== nos vieilles extensions chez eux ===============');
let nôtres = [];
try{
  nôtres = JSON.parse(await readFile('donnees/physique/extensions.json', 'utf8'));
}catch(err){ console.log('  (instantané illisible : ' + err.message + ')'); }
const anciennes = nôtres
  .filter(e => e.dateSortie && e.dateSortie < '2012')
  .slice(0, 6);
const récentes = nôtres
  .filter(e => e.dateSortie && e.dateSortie > '2024')
  .slice(-4);
console.log(`  (${nôtres.length} extensions dans notre instantané)`);

for(const e of [...anciennes, ...récentes]){
  await dormir(1500);
  // Une carte de cette extension existe-t-elle chez eux ? Leur adresse de
  // carte porte le code et le numéro : on tente la première carte.
  const essai = `${RACINE}/cards/${String(e.id).toLowerCase()}-fr-001`;
  const r = await lire(essai);
  // Un site qui redirige l'inconnu vers son catalogue générique répondrait
  // 200 tout en ne connaissant pas la carte : on regarde où l'on arrive.
  const détourné = !r.finale.includes(String(e.id).toLowerCase());
  console.log(`  ${String(e.id).padEnd(10)} ${String(e.dateSortie).padEnd(12)} code ${String(r.code).padEnd(4)}` +
    ` ${détourné ? 'DÉTOURNÉ -> ' + r.finale.replace(RACINE,'') : 'reconnu'}   ${e.name ?? e.nom ?? ''}`);
}
