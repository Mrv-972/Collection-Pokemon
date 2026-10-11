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

// --- les séries à préfixe : promos, coffres et galeries --------------------
//
// Une partie de nos séries numérote ses cartes avec un préfixe : « XY01 »
// pour les promos XY, « GG01 » pour la Galerie Galaroise, « SV001 » pour un
// Coffre Étincelant, « TG01 » pour une Galerie de Dresseurs. Pokécardex,
// lui, numérote tout en chiffres, et de deux façons :
//
//   — les promos à part, en commençant à 1 : notre « XY01 » est leur « 1 » ;
//   — les coffres et galeries À LA SUITE de leur extension mère : notre
//     « GG01 » est leur n° 161 de Zénith Suprême, parce que l'extension
//     principale s'arrête à 160.
//
// L'appariement ordinaire comparait « xy01 » à « 1 » et ne trouvait jamais
// rien. Cette passe retire le préfixe, puis cherche ELLE-MÊME, pour chaque
// série, le couple (série chez eux, décalage) qui fait concorder le plus de
// noms — sans liste écrite à la main. Vérifié sur sept sous-séries avant
// d'être généralisé : 119/120 sur les Galeries de Dresseurs, 69/70 sur la
// Galerie Galaroise, et chaque écart était la même carte écrite autrement.
//
// Une carte n'est retenue que si son nom concorde à CE numéro précis —
// identique, ou leur nom prolongeant le nôtre (« Ordres du Boss » /
// « Ordres du Boss Lysandre »). Une concordance d'ensemble ne suffit pas à
// rattacher une carte isolée.

const sansNumeroP = nom => String(nom ?? '')
  .replace(/\s+[a-z]{0,3}[0-9]+[a-z]?(?:\/[0-9a-z]+)?\s*$/i, '').trim();
const partieNumerique = l => { const m = /^[A-Za-z]+0*(\d+)$/.exec(String(l)); return m ? Number(m[1]) : null; };

const parLeurNumero = new Map();       // code -> Map(numéro entier -> { nom aplati, adresse })
for(const [code, s] of Object.entries(releve.series ?? {})){
  const m = new Map();
  for(const [num, c] of Object.entries(s.cartes)){
    const n = Number(String(num).replace(/^0+/, '') || '0');
    if(Number.isFinite(n)) m.set(n, { nom: aplatir(sansNumeroP(c.nom)), adresse: c.adresse });
  }
  parLeurNumero.set(code, { nom: s.nom, cartes: m, max: Math.max(0, ...m.keys()) });
}

const concorde = (notre, leur) => notre && leur && (notre === leur || leur.startsWith(notre));
const sousSeries = {};
for(const ext of extensions){
  let cartes;
  try{ cartes = JSON.parse(await readFile(`donnees/physique/sets/${ext.id}.json`, 'utf8')); }catch{ continue; }
  const prefixees = cartes.filter(c => partieNumerique(c.localId) !== null);
  if(prefixees.length < Math.max(4, cartes.length * 0.6)) continue;

  let meilleur = null;
  for(const [code, eux] of parLeurNumero){
    // Promos : décalage nul. Coffres et galeries : en fin d'extension mère.
    const fin = eux.max - prefixees.length;
    const decalages = new Set([0]);
    for(let d = fin - 15; d <= fin + 15; d++) if(d > 0) decalages.add(d);
    for(const d of decalages){
      let ok = 0;
      for(const c of prefixees){
        if(aplatir(c.name) === eux.cartes.get(d + partieNumerique(c.localId))?.nom) ok++;
      }
      if(!meilleur || ok > meilleur.ok) meilleur = { code, d, ok };
    }
  }
  if(!meilleur || meilleur.ok < 4 || meilleur.ok / prefixees.length < 0.6) continue;

  const eux = parLeurNumero.get(meilleur.code);
  const retenues = {};
  for(const c of prefixees){
    const leur = eux.cartes.get(meilleur.d + partieNumerique(c.localId));
    if(concorde(aplatir(c.name), leur?.nom)) retenues[c.localId] = leur.adresse;
  }
  sousSeries[ext.id] = {
    code: meilleur.code, leurNom: eux.nom, decalage: meilleur.d,
    concordance: `${meilleur.ok}/${prefixees.length}`,
    retenues: Object.keys(retenues).length, cartes: retenues,
  };
}

