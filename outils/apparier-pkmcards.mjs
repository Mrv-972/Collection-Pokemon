// Rapprocher les extensions de PkmCards des nôtres.
// =================================================
//
// Leurs codes ne sont pas les nôtres : ils écrivent « 30c », « pbl »,
// « tef », « n4 » là où notre instantané écrit « base1 », « sv08 ». Rien
// ne relie les deux a priori, et deviner serait la cinquième erreur de la
// soirée. Mais deux choses sont vraies :
//
//   — leurs adresses portent le NOM FRANÇAIS de la carte en fin de nom de
//     fichier (…-fr-001-me055-30e-anniversaire-noeunoeuf.webp) ;
//   — notre instantané porte ce même nom, pour le même numéro.
//
// On apparie donc sur les faits : pour chaque code chez eux, on regarde
// quelle extension de chez nous place les MÊMES noms aux MÊMES numéros.
// Un appariement n'est retenu que s'il est à la fois net et sans
// concurrent sérieux — mieux vaut un code non apparié qu'un faux.
//
//   node outils/apparier-pkmcards.mjs [--releve donnees/visuels-pkmcards.json]
//                                     [--instantane donnees] [--sortie donnees]

import { readFile, writeFile, readdir } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const releveChemin = args.releve ?? 'donnees/visuels-pkmcards.json';
const instantane = args.instantane ?? 'donnees';
const sortie = typeof args.sortie === 'string' ? args.sortie : null;

// Réduire un nom à sa forme comparable : sans accents, sans ponctuation.
// « Nœunœuf » et « noeunoeuf » doivent se reconnaître ; « Pikachu-ex » et
// « pikachu-ex » aussi.
const aplatir = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
  .toLowerCase().replace(/[^a-z0-9]+/g, '');

// Un numéro comparable : « 001 », « 1 » et « 01 » sont le même.
const numero = n => String(n ?? '').replace(/^0+/, '').toLowerCase();

// ------------------------------------------------- ce qu'ils ont ----------
const releve = JSON.parse(await readFile(releveChemin, 'utf8'));

// Ce qui suit « -fr-<numéro>- » n'est PAS seulement le nom de la carte :
// c'est le nom de l'extension, puis celui de la carte. Ainsi
//   …-30c-fr-001-me055-30e-anniversaire-noeunoeuf.webp
// porte « me055-30e-anniversaire » avant « noeunoeuf ». Comparer le tout
// à « Nœunœuf » ne pouvait rien donner — et ne donnait rien.
//
// Ce préfixe est constant à l'intérieur d'un même code. On le DÉTECTE donc,
// en prenant le plus long début commun à toutes les cartes du code, plutôt
// que de le deviner extension par extension.
const brut = new Map();     // code -> [{num, bouts}]
for(const [cle, adresse] of Object.entries(releve.visuels ?? {})){
  const m = /^(.+)-([0-9a-z]+)$/i.exec(cle);
  if(!m) continue;
  const [, code, num] = m;
  const queue = (/-fr-[0-9a-z]+-(.+)\.(webp|png|jpe?g)$/i.exec(adresse) ?? [])[1];
  if(!queue) continue;
  if(!brut.has(code)) brut.set(code, []);
  brut.get(code).push({ num: numero(num), bouts: queue.split('-') });
}

// Le début commun, compté en morceaux séparés par des tirets : couper au
// milieu d'un mot donnerait des noms tronqués qui ne s'apparieraient pas.
function débutCommun(entrées){
  if(entrées.length < 2) return 0;
  let n = 0;
  for(;;){
    const premier = entrées[0].bouts[n];
    // On ne mange jamais le dernier morceau : ce serait le nom de la carte.
    if(premier === undefined) return n;
    if(entrées.some(e => e.bouts.length <= n + 1 || e.bouts[n] !== premier)) return n;
    n++;
  }
}

const chezEux = new Map();
const préfixes = new Map();
for(const [code, entrées] of brut){
  const saut = débutCommun(entrées);
  préfixes.set(code, entrées[0].bouts.slice(0, saut).join('-'));
  const par = new Map();
  for(const e of entrées) par.set(e.num, aplatir(e.bouts.slice(saut).join('-')));
  chezEux.set(code, par);
}

