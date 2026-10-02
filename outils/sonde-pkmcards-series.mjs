// PkmCards : quelles extensions, sous quels codes, et combien des nôtres ?
// ========================================================================
//
// Une première tentative devinait l'adresse d'une extension à partir de
// notre identifiant. Elle a répondu « oui » sept fois sur sept — un faux
// positif complet : le site renvoie son catalogue générique pour toute
// adresse inconnue, et je mesurais sept fois la même page.
//
// On part donc de leur propre page /series, la seule qui dise ce qu'ils
// ont vraiment. Rien n'est récolté : on compte et on compare.
//
//   node outils/sonde-pkmcards-series.mjs --instantane donnees

import { readFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));
const dossier = args.instantane ?? 'donnees';
const IDENTITE = { 'User-Agent': 'PokeClasseur (reconnaissance, github.com/Mrv-972/Collection-Pokemon)' };

async function lire(adresse){
  try{
    const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
    return { code: r.status, corps: await r.text(), finale: r.url };
  }catch(err){ return { code: 'réseau', corps: '', finale: adresse, err: err.message }; }
}

// --- Ce que leur page /series annonce -----------------------------------
const series = await lire('https://www.pkmcards.fr/series');
console.log(`/series : ${series.code}  (${series.finale})`);
if(series.code !== 200){ console.log('inaccessible : on ne peut rien conclure.'); process.exit(1); }

const liens = [...new Set((series.corps.match(/href="(\/[^"]*)"/g) ?? []).map(h => h.slice(6, -1)))];
const pagesSerie = liens.filter(h => /^\/series?\//.test(h));
console.log(`${pagesSerie.length} pages de série référencées`);
for(const h of pagesSerie.slice(0, 20)) console.log(`   ${h}`);

// --- Les codes d'extension qu'ils emploient -----------------------------
// Leurs adresses de carte portent « /cards/<code>-fr-<numéro>-… ».
// On les relève sur la liste française, qui en montre beaucoup.
const listeFr = await lire('https://www.pkmcards.fr/cards/liste-cartes-francaises');
const codes = [...new Set((listeFr.corps.match(/\/cards\/([a-z0-9.]+)-fr-\d+/gi) ?? [])
  .map(m => m.split('/')[2].replace(/-fr-\d+$/, '')))];
console.log(`\ncodes d'extension relevés sur la liste française : ${codes.length}`);
console.log(`   ${codes.slice(0, 30).join(', ')}`);

// --- Une page d'extension existe-t-elle, et que contient-elle ? ---------
// On ne devine plus : on suit un lien qu'ils donnent eux-mêmes.
const candidat = pagesSerie[0];
if(candidat){
  const page = await lire(`https://www.pkmcards.fr${candidat}`);
  const visuels = [...new Set((page.corps.match(/https?:\/\/static\.pkmcards\.fr\/cards\/fr\/[^"'\s)]+/gi) ?? []))];
  console.log(`\nexemple — ${candidat}`);
  console.log(`   ${page.code}, ${visuels.length} visuels français`);
  for(const v of visuels.slice(0, 3)) console.log(`   ${v}`);
  // Une page redirigée vers le catalogue ne prouve rien : on le dit.
  if(!page.finale.includes(candidat)){
    console.log(`   ATTENTION : redirigé vers ${page.finale} — cette page n'existe pas.`);
  }
}

// --- Combien de NOS extensions vides retrouve-t-on dans leurs codes ? ---
const MUETTES = `miscp bog ex5.5 tk-ex-latia tk-ex-latio exu tk-ex-m tk-ex-p tk-dp-l
tk-dp-m tk-hs-g tk-hs-r 2011bw tk-bw-e tk-bw-z 2012bw 2013bw xya tk-xy-n tk-xy-sy
2014xy tk-xy-b tk-xy-w tk-xy-latia tk-xy-latio 2015xy tk-xy-p tk-xy-su 2016xy
tk-sm-r tk-sm-l 2017sm sm3.5 2018sm-fr sm7.5 2018sm 2019sm 2019sm-fr 2021swsh
swsh4.5sv cel25cc swsh9tg swsh10tg 2022swsh swsh11tg swsh12tg swsh12.5gg sve
2023sv mfb 2024sv mee 30th-c`.split(/\s+/).filter(Boolean);

const jeuDeCodes = new Set(codes.map(c => c.toLowerCase()));
// Leur « 30c » est notre « 30th-c » : on essaie quelques rapprochements.
const variantes = id => [...new Set([
  id, id.replace(/th-/, ''), id.replace(/th$/, ''), id.replace(/\./g, ''),
  id.replace(/^tk-/, ''), id.replace(/-/g, ''),
])].map(v => v.toLowerCase());

console.log('\nNos extensions vides, cherchées parmi leurs codes :');
let reconnues = 0;
for(const id of MUETTES){
  const trouve = variantes(id).find(v => jeuDeCodes.has(v));
  if(trouve) reconnues++;
  console.log(`  ${trouve ? 'oui' : '   '}  ${id.padEnd(12)} ${trouve ? '→ ' + trouve : ''}`);
}
console.log(`\n${reconnues} de nos ${MUETTES.length} extensions vides reconnues dans l'échantillon de codes.`);
console.log("(l'échantillon ne couvre qu'une page : un code absent ici n'est pas une absence chez eux)");
