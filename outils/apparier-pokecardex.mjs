// Rapprocher les séries de Pokécardex des nôtres.
// ===============================================
//
// Leurs codes ne sont pas les nôtres : « 30C », « PBL », « MEP » là où
// nous écrivons « 30th », « sv01 », « mep ». Parfois ils coïncident,
// souvent non, et s'y fier serait deviner.
//
// On apparie donc sur les faits, comme pour PkmCards — où la méthode a
// donné 109 appariements sur 114 : pour chaque code chez eux, quelle
// extension de chez nous place les MÊMES noms de cartes aux MÊMES
// numéros ? Le nom seul ne suffirait pas, un Pikachu existe partout ; le
// numéro seul non plus. C'est le couple qui identifie.
//
// Un code n'est retenu que si l'accord est net ET sans concurrent
// sérieux : un faux appariement afficherait la carte d'une autre
// extension, ce qui est pire que le point d'interrogation pour quelqu'un
// qui range une collection.
//
//   node outils/apparier-pokecardex.mjs [--sortie donnees]

import { readFile, writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));
const sortie = typeof args.sortie === 'string' ? args.sortie : null;

const aplatir = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
  .toLowerCase().replace(/[^a-z0-9]+/g, '');
const numero = n => String(n ?? '').replace(/^0+/, '').toLowerCase();

const releve = JSON.parse(await readFile('donnees/visuels-pokecardex.json', 'utf8'));
if(!releve.complet)
  console.log('ATTENTION : relevé partiel. Des séries manqueront sans que ce soit de leur fait.\n');

const extensions = JSON.parse(await readFile('donnees/physique/extensions.json', 'utf8'));

// --- ce que nous avons ---------------------------------------------------
const chezNous = new Map();
for(const ext of extensions){
  try{
    const cartes = JSON.parse(await readFile(`donnees/physique/sets/${ext.id}.json`, 'utf8'));
    const par = new Map();
    for(const c of cartes) par.set(numero(c.localId), aplatir(c.name));
    chezNous.set(ext.id, { nom: ext.name, serie: ext.serieNom, cartes: par });
  }catch{ /* extension sans fichier de cartes */ }
}

// --- ce qu'ils ont -------------------------------------------------------
// Leur texte de carte vaut « Noeunoeuf 001/128 » dans une extension, mais
// « Méganium 001 » dans une série de promos — sans le « /total ». Le
// moissonneur ne retirait que la première forme : pour toutes les promos,
// le numéro restait collé au nom, et AUCUN nom ne concordait (MEP : 103
// numéros communs, 0 nom identique). On retire donc un dernier mot qui
// contient un chiffre, avec ou sans « /total ». Exiger un chiffre protège
// les vrais noms qui finissent par une lettre : « Pikachu V » reste entier.
const sansNumero = nom => String(nom ?? '')
  .replace(/\s+[a-z]{0,3}[0-9]+[a-z]?(?:\/[0-9a-z]+)?\s*$/i, '').trim();

const chezEux = new Map();
for(const [code, s] of Object.entries(releve.series ?? {})){
  const par = new Map();
  for(const [num, c] of Object.entries(s.cartes)) par.set(numero(num), aplatir(sansNumero(c.nom)));
  chezEux.set(code, { nom: s.nom, cartes: par });
}

console.log(`${chezEux.size} séries chez eux, ${chezNous.size} extensions chez nous.\n`);

// --- l'appariement -------------------------------------------------------
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
      scores.push({ id, nom: nous.nom, communs, compares, part: communs / compares });
  }
  return scores.sort((a, b) => (b.communs - a.communs) || (b.part - a.part));
}

// La règle d'origine comparait des NOMBRES BRUTS de cartes communes. Elle
// a rejeté des appariements évidents :
//   — PRWC -> basep, 35 sur 53, contre 2 pour le suivant : rejeté parce
//     que j'exigeais 75 % ;
//   — TK10-L -> tk-sm-l, 18 sur 18, parfait : rejeté parce qu'un autre
//     kit en partageait 11. Les kits contiennent tous les mêmes énergies
//     aux mêmes numéros, ce qui gonfle le concurrent sans le rendre
//     crédible.
// On compare donc des PROPORTIONS — qui ne favorisent ni les grandes
// séries ni les cartes génériques — et l'on exige une avance nette sur le
// second, pas seulement un seuil absolu.
const SEUIL = 0.6, AVANCE = 1.5;
const apparies = {}, douteux = [], orphelins = [];
for(const [code, leurs] of [...chezEux.entries()].sort((a,b) => b[1].cartes.size - a[1].cartes.size)){
  const liste = candidats(leurs.cartes).sort((a, b) => (b.part - a.part) || (b.communs - a.communs));
  const premier = liste[0], second = liste[1];
  const net = premier && premier.part >= SEUIL && premier.communs >= 3;
  const seul = !second || premier.part >= AVANCE * second.part;
  if(net && seul){
    apparies[code] = { notre: premier.id, leurNom: leurs.nom, notreNom: premier.nom,
                       communs: premier.communs, compares: premier.compares,
                       cartesRelevees: leurs.cartes.size };
  }else if(premier){
    douteux.push({ code, leurNom: leurs.nom, cartesRelevees: leurs.cartes.size,
                   pistes: liste.slice(0, 3).map(c => `${c.id} (${c.communs}/${c.compares})`) });
  }else{
    orphelins.push({ code, leurNom: leurs.nom, cartesRelevees: leurs.cartes.size });
  }
}

