import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const DOSSIER = 'images/cards';
const essai = Boolean(args.essai);
const limite = Number(args.limite ?? 0) || Infinity;
const PAUSE = Number(args.pause ?? 400);

const COTE_VIGNETTE = 420;
const COTE_HD = 760;

const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (collecte de visuels francais ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));

const aplatir = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
  .toLowerCase().replace(/[^a-z0-9]+/g, '');
const sansZeros = n => String(n ?? '').replace(/^0+/, '').toLowerCase();

const releve = JSON.parse(await readFile('donnees/visuels-pokepedia.json', 'utf8'));
if(!releve.complet)
  console.log('ATTENTION : le relevé est partiel. Des cartes manqueront sans que ce soit de leur fait.');

const extensions = JSON.parse(await readFile('donnees/physique/extensions.json', 'utf8'));

const leurs = new Map(Object.keys(releve.series).map(nom => [aplatir(nom), nom]));

const ALIAS = {
  '2018sm-fr': "Collection McDonald's 2018 (France)",
  '2019sm-fr': "Collection McDonald's 2019 (France)",
  'bw11':      'Noir & Blanc Trésors Légendaires',
};

const formeCode = c => {
  const h = String(c ?? '').toLowerCase();
  const m = /^([a-z]*)0*(\d+)([a-z]?)$/.exec(h);
  return m ? m[1] + m[2] + m[3] : h;
};
const serieDe = ext => ALIAS[ext.id] && releve.series[ALIAS[ext.id]]
  ? ALIAS[ext.id] : leurs.get(aplatir(ext.name));

const aDeja = id => ['.webp', '.png', '.jpg', '.jpeg']
  .some(ext => existsSync(path.join(DOSSIER, id + ext)));

const bilan = JSON.parse(await readFile('donnees/bilan-visuels.json', 'utf8'));
let aViser, mesureDu, cartesVisees = null;
try{
  const v = JSON.parse(await readFile('donnees/verification-visuels.json', 'utf8'));
  aViser = new Set(Object.entries(v.extensions)
    .filter(([, e]) => (e.manquant ?? 0) + (e.secoursAnglais ?? 0) + (e.indecis ?? 0) > 0)
    .map(([id]) => id));
  cartesVisees = new Set(Object.values(v.extensions).flatMap(e =>
    [...(e.cartesManquantes ?? []), ...(e.cartesAnglaises ?? []), ...(e.cartesIndecises ?? [])].map(c => c.id)));
  mesureDu = v.verifieLe;
}catch{
  aViser = new Set([
    ...bilan.aTrousSansSource.map(x => x.id),
    ...bilan.muettes.restantes.map(x => x.id),
  ]);
  mesureDu = bilan.mesureDu;
}
console.log(`${aViser.size} extensions à viser, d'après la mesure du ` +
  `${String(mesureDu ?? '?').slice(0, 10)}.`);

async function visuelFrancaisManque(carte){
  if(!/^https?:/.test(carte.image ?? '')) return true;
  try{
    const r = await fetch(carte.image, { method: 'HEAD', redirect: 'follow', headers: IDENTITE });
    return !r.ok;
  }catch{ return true; }
}

const aFaire = [];
const parExtension = new Map();
let sansSerie = [], horsCible = 0, dejaBon = 0;
const bonnesParExtension = new Map();
for(const ext of extensions){
  if(!aViser.has(ext.id)){ horsCible++; continue; }
  const leurNom = serieDe(ext);
  if(!leurNom){ sansSerie.push(ext.name); continue; }
  let cartes;
  try{ cartes = JSON.parse(await readFile(`donnees/physique/sets/${ext.id}.json`, 'utf8')); }
  catch{ continue; }
  const chezEux = Object.fromEntries(Object.entries(releve.series[leurNom])
    .map(([n, adresse]) => [formeCode(n), adresse]));
  for(const carte of cartes){
    if(aDeja(carte.id)) continue;
    if(cartesVisees && !cartesVisees.has(carte.id)) continue;
    const adresse = chezEux[formeCode(carte.localId)];
    if(!adresse) continue;
    if(!(await visuelFrancaisManque(carte))){
      dejaBon++;
      bonnesParExtension.set(ext.id, (bonnesParExtension.get(ext.id) ?? 0) + 1);
      continue;
    }
    aFaire.push({ id: carte.id, nom: carte.name, adresse, serie: leurNom, extension: ext.id });
    parExtension.set(ext.id, (parExtension.get(ext.id) ?? 0) + 1);
  }
}

