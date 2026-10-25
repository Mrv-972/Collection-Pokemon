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
  const langue = fr >= 2 && fr >= 3 * en ? 'fr' : en >= 2 && en >= 3 * fr ? 'en' : '?';
  return { langue, fr, en };
}

function tesseract(png){
  return new Promise((ok, ko) => {
    const p = spawn('tesseract', ['stdin', 'stdout', '-l', 'fra+eng', '--psm', '6'],
                    { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
    let sortie = '';
    const minuteur = setTimeout(() => p.kill('SIGKILL'), 60000);
    p.stdout.on('data', d => { sortie += d; });
    p.on('error', err => { clearTimeout(minuteur); ko(err); });
    p.on('close', () => { clearTimeout(minuteur); ok(sortie); });
    p.stdin.end(png);
  });
}

const versionLisible = a => /pokecardex/.test(a) ? a.replace(/([?&]class=)md\b/, '$1hd') : a;

async function lire(source){
  let brut;
  if(source.startsWith('depot:')){
    const id = source.slice(6);
    const chemin = ['-hd.webp', '.webp', '.png', '.jpg'].map(e => `images/cards/${id}${e}`).find(existsSync);
    if(!chemin) return { langue: '?', erreur: 'fichier absent' };
    brut = await readFile(chemin);
  }else{
    const r = await fetch(versionLisible(source), { headers: IDENTITE });
    if(!r.ok) return { langue: '?', erreur: `HTTP ${r.status}` };
    brut = Buffer.from(await r.arrayBuffer());
  }
  const { width = 444, height = 620 } = await sharp(brut).metadata();
  const haut = Math.round(height * 0.42);
  const png = await sharp(brut).extract({ left: 0, top: haut, width, height: height - haut })
    .resize({ width: width * 3, kernel: 'lanczos3' })
    .grayscale().normalize().sharpen().png().toBuffer();
  return verdict(await tesseract(png));
}

let memoire = {};
try{ memoire = JSON.parse(await readFile(FICHIER, 'utf8')).verdicts ?? {}; }catch{}

const servie = a => /[?&]class=/.test(a) ? a : `${a}${a.includes('?') ? '&' : '?'}class=md`;
const sources = new Map();

if(args.adresses){
  for(const a of String(args.adresses).split(/\s+/).filter(Boolean)) sources.set(a, 'liste');
}

const extensions = JSON.parse(await readFile('donnees/physique/extensions.json', 'utf8'));
const cartes = [];
for(const ext of extensions){
  try{ cartes.push(...JSON.parse(await readFile(`donnees/physique/sets/${encodeURIComponent(ext.id)}.json`, 'utf8'))); }catch{}
}

if(args.pokecardex){
  for(const c of cartes) if(/pokecardex/.test(c.imageSecours ?? '')) sources.set(servie(c.imageSecours), 'pokecardex');
  try{
    const a = JSON.parse(await readFile('donnees/appariement-pokecardex.json', 'utf8'));
    for(const groupe of [a.rattrapages ?? {}, a.sousSeries ?? {}])
      for(const r of Object.values(groupe))
        for(const adresse of Object.values(r.cartes ?? {})) sources.set(servie(adresse), 'pokecardex');
  }catch{}
}

const auHasard = (liste, n) => liste.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
const nPk = Number(args['echantillon-pkmcards'] ?? 0);
if(nPk) for(const c of auHasard(cartes.filter(c => /pkmcards/.test(c.imageSecours ?? '')), nPk))
  sources.set(c.imageSecours, 'pkmcards');
const nDepot = Number(args['echantillon-depot'] ?? 0);
if(nDepot) for(const c of auHasard(cartes.filter(c => existsSync(`images/cards/${c.id}.webp`)), nDepot))
  sources.set(`depot:${c.id}`, 'depot');

if(args['tcgdex-suspectes']){
  const POKEDEX_FR = new Function((await readFile('pokedex-fr.js', 'utf8')) + '\nreturn POKEDEX_FR;')();
  const plat = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/gi, 'oe').toLowerCase();
  const MOTS_ANGLAIS = /\b(the|of|with|at|and|friends|energy|trainer)\b|['’]s\b|^lt\.|special delivery|on the ball/i;
  const nomAnglais = c => MOTS_ANGLAIS.test(c.name ?? '') ||
    (c.dexId && !plat(c.name).includes(plat(POKEDEX_FR[c.dexId - 1])));
  const parExtension = new Map();
  for(const c of cartes){
    if(!/^https:\/\/assets\.tcgdex\.net\/fr\//.test(c.image ?? '')) continue;
    const ext = c.id.slice(0, c.id.lastIndexOf('-'));
    if(!parExtension.has(ext)) parExtension.set(ext, []);
    parExtension.get(ext).push(c);
  }
  for(const liste of parExtension.values())
    if(liste.filter(nomAnglais).length >= 3)
      for(const c of liste) sources.set(c.image.replace('/low.webp', '/high.webp'), 'tcgdex');
}

if(args['depot-pokepedia']){
  try{
    const copies = JSON.parse(await readFile('donnees/visuels-pokepedia-copies.json', 'utf8')).cartes ?? [];
    for(const c of copies) if(existsSync(`images/cards/${c.id}.webp`)) sources.set(`depot:${c.id}`, 'poképédia');
  }catch{}
}

const aLire = [...sources.keys()].filter(s => !memoire[s] || memoire[s].langue === '?' && memoire[s].erreur);
console.log(`${sources.size} images retenues, ${aLire.length} à lire (${sources.size - aLire.length} déjà lues).`);

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
