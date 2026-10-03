// Copier chez nous les visuels français de Poképédia.
// ====================================================
//
// Même principe que pour le reste du catalogue Pocket : les fichiers
// atterrissent dans images/cards/<carte>.webp, et l'instantané les ramasse
// tout seul au prochain passage — il préfère déjà un fichier local à une
// adresse distante. Aucun code du site à changer.
//
// Pourquoi copier plutôt que renvoyer chez eux, mesuré et non supposé :
//   — leur serveur n'envoie pas d'en-tête CORS, donc le partage d'un
//     classeur contenant une de ces cartes échouerait ;
//   — leurs fichiers pèsent 2 Mo, soit dix fois trop pour une vignette ;
//   — et une source distante peut disparaître ou changer d'adresse.
//
// Licence : CC BY-NC-SA 3.0. Le crédit est obligatoire — il est affiché
// dans le pied de page du site — et l'usage doit rester non commercial.
// L'outil écrit aussi la liste de ce qu'il a pris, pour que ce crédit soit
// justifiable sans fouiller un journal d'exécution.
//
//   node outils/copier-pokepedia.mjs [--limite 0] [--essai]

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const DOSSIER = 'images/cards';
const essai = Boolean(args.essai);
// 0 = pas de limite. Utile pour éprouver la chaîne sur quelques cartes
// avant d'en demander mille six cents à leur serveur.
const limite = Number(args.limite ?? 0) || Infinity;
const PAUSE = Number(args.pause ?? 400);

// Les tailles des visuels Pocket déjà dans le dépôt, pour que les anciennes
// cartes ne détonnent pas dans une grille à côté des récentes.
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

// ------------------------------------------------- ce dont on part --------
const releve = JSON.parse(await readFile('donnees/visuels-pokepedia.json', 'utf8'));
if(!releve.complet)
  console.log('ATTENTION : le relevé est partiel. Des cartes manqueront sans que ce soit de leur fait.');

const extensions = JSON.parse(await readFile('donnees/physique/extensions.json', 'utf8'));

// Leurs noms de série contre les nôtres. Ils concordent de près — « Set de
// Base », « Jungle », « Gym Heroes » — mais pas au caractère : on compare
// des formes aplaties, sans accents ni ponctuation.
const leurs = new Map(Object.keys(releve.series).map(nom => [aplatir(nom), nom]));

// ------------------------------------------------- ce qu'il faut prendre --
const aDeja = id => ['.webp', '.png', '.jpg', '.jpeg']
  .some(ext => existsSync(path.join(DOSSIER, id + ext)));

const aFaire = [];
const parExtension = new Map();
let sansSerie = [];
for(const ext of extensions){
  const leurNom = leurs.get(aplatir(ext.name));
  if(!leurNom){ sansSerie.push(ext.name); continue; }
  let cartes;
  try{ cartes = JSON.parse(await readFile(`donnees/physique/sets/${ext.id}.json`, 'utf8')); }
  catch{ continue; }
  const chezEux = releve.series[leurNom];
  for(const carte of cartes){
    // Déjà chez nous : on ne redemande rien. C'est ce qui rend l'outil
    // relançable sans repayer les mêmes téléchargements.
    if(aDeja(carte.id)) continue;
    const adresse = chezEux[sansZeros(carte.localId)];
    if(!adresse) continue;
    aFaire.push({ id: carte.id, nom: carte.name, adresse, serie: leurNom, extension: ext.id });
    parExtension.set(ext.id, (parExtension.get(ext.id) ?? 0) + 1);
  }
}

console.log(`${extensions.length} extensions chez nous, ${leurs.size} séries chez eux.`);
console.log(`${sansSerie.length} de nos extensions n'ont pas d'équivalent de nom.`);
console.log(`\n${aFaire.length} visuels à prendre, sur ${parExtension.size} extensions :`);
for(const [id, n] of [...parExtension].sort((a,b) => b[1]-a[1]).slice(0, 20))
  console.log(`  ${String(n).padStart(4)}  ${id}`);
if(parExtension.size > 20) console.log(`  … et ${parExtension.size - 20} autres`);

if(essai){ console.log("\n--essai : rien n'est téléchargé."); process.exit(0); }
if(!aFaire.length){ console.log('\nRien à prendre : tout est déjà dans le dépôt.'); process.exit(0); }

// ------------------------------------------------- la copie ---------------
// sharp réduit les 2 Mo de PNG en vignette WebP. Sans lui on copierait des
// fichiers dix fois trop lourds, et le dépôt enflerait de plusieurs Go.
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

    // La haute définition sert au zoom. On ne l'écrit que si la source est
    // réellement plus grande : agrandir une petite image ne gagne rien et
    // double le poids pour rien.
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

// La trace de ce qu'on doit créditer. Sans elle, le crédit affiché serait
// une affirmation qu'on ne pourrait plus vérifier.
const traceChemin = 'donnees/visuels-pokepedia-copies.json';
let deja = { cartes: [] };
try{ deja = JSON.parse(await readFile(traceChemin, 'utf8')); }catch{}
const toutes = new Map((deja.cartes ?? []).map(c => [c.id, c]));
for(const c of pris) toutes.set(c.id, c);
await writeFile(traceChemin, JSON.stringify({
  majLe: new Date().toISOString(),
  licence: releve.licence,
  // À citer dans le crédit du site, et à pouvoir montrer si on le demande.
  cartes: [...toutes.values()].sort((a, b) => a.id.localeCompare(b.id)),
}, null, 1) + '\n');
console.log(`trace écrite dans ${traceChemin} (${toutes.size} cartes au total)`);