console.log('\n================ séries à préfixe ================');
for(const [id, x] of Object.entries(sousSeries))
  console.log(`  ${id.padEnd(12)} -> ${x.code.padEnd(8)} décalage ${String(x.decalage).padStart(3)}` +
    `  noms ${x.concordance.padEnd(8)} cartes retenues ${String(x.retenues).padStart(4)}   « ${x.leurNom} »`);

// --- le rattrapage : les cartes que les deux passes précédentes ratent ---
//
// Mesuré sur les 347 cartes encore sans visuel français après les deux
// passes : presque toutes ont leur visuel chez Pokécardex, mais
//   — dans une série qu'aucune règle d'ensemble ne pouvait rattacher, parce
//     que nos noms y sont en anglais (« Bulbasaur » contre « Bulbizarre »)
//     ou que la série mêle plusieurs produits (la « 30th Classic
//     Collection » rangée à la fin de leur « 30ᵉ Anniversaire ») ;
//   — ou sous un numéro imprimé que leur numérotation range ailleurs :
//     notre « SH1 » est leur n° 104, notre « RC3 » leur n° 118.
//
// Leur nom de carte porte heureusement ce numéro imprimé — « Baudrive
// SH1 », « Majaspic RC3/RC25 », « Ho-Oh HGSS1 » —, ce qui donne une clé
// sûre. Chaque rattachement est écrit ci-dessous, avec sa règle, plutôt
// que deviné : une carte n'est retenue que si son NOM concorde aussi.
//
// Règles :
//   code   — le numéro imprimé dans leur nom égale notre numéro ;
//   numero — même numéro (après un éventuel décalage), nom concordant ;
//   lettre — la lettre des Zarbi : « Zarbi A », « Zarbi ? » ;
//   nom    — le nom seul, dans un sous-ensemble de leur série ; deux
//            cartes de même nom se répartissent dans l'ordre.
//
// Chaque série d'ici a été regardée sur une planche de vignettes
// (outils/planche-visuels.mjs) : un nom français chez Pokécardex ne
// garantit pas une carte imprimée en français. Leurs scans des « Special
// Delivery » et du Futsal sont en anglais — ces cartes n'ont jamais été
// éditées en France —, ils sont donc écartés : les compter comme français
// serait mentir sur la couverture. Ceux des McDonald's « USA » sont bien
// en français (« Pika Dessin », « Lancez une pièce ») : l'édition
// canadienne, vraisemblablement.
const RATTRAPAGES = [
  { notre: 'hgssp',     code: 'PRHS',   regle: 'code'   },
  { notre: 'swshp',     code: 'PRSWSH', regle: 'code', sauf: ['SWSH074', 'SWSH075', 'SWSH177'] },
  { notre: 'bwp',       code: 'PRBW',   regle: 'code'   },
  { notre: 'svp',       code: 'SVP',    regle: 'code'   },
  { notre: 'mep',       code: 'MEP',    regle: 'code'   },
  { notre: 'bw11',      code: 'LTR',    regle: 'code'   },
  { notre: 'ecard2',    code: 'AQ',     regle: 'code'   },
  { notre: 'ecard3',    code: 'SK',     regle: 'code'   },
  { notre: 'xya',       code: 'PRAL',   regle: 'code'   },
  { notre: 'dp7',       code: 'SF',     regle: 'code'   },
  { notre: 'hgss1',     code: 'HGSS',   regle: 'code'   },
  { notre: 'hgss2',     code: 'UL',     regle: 'code'   },
  { notre: 'hgss3',     code: 'UD',     regle: 'code'   },
  { notre: 'hgss4',     code: 'TM',     regle: 'code'   },
  { notre: 'col1',      code: 'CL',     regle: 'code'   },
  { notre: 'sma',       code: 'SM115',  regle: 'code'   },
  { notre: 'swsh4.5sv', code: 'SWSH45', regle: 'code'   },
  { notre: 'exu',       code: 'UF',     regle: 'lettre' },
  { notre: 'dp4',       code: 'GE',     regle: 'numero' },
  { notre: 'lc',        code: 'LC',     regle: 'numero' },
  { notre: 'sve',       code: 'SVE',    regle: 'numero' },
  { notre: 'mee',       code: 'MEE',    regle: 'numero' },
  { notre: '2018sm',    code: 'MC8US',  regle: 'numero' },
  { notre: '2019sm',    code: 'MC9US',  regle: 'numero' },
  { notre: 'cel25cc',   code: 'CEL',    regle: 'numero', decalage: 25 },
  { notre: '30th-c',    code: '30C',    regle: 'nom', de: 159, a: 188 },
  // Notre fiche de Lapras porte le n° de Pokédex de Magicarpe (129 au lieu
  // de 131) : aucun nom ne peut concorder. Épinglée à la main, vue sur la
  // liste de leur série : « Lokhlass », n° 44.
  { notre: 'mfb',       code: 'MFB23',  regle: 'nom', epingles: { '31': '44' } },
  { notre: 'miscp',     code: 'UPC',    regle: 'nom'    },
  // Les énergies de base de « Soleil et Lune » : celles de 2017 dans leur
  // série « Énergies », qui en range une pour chaque année d'édition.
  // Nos n° 162 et 163 s'appellent aussi « Énergie Psy » et « Énergie Métal »
  // et ont déjà leur visuel : on ne cherche que pour les n° 164 à 172.
  { notre: 'sm1',       code: 'NRGY',   regle: 'nom', filtre: '(2017)', nos: [164, 172] },
];

