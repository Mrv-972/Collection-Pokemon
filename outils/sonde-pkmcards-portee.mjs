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

console.log('=============== les listes de /cards ===============');
const cards = await lire(`${RACINE}/cards`);
const listes = [...new Set([...(cards.corps.matchAll(/href=["'](\/cards\/[^"'#?]+)["']/g))].map(m => m[1]))];
for(const l of listes.sort()) console.log('  ' + l);

await dormir(1200);
console.log('\n=============== les séries annoncées ===============');
const series = await lire(`${RACINE}/series`);
const slugs = [...new Set([...(series.corps.matchAll(/href=["'](\/series\/[^"'#?]+)["']/g))].map(m => m[1]))];
for(const s of slugs) console.log('  ' + s);

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
  const essai = `${RACINE}/cards/${String(e.id).toLowerCase()}-fr-001`;
  const r = await lire(essai);
  const détourné = !r.finale.includes(String(e.id).toLowerCase());
  console.log(`  ${String(e.id).padEnd(10)} ${String(e.dateSortie).padEnd(12)} code ${String(r.code).padEnd(4)}` +
    ` ${détourné ? 'DÉTOURNÉ -> ' + r.finale.replace(RACINE,'') : 'reconnu'}   ${e.name ?? e.nom ?? ''}`);
}
