// Carte par carte : le visuel s'affiche-t-il vraiment ?
// =====================================================
//
// Cet outil remplace la sonde de couverture, qui se trompait. Elle
// RECALCULAIT les adresses à tester au lieu de lire celles de l'instantané,
// et n'en échantillonnait que huit par extension. Elle a ainsi déclaré
// muettes le Set de Base, Jungle et Fossile, dont 93, 64 et 60 cartes
// s'affichent parfaitement. Une erreur qui marche dans les deux sens : elle
// a pu tout aussi bien déclarer saines des extensions qui ont des trous.
//
// Ici, aucun calcul d'adresse et aucun échantillon : on demande, pour
// CHAQUE carte, si l'adresse que le site sert réellement répond. Une
// requête d'en-tête, qui ne télécharge aucune image.
//
// L'ordre suit celui du site, pour que le verdict soit celui que voit un
// visiteur :
//   1. un fichier dans le dépôt ? alors rien à demander, c'est bon ;
//   2. sinon l'adresse principale (`image`) répond-elle ?
//   3. sinon le secours (`imageSecours`, PkmCards ou l'anglais) ?
//   4. sinon le visiteur voit un point d'interrogation.
//
//   node outils/verifier-visuels.mjs [--sortie donnees] [--largeur 16]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = typeof args.sortie === 'string' ? args.sortie : null;
const largeur = Number(args.largeur ?? 16);
// Reprendre une vérification : on ne refait que les extensions qui avaient
// des cartes indécises. Un indécis n'est pas une absence — c'est un hoquet
// de réseau — et le compter comme manquant gonflerait le chiffre.
const reprendre = typeof args.reprendre === 'string' ? args.reprendre : null;
const DOSSIER = 'images/cards';
const IDENTITE = { 'User-Agent': 'PokeClasseur/1.0 (verification des visuels)' };

const aDejaUnFichier = id => ['.webp', '.png', '.jpg', '.jpeg']
  .some(ext => existsSync(`${DOSSIER}/${id}${ext}`));

// Un échec de réseau n'est pas une absence : on réessaie avant de conclure,
// sinon un hoquet passerait pour une carte manquante.
async function repond(adresse){
  if(!/^https?:/.test(adresse ?? '')) return false;
  for(let essai = 0; essai < 3; essai++){
    try{
      const r = await fetch(adresse, { method: 'HEAD', redirect: 'follow', headers: IDENTITE });
      if(r.status === 429 || r.status >= 500){
        await new Promise(r2 => setTimeout(r2, 1500 * (essai + 1)));
        continue;
      }
      return r.ok;
    }catch{
      if(essai === 2) return null;   // indécis, et on le dira
      await new Promise(r2 => setTimeout(r2, 1200 * (essai + 1)));
    }
  }
  return null;
}

async function parPaquets(taches, n, faire){
  const sortie = [];
  let suivant = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while(suivant < taches.length){
      const mien = suivant++;
      sortie[mien] = await faire(taches[mien], mien);
    }
  }));
  return sortie;
}

// ------------------------------------------------- ce qu'on vérifie -------
const extensions = JSON.parse(await readFile('donnees/physique/extensions.json', 'utf8'));

// En reprise, on relit le verdict précédent pour savoir où chercher. Les
// identifiants des indécises n'y figuraient pas au premier passage : on
// reprend donc toutes les cartes des extensions concernées, ce qui est
// large mais sûr, et le fichier les notera pour la prochaine fois.
let aReprendre = null, precedent = null;
if(reprendre){
  precedent = JSON.parse(await readFile(reprendre, 'utf8'));
  aReprendre = new Set(Object.entries(precedent.extensions)
    .filter(([, e]) => e.indecis > 0).map(([id]) => id));
  const combien = Object.values(precedent.extensions).reduce((s2, e) => s2 + e.indecis, 0);
  console.log(`Reprise : ${combien} cartes indécises, réparties sur ${aReprendre.size} extensions.`);
  console.log('On revérifie toutes les cartes de ces extensions.\n');
}

const toutes = [];
for(const ext of extensions){
  if(aReprendre && !aReprendre.has(ext.id)) continue;
  let cartes;
  try{ cartes = JSON.parse(await readFile(`donnees/physique/sets/${ext.id}.json`, 'utf8')); }
  catch{ continue; }
  for(const c of cartes) toutes.push({ ...c, extension: ext.id, nomExtension: ext.name });
}
console.log(`${toutes.length} cartes physiques à vérifier, ${extensions.length} extensions.\n`);