// Nos noms anglais se traduisent par le numéro du Pokédex, que chaque
// carte Pokémon connaît : « Bulbasaur » (n° 1) -> « Bulbizarre ».
const POKEDEX_FR = new Function(
  (await readFile('pokedex-fr.js', 'utf8')) + '\nreturn POKEDEX_FR;')();

// Un type d'énergie se dit de plusieurs façons — « Électrique »,
// « Electrik », « Lightning » ; « Obscur », « Obscurité », « Darkness ».
const TYPES = [['plante', 'grass'], ['feu', 'fire'], ['eau', 'water'],
  ['electri', 'lightning'], ['psy'], ['combat', 'fighting'], ['obscur', 'darkness'],
  ['metal'], ['fee', 'fairy'], ['dragon'], ['incolore', 'colorless']];
const typeEnergie = n => {
  if(!/energ/.test(n)) return null;
  const sans = n.replace(/energ(ie|y)/, '');
  const i = TYPES.findIndex(syn => syn.some(x => sans.includes(x)));
  return i < 0 ? null : i;
};

// Le numéro imprimé, à la fin de leur nom : « H1/H32 », « SV31/SV94 »,
// « SWSH074 », « 55a », « ONE ». On le ramène à une forme commune des deux
// côtés : « SV032 » et « SV32 » sont le même numéro.
const CODE_FIN = /\s((?:[A-Za-z]{1,5})?\d{1,3}[a-z]?|ONE|TWO|THREE|FOUR)(?:\/[A-Za-z]*\d+)?$/;
const formeCode = c => {
  const h = String(c ?? '').toUpperCase();
  const m = /^([A-Z]*)0*(\d+)([A-Z]?)$/.exec(h);
  return m ? m[1] + m[2] + m[3] : h;
};
const codeImprime = nom => CODE_FIN.exec(String(nom ?? '').trim())?.[1] ?? null;