// Deux de leurs codes peuvent viser la même extension de chez nous — un
// « Promo McDonald's 2018 » et son édition américaine, par exemple. Sans
// arbitrage, l'instantané garderait le dernier lu, au hasard de l'ordre.
// On garde le meilleur et l'on range les autres parmi les douteux, avec
// la raison.
const parNotre = new Map();
for(const [code, a] of Object.entries(apparies)){
  const deja = parNotre.get(a.notre);
  const mieux = !deja
    || a.communs / a.compares > deja.a.communs / deja.a.compares
    || (a.communs / a.compares === deja.a.communs / deja.a.compares && a.communs > deja.a.communs);
  if(mieux){
    if(deja){
      douteux.push({ code: deja.code, leurNom: deja.a.leurNom, cartesRelevees: deja.a.cartesRelevees,
                     pistes: [`${a.notre} déjà pris par ${code}, mieux accordé`] });
      delete apparies[deja.code];
    }
    parNotre.set(a.notre, { code, a });
  }else{
    douteux.push({ code, leurNom: a.leurNom, cartesRelevees: a.cartesRelevees,
                   pistes: [`${a.notre} déjà pris par ${deja.code}, mieux accordé`] });
    delete apparies[code];
  }
}

console.log('================ appariés ================');
for(const [code, a] of Object.entries(apparies))
  console.log(`  ${code.padEnd(8)} -> ${a.notre.padEnd(12)} ${String(a.communs + '/' + a.compares).padEnd(9)}` +
    ` ${String(a.cartesRelevees).padStart(4)} relevées   ${a.notreNom}`);

if(douteux.length){
  console.log(`\n================ douteux (${douteux.length}) ================`);
  console.log('Écartés : plusieurs extensions se disputent le code, ou accord trop faible.');
  for(const d of douteux.slice(0, 20))
    console.log(`  ${d.code.padEnd(8)} ${String(d.cartesRelevees).padStart(4)} « ${d.leurNom} »  ${d.pistes.join('  ')}`);
}
if(orphelins.length){
  console.log(`\n================ sans correspondance (${orphelins.length}) ================`);
  for(const o of orphelins.slice(0, 20))
    console.log(`  ${o.code.padEnd(8)} ${String(o.cartesRelevees).padStart(4)} « ${o.leurNom} »`);
}

console.log('\n================ bilan ================');
console.log(`appariés            : ${Object.keys(apparies).length}`);
console.log(`douteux             : ${douteux.length}`);
console.log(`sans correspondance : ${orphelins.length}`);

// --- ce que ça comblerait vraiment ---------------------------------------
// La question qui compte n'est pas « combien de séries » mais « combien de
// cartes aujourd'hui pas en français ». On la pose au verdict mesuré.
try{
  const v = JSON.parse(await readFile('donnees/verification-visuels.json', 'utf8'));
  const parNotre = new Map();
  for(const [code, a] of Object.entries(apparies)) parNotre.set(a.notre, code);
  let comblables = 0, horsPortee = 0;
  const detail = [];
  for(const [id, e] of Object.entries(v.extensions)){
    const aPourvoir = (e.manquant ?? 0) + (e.secoursAnglais ?? 0);
    if(!aPourvoir) continue;
    if(parNotre.has(id)){
      comblables += aPourvoir;
      detail.push({ id, nom: e.nom, aPourvoir, code: parNotre.get(id) });
    }else horsPortee += aPourvoir;
  }
  console.log('\n================ ce que ça peut combler ================');
  console.log(`cartes pas en français           : ${comblables + horsPortee}`);
  console.log(`dans une série appariée chez eux : ${comblables}`);
  console.log(`hors de portée de cette source   : ${horsPortee}`);
  console.log('\nles plus concernées :');
  for(const d of detail.sort((a,b) => b.aPourvoir - a.aPourvoir).slice(0, 15))
    console.log(`  ${String(d.aPourvoir).padStart(4)}  ${d.id.padEnd(12)} ${d.nom}  (chez eux : ${d.code})`);
  // Le chiffre reste une BORNE HAUTE : qu'une série soit appariée ne dit
  // pas que chacune de ses cartes a un visuel chez eux. Seul un essai
  // carte par carte le dira.
  console.log('\nCe nombre est une borne haute : série appariée ne veut pas dire');
  console.log('chaque carte présente. La copie le vérifiera carte par carte.');
}catch{ console.log('\n(verdict de vérification illisible : pas de recoupement)'); }

if(sortie){
  const fichier = `${sortie}/appariement-pokecardex.json`;
  await writeFile(fichier, JSON.stringify({
    apparieLe: new Date().toISOString(),
    releveDu: releve.releveLe ?? null,
    releveComplet: releve.complet ?? null,
    // Les douteux restent inscrits : les taire donnerait à croire le
    // rapprochement terminé alors qu'il reste à trancher.
    apparies, douteux, orphelins,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