let faites = 0;
const verdicts = await parPaquets(toutes, largeur, async carte => {
  let etat;
  if(aDejaUnFichier(carte.id)) etat = 'depot';
  else {
    const principal = await repond(carte.image);
    if(principal === true) etat = 'principal';
    else {
      const secours = await repond(carte.imageSecours);
      if(secours === true) etat = 'secours';
      else if(principal === null || secours === null) etat = 'indecis';
      else etat = 'manquant';
    }
  }
  faites++;
  if(faites % 2000 === 0) console.log(`  ${faites} / ${toutes.length}…`);
  return { ...carte, etat };
});

// ------------------------------------------------- le bilan ---------------
const compte = { depot: 0, principal: 0, secours: 0, manquant: 0, indecis: 0 };
const parExtension = new Map();
for(const v of verdicts){
  compte[v.etat]++;
  if(!parExtension.has(v.extension))
    parExtension.set(v.extension, { nom: v.nomExtension, total: 0,
      depot: 0, principal: 0, secours: 0, manquant: 0, indecis: 0,
      cartesManquantes: [], cartesIndecises: [] });
  const e = parExtension.get(v.extension);
  e.total++; e[v.etat]++;
  if(v.etat === 'manquant') e.cartesManquantes.push({ id: v.id, nom: v.name });
  // Les noter : au premier passage je ne gardais que leur nombre, et une
  // reprise ciblée devenait impossible.
  if(v.etat === 'indecis') e.cartesIndecises.push({ id: v.id, nom: v.name });
}

const pc = n => `${(100 * n / toutes.length).toFixed(1)} %`;
console.log('\n================ bilan ================');
console.log(`servi depuis le dépôt   : ${compte.depot} (${pc(compte.depot)})`);
console.log(`adresse principale      : ${compte.principal} (${pc(compte.principal)})`);
console.log(`secours                 : ${compte.secours} (${pc(compte.secours)})`);
console.log(`AUCUN VISUEL            : ${compte.manquant} (${pc(compte.manquant)})`);
console.log(`indécis (réseau)        : ${compte.indecis} (${pc(compte.indecis)})`);

const troues = [...parExtension.entries()]
  .filter(([, e]) => e.manquant)
  .sort((a, b) => b[1].manquant - a[1].manquant);
console.log(`\n${troues.length} extensions ont au moins une carte sans visuel :`);
for(const [id, e] of troues.slice(0, 30))
  console.log(`  ${String(e.manquant).padStart(4)}/${String(e.total).padEnd(4)}  ${id.padEnd(12)} ${e.nom}`);
if(troues.length > 30)
  console.log(`  … et ${troues.length - 30} autres, ` +
    `${troues.slice(30).reduce((s, [, e]) => s + e.manquant, 0)} cartes`);

// En reprise, le verdict ne porte que sur quelques extensions : l'écrire
// tel quel effacerait tout le reste. On le fusionne.
let extensionsFinales = Object.fromEntries(parExtension);
let compteFinal = compte;
let totalFinal = toutes.length;
if(precedent){
  extensionsFinales = { ...precedent.extensions, ...extensionsFinales };
  compteFinal = { depot: 0, principal: 0, secours: 0, manquant: 0, indecis: 0 };
  totalFinal = 0;
  for(const e of Object.values(extensionsFinales)){
    totalFinal += e.total;
    for(const cle of Object.keys(compteFinal)) compteFinal[cle] += e[cle] ?? 0;
  }
  const g = compteFinal, a = precedent.compte;
  console.log('\n================ après reprise, sur tout le catalogue ================');
  console.log(`  aucun visuel : ${a.manquant} -> ${g.manquant}`);
  console.log(`  indécis      : ${a.indecis} -> ${g.indecis}`);
}

if(sortie){
  await mkdir(sortie, { recursive: true });
  const fichier = `${sortie}/verification-visuels.json`;
  await writeFile(fichier, JSON.stringify({
    verifieLe: new Date().toISOString(),
    // Pas d'échantillon : chaque carte a été demandée. C'est la différence
    // avec la mesure précédente, et c'est elle qui rend ce fichier fiable.
    methode: "une requête d'en-tête par carte, sur l'adresse que le site sert",
    repriseDe: precedent ? precedent.verifieLe : null,
    total: totalFinal,
    compte: compteFinal,
    extensions: extensionsFinales,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
