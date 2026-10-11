// Lire la langue d'un visuel de carte, sur l'image elle-même.
// ============================================================
//
// Pourquoi : la provenance d'une image ne dit pas sa langue. Pokécardex
// est un site français, mais quand il n'a pas le scan français d'une
// carte, il lui arrive de montrer le scan anglais à la place. Vu sur
// planche : Serperior RC3 de Trésors Légendaires, Alakazam H1 de
// Skyridge, la promo Bulbasaur du concours d'illustration — noms
// français dans leur liste, texte anglais sur la carte. Notre
// vérification classait la langue d'après l'adresse : elle comptait ces
// cartes comme françaises. C'est exactement ce que Mrv972 ne veut pas.
//
// Comment : on lit le texte de la carte par reconnaissance de caractères
// (tesseract), et on y cherche des mots qui n'existent que dans une
// langue. « Faiblesse », « Retraite », « Lancez une pièce » d'un côté ;
// « Weakness », « Retreat », « Flip a coin » de l'autre. Une carte n'est
// déclarée française ou anglaise que si l'écart est net ; sinon elle
// reste « ? » — une énergie de base n'a presque pas de texte.
//
// Les verdicts sont gardés dans donnees/langue-visuels.json, par adresse :
// une image déjà lue ne l'est pas deux fois.
//
//   node outils/langue-visuels.mjs --pokecardex            les scans Pokécardex en service
//   node outils/langue-visuels.mjs --adresses "url url …"  une liste, pour éprouver l'outil
//        [--echantillon-pkmcards 300] [--echantillon-depot 200] [--essai]

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import sharp from 'sharp';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));
const essai = Boolean(args.essai);
const FICHIER = 'donnees/langue-visuels.json';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (verification de la langue des visuels ; ' +
                'github.com/Mrv-972/Collection-Pokemon)',
};

// --- les mots qui trahissent une langue ----------------------------------
// Seulement des mots propres à une langue : « Pokémon », « résistance »,
// « deck » s'écrivent pareil des deux côtés et ne prouvent rien.
const FRANCAIS = new Set(('faiblesse retraite lancez piece pieces degats votre vos adversaire ' +
  'pioche piochez defaussez defausse attaquant actif chaque cette cartes carte dans les des une ' +
  'sur pour est son ses tour main energie energies dresseur objet stade outil talent ' +
  'niveau evolue base inflige infligee supplementaires jusqu fois face pile ' +
  'banc mettez melangez joueur peut vous').split(' '));
const ANGLAIS = new Set(('weakness retreat flip coin coins damage your opponent opponents discard ' +
  'draw ability attack attacks the this each turn hand energy trainer item stadium tool basic ' +
  'stage evolves heads tails bench put shuffle player can you does more card cards from into ' +
  'search active').split(' '));

function verdict(texte){
  const mots = new Set(texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z]+/).filter(m => m.length >= 2));
  let fr = 0, en = 0;
  for(const m of mots){ if(FRANCAIS.has(m)) fr++; if(ANGLAIS.has(m)) en++; }
  const langue = fr >= 3 && fr >= 2 * en ? 'fr' : en >= 3 && en >= 2 * fr ? 'en' : '?';
  return { langue, fr, en };
}

// --- la lecture ----------------------------------------------------------
function tesseract(png){
  return new Promise((ok, ko) => {
    const p = spawn('tesseract', ['stdin', 'stdout', '-l', 'fra+eng', '--psm', '3'],
                    { stdio: ['pipe', 'pipe', 'ignore'] });
    let sortie = '';
    p.stdout.on('data', d => { sortie += d; });
    p.on('error', ko);
    p.on('close', () => ok(sortie));
    p.stdin.end(png);
  });
}

async function lire(source){
  let brut;
  if(source.startsWith('depot:')){
    const id = source.slice(6);
    const chemin = ['-hd.webp', '.webp', '.png', '.jpg'].map(e => `images/cards/${id}${e}`).find(existsSync);
    if(!chemin) return { langue: '?', erreur: 'fichier absent' };
    brut = await readFile(chemin);
  }else{
    const r = await fetch(source, { headers: IDENTITE });
    if(!r.ok) return { langue: '?', erreur: `HTTP ${r.status}` };
    brut = Buffer.from(await r.arrayBuffer());
  }
  // Agrandie et en niveaux de gris : le texte d'une vignette de 400 px
  // est trop petit pour être lu tel quel.
  const png = await sharp(brut).resize({ width: 1100 }).grayscale().normalize().sharpen().png().toBuffer();
  return verdict(await tesseract(png));
}