// Leur nom sans ce qui n'est pas le nom : numéro imprimé, année
// d'édition, « /104 », tiret de remplissage, mention « de base ».
const nomNu = nom => {
  let n = String(nom ?? '').replace(/\s+—\s*$/, '').replace(/\s*\/\d+\s*$/, '').trim();
  n = n.replace(CODE_FIN, '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
  return aplatir(n).replace(/debase$/, '');
};

// Ressemblance de deux noms aplatis, par paires de lettres communes :
// « Nostenfert G » et « Nostenfer G » se ressemblent, « N » et
// « Nostenfer » non.
function ressemblance(a, b){
  if(a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const paires = s => { const m = new Map(); for(let i = 0; i < s.length - 1; i++){ const p = s.slice(i, i + 2); m.set(p, (m.get(p) ?? 0) + 1); } return m; };
  const pa = paires(a), pb = paires(b);
  let communes = 0;
  for(const [p, n] of pa) communes += Math.min(n, pb.get(p) ?? 0);
  return (2 * communes) / (a.length + b.length - 2);
}

// Les mots d'un nom, sans accents : pour chercher un Pokémon comme mot
// entier — « Mew » est un mot de « Mew Antique », pas de « Mewtwo ».
const mots = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/œ/gi, 'oe').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// Note de concordance d'un de nos noms avec un des leurs : 3 identique,
// 2 l'un commence par l'autre, 1 très ressemblant, 0 rien.
function noteNom(carte, leurNom){
  const leur = nomNu(leurNom);
  if(!leur) return 0;
  const notre = aplatir(carte.name).replace(/debase$/, '');
  const t1 = typeEnergie(notre), t2 = typeEnergie(leur);
  if(t1 !== null || t2 !== null) return t1 !== null && t1 === t2 ? 3 : 0;
  if(notre === leur) return 3;
  let note = 0;
  if(Math.min(notre.length, leur.length) >= 3 && (leur.startsWith(notre) || notre.startsWith(leur))) note = 2;
  else if(ressemblance(notre, leur) >= 0.8) note = 1;
  // Notre nom est en anglais : le Pokémon, retrouvé par son numéro du
  // Pokédex, doit être un mot de leur nom — « Special Delivery Charizard »
  // contre « Special Delivery Dracaufeu ». Jamais mieux qu'un 2, pour qu'un
  // nom identique l'emporte : « Pikachu » ne doit pas prendre la place de
  // « Pikachu et Zekrom-GX ».
  const dex = carte.dexId ? mots(POKEDEX_FR[carte.dexId - 1]).join('') : '';
  if(dex.length >= 3 && mots(leurNom).includes(dex)) note = Math.max(note, 2);
  return note;
}

const rattrapages = {};
for(const r of RATTRAPAGES){
  const eux = releve.series?.[r.code];
  let cartes;
  try{ cartes = JSON.parse(await readFile(`donnees/physique/sets/${r.notre}.json`, 'utf8')); }catch{ cartes = null; }
  if(!eux || !cartes){
    console.log(`  rattrapage ${r.notre} <- ${r.code} : ${!eux ? 'série absente du relevé' : 'extension inconnue'}`);
    continue;
  }
  let leurs = Object.entries(eux.cartes).map(([num, c]) => ({ num, n: Number(num), ...c }));
  if(r.de) leurs = leurs.filter(c => c.n >= r.de && c.n <= r.a);
  if(r.filtre) leurs = leurs.filter(c => c.nom.includes(r.filtre));

  const retenues = {}, prises = new Set();
  const retenir = (carte, leur) => { retenues[carte.localId] = leur.adresse; prises.add(leur.num); };

  for(const carte of cartes){
    if(r.sauf?.includes(carte.localId)) continue;
    if(r.nos){
      const n = Number(carte.localId);
      if(!(n >= r.nos[0] && n <= r.nos[1])) continue;
    }
    let trouve = null;
    if(r.epingles?.[carte.localId]) trouve = leurs.find(c => c.num === r.epingles[carte.localId]);
    else if(r.regle === 'code'){
      const notre = formeCode(carte.localId);
      trouve = leurs.find(c => formeCode(codeImprime(c.nom)) === notre && noteNom(carte, c.nom) >= 1);
    }else if(r.regle === 'numero'){
      const base = Number(String(carte.localId).replace(/^[A-Za-z]+/, ''));
      if(Number.isFinite(base)) trouve = leurs.find(c => c.n === base + (r.decalage ?? 0) && noteNom(carte, c.nom) >= 1);
    }else if(r.regle === 'lettre'){
      const lettre = decodeURIComponent(String(carte.localId)).toUpperCase();
      trouve = leurs.find(c => (/^Zarbi\s+([A-Z!?])(?:\s|$)/i.exec(c.nom)?.[1] ?? '').toUpperCase() === lettre);
    }else if(r.regle === 'nom'){
      // La meilleure note l'emporte ; à note égale, le premier libre dans
      // leur ordre — deux « Darkrai & Cresselia » se répartissent ainsi.
      let meilleure = 0;
      for(const c of leurs){
        if(prises.has(c.num)) continue;
        const note = noteNom(carte, c.nom);
        if(note > meilleure){ meilleure = note; trouve = c; }
      }
      if(meilleure < 2 && !(meilleure === 1 && r.de)) trouve = null;
    }
    if(trouve) retenir(carte, trouve);
  }
  rattrapages[r.notre] = {
    code: r.code, leurNom: eux.nom, regle: r.regle,
    retenues: Object.keys(retenues).length, sur: cartes.length, cartes: retenues,
  };
}

console.log('\n================ rattrapage ================');
for(const [id, x] of Object.entries(rattrapages))
  console.log(`  ${id.padEnd(12)} <- ${x.code.padEnd(8)} ${x.regle.padEnd(7)} ${String(x.retenues).padStart(4)}/${String(x.sur).padEnd(4)} « ${x.leurNom} »`);

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
    // Rattachées carte par carte, numéro et nom vérifiés : l'instantané
    // s'en sert telles quelles, sans rien recalculer.
    sousSeries,
    // Rattachées à la main, série par série, chaque carte retrouvée par son
    // numéro imprimé, son numéro ou son nom — et toujours nom vérifié.
    rattrapages,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