// ------------------------------------------------- ce que nous avons -----
const extensions = JSON.parse(await readFile(`${instantane}/physique/extensions.json`, 'utf8'));
const chezNous = new Map();
for(const ext of extensions){
  try{
    const cartes = JSON.parse(await readFile(`${instantane}/physique/sets/${ext.id}.json`, 'utf8'));
    const par = new Map();
    for(const c of cartes) par.set(numero(c.localId), aplatir(c.name));
    chezNous.set(ext.id, { nom: ext.name, serie: ext.serieNom, cartes: par });
  }catch{ /* une extension sans fichier de cartes : on l'ignore. */ }
}

console.log(`${chezEux.size} codes chez eux, ${chezNous.size} extensions chez nous.\n`);
console.log('préfixes détectés (un échantillon) :');
for(const [code, p] of [...préfixes].slice(0, 8))
  console.log(`  ${code.padEnd(8)} « ${p} »`);
console.log('');

// ------------------------------------------------- l'appariement ---------
// Pour un code, on compte chez chaque extension combien de numéros portent
// le même nom. Le nom seul ne suffirait pas (un Pikachu existe partout) :
// c'est le couple numéro+nom qui identifie.
function candidats(leurs){
  const scores = [];
  for(const [id, nous] of chezNous){
    let communs = 0, compares = 0;
    for(const [num, nom] of leurs){
      const notre = nous.cartes.get(num);
      if(notre === undefined) continue;
      compares++;
      if(notre === nom) communs++;
    }
    if(compares >= 3 && communs > 0)
      scores.push({ id, nom: nous.nom, serie: nous.serie, communs, compares,
                    part: communs / compares });
  }
  return scores.sort((a, b) =>
    (b.communs - a.communs) || (b.part - a.part));
}

const apparies = {}, douteux = [], orphelins = [];
for(const [code, leurs] of [...chezEux.entries()].sort((a,b) => b[1].size - a[1].size)){
  const liste = candidats(leurs);
  const premier = liste[0], second = liste[1];
  // Net : le premier reconnaît au moins les trois quarts de ce qu'on a pu
  // comparer. Sans concurrent : le second est loin derrière.
  const net = premier && premier.part >= 0.75 && premier.communs >= 3;
  const seul = !second || second.communs <= premier.communs * 0.5;
  if(net && seul){
    apparies[code] = { notre: premier.id, nom: premier.nom, serie: premier.serie,
                       communs: premier.communs, compares: premier.compares,
                       cartesRelevees: leurs.size };
  }else if(premier){
    douteux.push({ code, cartesRelevees: leurs.size,
                   pistes: liste.slice(0, 3).map(c =>
                     `${c.id} (${c.communs}/${c.compares}) ${c.nom}`) });
  }else{
    orphelins.push({ code, cartesRelevees: leurs.size });
  }
}

console.log('================ appariés ================');
for(const [code, a] of Object.entries(apparies))
  console.log(`  ${code.padEnd(8)} -> ${a.notre.padEnd(10)} ${String(a.communs + '/' + a.compares).padEnd(8)}` +
    ` ${String(a.cartesRelevees).padStart(4)} relevées   ${a.nom}`);

if(douteux.length){
  console.log(`\n================ douteux (${douteux.length}) ================`);
  console.log('Non retenus : plusieurs extensions se disputent le code, ou');
  console.log("l'accord est trop faible. À trancher à la main.");
  for(const d of douteux.slice(0, 25))
    console.log(`  ${d.code.padEnd(8)} ${String(d.cartesRelevees).padStart(4)} relevées   ${d.pistes.join('  |  ')}`);
}

if(orphelins.length){
  console.log(`\n================ sans correspondance (${orphelins.length}) ================`);
  console.log("Aucune de nos extensions ne place ces noms à ces numéros.");
  for(const o of orphelins.slice(0, 25))
    console.log(`  ${o.code.padEnd(8)} ${String(o.cartesRelevees).padStart(4)} relevées`);
}

console.log('\n================ bilan ================');
console.log(`appariés            : ${Object.keys(apparies).length}`);
console.log(`douteux             : ${douteux.length}`);
console.log(`sans correspondance : ${orphelins.length}`);

if(sortie){
  const fichier = `${sortie}/appariement-pkmcards.json`;
  await writeFile(fichier, JSON.stringify({
    apparieLe: new Date().toISOString(),
    releveDu: releve.releveLe ?? null,
    releveComplet: releve.complet ?? null,
    // On garde les douteux dans le fichier : les taire donnerait à croire
    // que le rapprochement est terminé alors qu'il reste à trancher.
    apparies, douteux, orphelins,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