console.log(`${extensions.length} extensions chez nous, ${leurs.size} séries chez eux.`);
console.log(`${horsCible} extensions écartées : leurs visuels français vont bien.`);
console.log(`${sansSerie.length} des extensions visées n'ont pas d'équivalent de nom chez eux.`);
console.log(`${dejaBon} cartes écartées : leur visuel français répond déjà.`);
if(bonnesParExtension.size){
  console.log('  réparties ainsi : à comparer avec la mesure de couverture,');
  console.log('  qui annonce certaines de ces extensions comme totalement muettes :');
  for(const [id, n] of [...bonnesParExtension].sort((a,b) => b[1]-a[1]).slice(0, 20)){
    const muette = bilan.muettes.restantes.some(m => m.id === id);
    console.log(`    ${String(n).padStart(4)}  ${id.padEnd(12)}` +
      `${muette ? '  <<< annoncée MUETTE, et pourtant elle répond' : ''}`);
  }
}
console.log(`\n${aFaire.length} visuels à prendre, sur ${parExtension.size} extensions :`);
for(const [id, n] of [...parExtension].sort((a,b) => b[1]-a[1]).slice(0, 20))
  console.log(`  ${String(n).padStart(4)}  ${id}`);
if(parExtension.size > 20) console.log(`  … et ${parExtension.size - 20} autres`);

if(essai){ console.log("\n--essai : rien n'est téléchargé."); process.exit(0); }
if(!aFaire.length){ console.log('\nRien à prendre : tout est déjà dans le dépôt.'); process.exit(0); }

let sharp;
try{ ({ default: sharp } = await import('sharp')); }
catch{
  console.error("\nsharp est absent : « npm install sharp » avant de lancer la copie.");
  console.error('Sans réduction, 1 600 fichiers de 2 Mo feraient 3 Go dans le dépôt.');
  process.exit(1);
}

await mkdir(DOSSIER, { recursive: true });
const pris = [];
let echecs = 0, octets = 0;

for(const [i, t] of aFaire.slice(0, limite === Infinity ? undefined : limite).entries()){
  try{
    const r = await fetch(t.adresse, { redirect: 'follow', headers: IDENTITE });
    if(!r.ok){ echecs++; console.log(`  ÉCHEC ${t.id} : ${r.status}`); continue; }
    const brut = Buffer.from(await r.arrayBuffer());

    const vignette = await sharp(brut).resize({ width: COTE_VIGNETTE, withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer();
    await writeFile(path.join(DOSSIER, `${t.id}.webp`), vignette);
    octets += vignette.length;

    const meta = await sharp(brut).metadata();
    if((meta.width ?? 0) > COTE_VIGNETTE){
      const haute = await sharp(brut).resize({ width: COTE_HD, withoutEnlargement: true })
        .webp({ quality: 86 }).toBuffer();
      await writeFile(path.join(DOSSIER, `${t.id}-hd.webp`), haute);
      octets += haute.length;
    }
    pris.push({ id: t.id, nom: t.nom, serie: t.serie, source: t.adresse });
    if((i + 1) % 100 === 0)
      console.log(`  ${pris.length} pris, ${echecs} en échec, ${(octets/1048576).toFixed(0)} Mo`);
  }catch(err){ echecs++; console.log(`  ÉCHEC ${t.id} : ${err.message}`); }
  await dormir(PAUSE);
}

console.log(`\n================ bilan ================`);
console.log(`pris    : ${pris.length}  (${(octets/1048576).toFixed(0)} Mo)`);
console.log(`échecs  : ${echecs}`);

const traceChemin = 'donnees/visuels-pokepedia-copies.json';
let deja = { cartes: [] };
try{ deja = JSON.parse(await readFile(traceChemin, 'utf8')); }catch{}
const toutes = new Map((deja.cartes ?? []).map(c => [c.id, c]));
for(const c of pris) toutes.set(c.id, c);
await writeFile(traceChemin, JSON.stringify({
  majLe: new Date().toISOString(),
  licence: releve.licence,
  cartes: [...toutes.values()].sort((a, b) => a.id.localeCompare(b.id)),
}, null, 1) + '\n');
console.log(`trace écrite dans ${traceChemin} (${toutes.size} cartes au total)`);
