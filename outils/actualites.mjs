import { readFile, writeFile } from 'node:fs/promises';
import { sansTiretPartout } from './typographie.mjs';

const i = process.argv.indexOf('--sortie');
const SORTIE = i > 0 ? process.argv[i + 1] : 'donnees';
const IDENTITE = {
  'User-Agent': 'Mozilla/5.0 (compatible; PokeClasseur/1.0; +https://github.com/Mrv-972/Collection-Pokemon)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const google = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=fr&gl=FR&ceid=FR:fr`;
const FLUX = [
  { url: google('"Pokémon TCG Pocket" OR "JCC Pokémon Pocket"'), sujet: 'pocket' },
  { url: google('"cartes Pokémon" OR "JCC Pokémon" OR "Pokémon TCG"'), sujet: 'cartes' },
  { url: google('Pokémon when:7d'), sujet: 'pokemon' },
  { url: 'https://www.jeuxvideo.com/rss/rss.xml', source: 'jeuxvideo.com', sujet: 'pokemon' },
  { url: 'https://www.dexerto.fr/feed/', source: 'Dexerto', sujet: 'pokemon' },
];
const SUJET_POKEMON = /pok[ée]mon|\bjcc\b|\btcg\b/i;
const SOURCES_SURES = /pok[ée]|nintendo|jeuxvideo|\bjv\b|game|gaming|dexerto|millenium|numerama|frandroid|geek|\bign\b|actugaming|clubic|01net|presse-citron|phonandroid|tom.?s guide|melty|konbini|esport|jeumobi|player ?one|gamekult|journal du gamer/i;
const FAITS_DIVERS = /fétichi|agress|viol|pédo|condamn|tribunal|procès|garde à vue|interpell|police|gendarm|meurtr|mort[s ]|décès|cambriol|escroqu|drogue|suicide|sexuel|enquête|prison|plainte|victime|vol de|volé/i;
const JOURS = 14, MAXIMUM = 60;

const entites = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&').trim();
const balise = (bloc, nom) => { const m = new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, 'i').exec(bloc); return m ? entites(m[1]) : null; };

function lire(xml, flux){
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([bloc]) => {
    let titre = balise(bloc, 'title') ?? '';
    const source = flux.source ?? balise(bloc, 'source') ?? 'Actualité';
    if(!flux.source && titre.endsWith(` - ${source}`)) titre = titre.slice(0, -(source.length + 3));
    return { titre: titre.replace(/<[^>]+>/g, '').trim(), lien: balise(bloc, 'link'), source,
             date: new Date(balise(bloc, 'pubDate') ?? 0).toISOString(), sujet: flux.sujet };
  }).filter(a => a.titre && /^https?:\/\//.test(a.lien ?? '') && SUJET_POKEMON.test(a.titre)
    && (flux.source || SOURCES_SURES.test(a.source)) && !FAITS_DIVERS.test(a.titre));
}

const cle = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const vus = new Map();
for(const flux of FLUX){
  try{
    const r = await fetch(flux.url, { headers: IDENTITE });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const articles = lire(await r.text(), flux);
    console.log(`${String(articles.length).padStart(3)} articles  ${flux.source ?? flux.url}`);
    for(const a of articles) if(!vus.has(cle(a.titre))) vus.set(cle(a.titre), a);
  }catch(err){ console.warn(`échec ${flux.url} : ${err.message}`); }
}

const PAR_SOURCE = 8;
const limite = Date.now() - JOURS * 86400000;
const parSource = new Map();
const articles = [...vus.values()]
  .filter(a => new Date(a.date).getTime() > limite && new Date(a.date).getTime() <= Date.now() + 3600000)
  .sort((a, b) => b.date.localeCompare(a.date))
  .filter(a => {
    const cle = a.source.toLowerCase().replace(/\.\w+$/, '');
    parSource.set(cle, (parSource.get(cle) ?? 0) + 1);
    return parSource.get(cle) <= PAR_SOURCE;
  })
  .slice(0, MAXIMUM);

if(articles.length < 5){
  console.error('Moins de cinq articles : les sources ont changé ? Fichier non modifié.');
  process.exit(1);
}
await writeFile(`${SORTIE}/actualites.json`, JSON.stringify(sansTiretPartout({ majLe: new Date().toISOString(), articles }), null, 1) + '\n');
console.log(`\n${articles.length} articles retenus, du ${articles.at(-1).date.slice(0, 10)} au ${articles[0].date.slice(0, 10)}`);
articles.slice(0, 8).forEach(a => console.log(`  · [${a.source}] ${a.titre}`));

console.log('\nsites conseillés :');
for(const site of JSON.parse(await readFile(`${SORTIE}/sites-pokemon.json`, 'utf8'))){
  try{
    const r = await fetch(site.url, { headers: IDENTITE, redirect: 'follow' });
    console.log(`  ${r.status} ${site.url}${r.url !== site.url ? ` → ${r.url}` : ''}`);
  }catch(err){ console.log(`  ÉCHEC ${site.url} : ${err.message}`); }
}