// --- ce qu'on lit --------------------------------------------------------
let memoire = {};
try{ memoire = JSON.parse(await readFile(FICHIER, 'utf8')).verdicts ?? {}; }catch{}

const servie = a => /[?&]class=/.test(a) ? a : `${a}${a.includes('?') ? '&' : '?'}class=md`;
const sources = new Map();   // source -> provenance

if(args.adresses){
  for(const a of String(args.adresses).split(/\s+/).filter(Boolean)) sources.set(a, 'liste');
}

const extensions = JSON.parse(await readFile('donnees/physique/extensions.json', 'utf8'));
const cartes = [];
for(const ext of extensions){
  try{ cartes.push(...JSON.parse(await readFile(`donnees/physique/sets/${encodeURIComponent(ext.id)}.json`, 'utf8'))); }catch{}
}

if(args.pokecardex){
  // Les scans Pokécardex en service comme secours…
  for(const c of cartes) if(/pokecardex/.test(c.imageSecours ?? '')) sources.set(servie(c.imageSecours), 'pokecardex');
  // … et ceux que le rattrapage propose, qu'ils soient déjà en service ou
  // pas : l'instantané doit pouvoir écarter un scan anglais avant de s'en
  // servir.
  try{
    const a = JSON.parse(await readFile('donnees/appariement-pokecardex.json', 'utf8'));
    for(const groupe of [a.rattrapages ?? {}, a.sousSeries ?? {}])
      for(const r of Object.values(groupe))
        for(const adresse of Object.values(r.cartes ?? {})) sources.set(servie(adresse), 'pokecardex');
  }catch{}
}

// Des échantillons tirés au hasard, pour MESURER si d'autres sources ont le
// même défaut, sans lire vingt mille images.
const auHasard = (liste, n) => liste.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
const nPk = Number(args['echantillon-pkmcards'] ?? 0);
if(nPk) for(const c of auHasard(cartes.filter(c => /pkmcards/.test(c.imageSecours ?? '')), nPk))
  sources.set(c.imageSecours, 'pkmcards');
const nDepot = Number(args['echantillon-depot'] ?? 0);
if(nDepot) for(const c of auHasard(cartes.filter(c => existsSync(`images/cards/${c.id}.webp`)), nDepot))
  sources.set(`depot:${c.id}`, 'depot');

const aLire = [...sources.keys()].filter(s => !memoire[s] || memoire[s].langue === '?' && memoire[s].erreur);
console.log(`${sources.size} images retenues, ${aLire.length} à lire (${sources.size - aLire.length} déjà lues).`);

// --- la lecture, à plusieurs ---------------------------------------------
let faites = 0;
const largeur = Math.max(2, cpus().length);
const file = [...aLire];
await Promise.all(Array.from({ length: largeur }, async () => {
  while(file.length){
    const s = file.shift();
    try{ memoire[s] = { ...(await lire(s)), source: sources.get(s) }; }
    catch(err){ memoire[s] = { langue: '?', erreur: err.message, source: sources.get(s) }; }
    faites++;
    if(args.adresses) console.log(`  ${memoire[s].langue}  fr ${memoire[s].fr ?? '-'} en ${memoire[s].en ?? '-'}  ${s}`);
    else if(faites % 200 === 0) console.log(`  ${faites} / ${aLire.length}…`);
  }
}));

// --- bilan ---------------------------------------------------------------
const parSource = {};
for(const [s, prov] of sources){
  const v = memoire[s];
  const b = parSource[prov] ??= { fr: 0, en: 0, '?': 0 };
  b[v?.langue ?? '?']++;
}
console.log('\n================ bilan ================');
for(const [prov, b] of Object.entries(parSource))
  console.log(`  ${prov.padEnd(11)} français ${String(b.fr).padStart(5)}   anglais ${String(b.en).padStart(5)}   indéterminé ${String(b['?']).padStart(5)}`);
const anglaises = [...sources.keys()].filter(s => memoire[s]?.langue === 'en');
if(anglaises.length){
  console.log(`\nexemples d'images lues en ANGLAIS :`);
  for(const s of anglaises.slice(0, 25)) console.log(`  ${s}`);
}

if(essai || args.adresses){ console.log("\n(essai : rien n'est écrit)"); process.exit(0); }
await writeFile(FICHIER, JSON.stringify({
  majLe: new Date().toISOString(),
  methode: 'lecture du texte de la carte (tesseract fra+eng), mots propres à chaque langue',
  bilan: parSource,
  verdicts: memoire,
}) + '\n');
console.log(`\nécrit dans ${FICHIER}`);
