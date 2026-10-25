import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = typeof args.sortie === 'string' ? args.sortie : null;
const largeur = Number(args.largeur ?? 16);
const reprendre = typeof args.reprendre === 'string' ? args.reprendre : null;
const DOSSIER = 'images/cards';
const IDENTITE = { 'User-Agent': 'PokeClasseur/1.0 (verification des visuels)' };

const aDejaUnFichier = id => ['.webp', '.png', '.jpg', '.jpeg']
  .some(ext => existsSync(`${DOSSIER}/${id}${ext}`));

async function repond(adresse){
  if(!/^https?:/.test(adresse ?? '')) return false;
  for(let essai = 0; essai < 3; essai++){
    try{
      const r = await fetch(adresse, { method: 'HEAD', redirect: 'follow', headers: IDENTITE });
      if(r.status === 429 || r.status >= 500){
        await new Promise(r2 => setTimeout(r2, 1500 * (essai + 1)));
        continue;
      }
      if(r.ok) return true;
      const g = await fetch(adresse, { method: 'GET', redirect: 'follow', headers: IDENTITE });
      await g.body?.cancel?.();
      return g.ok;
    }catch{
      if(essai === 2) return null;
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

const extensions = JSON.parse(await readFile('donnees/physique/extensions.json', 'utf8'));

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

let langues = {};
try{ langues = JSON.parse(await readFile('donnees/langue-visuels.json', 'utf8')).verdicts ?? {}; }catch{}
const langueLue = adresse => !adresse ? undefined : langues[adresse]?.langue
  ?? langues[/[?&]class=/.test(adresse) ? adresse : `${adresse}${adresse.includes('?') ? '&' : '?'}class=md`]?.langue;
const depotEnAnglais = id => langues[`depot:${id}`]?.langue === 'en';

let faites = 0;
const verdicts = await parPaquets(toutes, largeur, async carte => {
  let etat;
  const servieDuDepot = aDejaUnFichier(carte.id) && (!depotEnAnglais(carte.id) || !/^https?:/.test(carte.image ?? ''));
  if(servieDuDepot) etat = depotEnAnglais(carte.id) ? 'secoursAnglais' : 'depot';
  else {
    const principal = await repond(carte.image);
    const principalLu = langueLue(carte.image) ?? langueLue(String(carte.image ?? '').replace('/low.webp', '/high.webp'));
    if(principal === true) etat = principalLu === 'en' ? 'secoursAnglais' : 'principal';
    else {
      const secours = await repond(carte.imageSecours);
      if(secours === true)
        etat = /\/en\//.test(carte.imageSecours) || langueLue(carte.imageSecours) === 'en'
          ? 'secoursAnglais' : 'secoursFrancais';
      else if(principal === null || secours === null) etat = 'indecis';
      else etat = 'manquant';
    }
  }
  faites++;
  if(faites % 2000 === 0) console.log(`  ${faites} / ${toutes.length}…`);
  return { ...carte, etat };
});

const compte = { depot: 0, principal: 0, secoursFrancais: 0, secoursAnglais: 0,
                 manquant: 0, indecis: 0 };
const parExtension = new Map();
for(const v of verdicts){
  compte[v.etat]++;
  if(!parExtension.has(v.extension))
    parExtension.set(v.extension, { nom: v.nomExtension, total: 0,
      depot: 0, principal: 0, secoursFrancais: 0, secoursAnglais: 0,
      manquant: 0, indecis: 0,
      cartesManquantes: [], cartesIndecises: [], cartesAnglaises: [] });
  const e = parExtension.get(v.extension);
  e.total++; e[v.etat]++;
  if(v.etat === 'manquant') e.cartesManquantes.push({ id: v.id, nom: v.name });
  if(v.etat === 'indecis') e.cartesIndecises.push({ id: v.id, nom: v.name });
  if(v.etat === 'secoursAnglais') e.cartesAnglaises.push({ id: v.id, nom: v.name });
}

const pc = n => `${(100 * n / toutes.length).toFixed(1)} %`;
console.log('\n================ bilan ================');
console.log(`servi depuis le dépôt   : ${compte.depot} (${pc(compte.depot)})`);
console.log(`adresse principale      : ${compte.principal} (${pc(compte.principal)})`);
console.log(`secours français        : ${compte.secoursFrancais} (${pc(compte.secoursFrancais)})`);
console.log(`SERVI EN ANGLAIS        : ${compte.secoursAnglais} (${pc(compte.secoursAnglais)})`);
console.log(`AUCUN VISUEL            : ${compte.manquant} (${pc(compte.manquant)})`);
console.log(`indécis (réseau)        : ${compte.indecis} (${pc(compte.indecis)})`);

const pasEnFrancais = compteFinalProvisoire =>
  (compteFinalProvisoire.manquant ?? 0) + (compteFinalProvisoire.secoursAnglais ?? 0);
console.log(`\nPAS EN FRANÇAIS         : ${pasEnFrancais(compte)}` +
  ` (${pc(pasEnFrancais(compte))}) : absentes et anglaises réunies`);

const anglaises = [...parExtension.entries()]
  .filter(([, e]) => e.secoursAnglais)
  .sort((a, b) => b[1].secoursAnglais - a[1].secoursAnglais);
if(anglaises.length){
  console.log(`\n${anglaises.length} extensions ont des cartes servies en ANGLAIS :`);
  for(const [id, e] of anglaises.slice(0, 20))
    console.log(`  ${String(e.secoursAnglais).padStart(4)}/${String(e.total).padEnd(4)}  ${id.padEnd(12)} ${e.nom}`);
  if(anglaises.length > 20)
    console.log(`  … et ${anglaises.length - 20} autres, ` +
      `${anglaises.slice(20).reduce((s2, [, e]) => s2 + e.secoursAnglais, 0)} cartes`);
}

const troues = [...parExtension.entries()]
  .filter(([, e]) => e.manquant)
  .sort((a, b) => b[1].manquant - a[1].manquant);
console.log(`\n${troues.length} extensions ont au moins une carte sans visuel :`);
for(const [id, e] of troues.slice(0, 30))
  console.log(`  ${String(e.manquant).padStart(4)}/${String(e.total).padEnd(4)}  ${id.padEnd(12)} ${e.nom}`);
if(troues.length > 30)
  console.log(`  … et ${troues.length - 30} autres, ` +
    `${troues.slice(30).reduce((s, [, e]) => s + e.manquant, 0)} cartes`);

let extensionsFinales = Object.fromEntries(parExtension);
let compteFinal = compte;
let totalFinal = toutes.length;
if(precedent){
  extensionsFinales = { ...precedent.extensions, ...extensionsFinales };
  compteFinal = { depot: 0, principal: 0, secoursFrancais: 0, secoursAnglais: 0,
                  manquant: 0, indecis: 0 };
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
    methode: "une requête d'en-tête par carte, sur l'adresse que le site sert",
    repriseDe: precedent ? precedent.verifieLe : null,
    total: totalFinal,
    compte: compteFinal,
    extensions: extensionsFinales,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
