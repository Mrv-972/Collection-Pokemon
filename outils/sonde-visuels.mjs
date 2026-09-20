#!/usr/bin/env node
//
// Sonde de visuels français
// =========================
//
// Elle ne publie rien et ne modifie rien. Elle pose une seule question, pour
// chaque source listée dans sources-visuels.json :
//
//     « cette adresse répond-elle, et l'image qu'elle renvoie est-elle
//       vraiment différente de la version anglaise qu'on a déjà ? »
//
// La deuxième moitié de la question est la plus importante. On s'est déjà
// fait avoir une fois : un dépôt annonçait des visuels par langue, et servait
// en réalité le même fichier anglais derrière neuf adresses différentes. Une
// adresse qui répond « 200 OK » ne prouve donc rien du tout ; deux empreintes
// identiques, si.
//
// À lancer depuis GitHub Actions (onglet Actions → « Sonder les visuels
// français ») : c'est un serveur, il atteint tout Internet, contrairement au
// navigateur qui affiche le site.

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [cle, ...reste] = a.replace(/^--/, '').split('=');
    return [cle, reste.length ? reste.join('=') : true];
  })
);

const DONNEES = args.donnees ?? 'donnees';
const ECHANTILLON = Number(args.echantillon ?? 3);   // cartes testées par extension
const TOUTES = Boolean(args.toutes);                 // sonder aussi les sources déjà actives

// Le nom que la source d'origine donne aux extensions promotionnelles.
const CODES_DISTANTS = { 'P-A': 'PROMO-A', 'P-B': 'PROMO-B' };

// Beaucoup de sites refusent sèchement une requête sans identité. On se
// présente donc, honnêtement : le nom du projet et son adresse, pour que
// l'administrateur d'en face sache qui l'interroge et puisse nous écrire.
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (+https://github.com/Mrv-972/Collection-Pokemon)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

const empreinte = octets => createHash('sha1').update(octets).digest('hex').slice(0, 12);

async function corps(adresse){
  const r = await fetch(adresse, { redirect: 'follow', headers: IDENTITE });
  if(!r.ok) return { statut: r.status };
  const octets = Buffer.from(await r.arrayBuffer());
  return {
    statut: r.status,
    type: r.headers.get('content-type') ?? '?',
    taille: octets.length,
    empreinte: empreinte(octets),
  };
}

// Une image peut très bien différer de notre témoin tout en étant anglaise :
// c'est le cas quand la source sert la MÊME illustration en petit format. Les
// octets diffèrent, l'illustration non. Seule l'adresse le dit — et elle le
// dit souvent : « B3_001_EN_SM.webp ».
function marqueurDeLangue(adresse){
  const m = String(adresse).match(/[_\-\/](en|en_US|english|ja|jp|zh|ko|de|es|it|pt|fr|fr_FR|french)[_\-\.\/]/i);
  return m ? m[1].toLowerCase() : null;
}
const ESTFRANCAIS = l => l === null || l === 'fr' || l === 'fr_fr' || l === 'french';

function remplacer(gabarit, { set, numero }){
  return gabarit
    .replaceAll('{SETDIST}', CODES_DISTANTS[set] ?? set)
    .replaceAll('{SETMAJ}', set.toUpperCase())
    .replaceAll('{SET}', set)
    .replaceAll('{NUM3}', String(numero).padStart(3, '0'))
    .replaceAll('{NUM}', String(numero));
}

// --------------------------------------------------- ce qui nous manque ---

async function extensionsAmputees(){
  const extensions = JSON.parse(await readFile(`${DONNEES}/pocket/extensions.json`, 'utf8'));
  const manquantes = [];
  for(const ext of extensions.filter(e => e.visuelsAnglais)){
    const cartes = JSON.parse(await readFile(`${DONNEES}/pocket/sets/${ext.id}.json`, 'utf8'));
    if(!cartes.length) continue;
    // On prend des cartes réparties sur toute l'extension, pas les trois
    // premières : une source peut très bien n'avoir traduit que le début.
    const pas = Math.max(1, Math.floor(cartes.length / ECHANTILLON));
    const echantillon = [];
    for(let i = 0; i < cartes.length && echantillon.length < ECHANTILLON; i += pas){
      echantillon.push(cartes[i]);
    }
    manquantes.push({ id: ext.id, nom: ext.name, total: cartes.length, echantillon });
  }
  return manquantes;
}

// ------------------------------------------- les visuels anglais témoins ---
//
// Pour pouvoir dire « c'est la même image », il faut d'abord connaître
// l'image anglaise. On la télécharge une fois par carte testée.

async function temoins(manquantes){
  const par = new Map();
  for(const ext of manquantes){
    for(const carte of ext.echantillon){
      const adresse = carte.imageSecours ?? carte.image;
      try{
        const r = await corps(adresse);
        if(r.empreinte) par.set(carte.id, r);
      }catch(err){ /* pas de témoin : on le dira au moment de comparer */ }
    }
  }
  return par;
}

// ------------------------------------------------------ les deux genres ---

async function sonderMotif(candidat, ext, anglais){
  const lignes = [];
  for(const carte of ext.echantillon){
    const adresse = remplacer(candidat.motif, { set: ext.id, numero: carte.localId });
    let r;
    try{ r = await corps(adresse); }
    catch(err){ lignes.push({ carte: carte.id, verdict: 'injoignable', detail: err.message }); continue; }

    if(r.statut !== 200){ lignes.push({ carte: carte.id, verdict: `HTTP ${r.statut}` }); continue; }
    if(!/image\//.test(r.type)){
      // Beaucoup de sites répondent 200 avec une page « introuvable ».
      lignes.push({ carte: carte.id, verdict: 'pas une image', detail: r.type });
      continue;
    }
    const temoin = anglais.get(carte.id);
    if(temoin && temoin.empreinte === r.empreinte){
      lignes.push({ carte: carte.id, verdict: 'IDENTIQUE À L’ANGLAIS', detail: `${r.taille} o` });
      continue;
    }
    const langue = marqueurDeLangue(adresse);
    if(!ESTFRANCAIS(langue)){
      lignes.push({ carte: carte.id, verdict: `adresse marquée « ${langue} »`, detail: adresse });
      continue;
    }
    lignes.push({
      carte: carte.id,
      verdict: temoin ? 'image distincte' : 'image (pas de témoin anglais)',
      detail: `${r.taille} o · ${adresse}`,
    });
  }
  return lignes;
}

async function sonderPage(candidat, ext, anglais){
  const adressePage = remplacer(candidat.page, { set: ext.id, numero: 1 });
  let texte;
  try{
    const r = await fetch(adressePage, { redirect: 'follow', headers: IDENTITE });
    if(!r.ok) return [{ carte: '—', verdict: `page HTTP ${r.status}`, detail: adressePage }];
    texte = await r.text();
  }catch(err){
    return [{ carte: '—', verdict: 'page injoignable', detail: err.message }];
  }

  const motif = new RegExp(remplacer(candidat.motifImage, { set: ext.id, numero: 1 }), 'g');
  const trouvees = new Map();
  for(const m of texte.matchAll(motif)) trouvees.set(String(Number(m[1])), m[0]);

  if(!trouvees.size){
    // Plutôt que de conclure « rien », on montre ce que la page contient
    // vraiment : c'est ce qui permet de corriger le motif de recherche au
    // lieu de le deviner une deuxième fois.
    const images = [...new Set(
      [...texte.matchAll(/https?:\/\/[^\s"'\\]+\.(?:webp|png|jpg|jpeg)/g)].map(m => m[0])
    )].slice(0, 8);

    // Beaucoup de sites modernes ne mettent pas les images dans le HTML :
    // ils livrent un bloc de données que le navigateur dessine ensuite. Ce
    // bloc est une bien meilleure source qu'une page — autant regarder s'il
    // est là avant de conclure que la piste est morte.
    const pistes = [];
    if(/__NEXT_DATA__/.test(texte))  pistes.push('bloc __NEXT_DATA__ présent (site Next.js)');
    if(/__NUXT__/.test(texte))       pistes.push('bloc __NUXT__ présent (site Nuxt)');
    if(/application\/ld\+json/.test(texte)) pistes.push('données ld+json présentes');
    const jsons = [...new Set(
      [...texte.matchAll(/[\"'\(]((?:https?:\/\/[^\s"'\\]+|\/[^\s"'\\]*))\.json[^\s"'\\]*/g)].map(m => m[0].slice(1))
    )].slice(0, 6);

    return [
      { carte: '—', verdict: 'page lue, aucune image repérée',
        detail: `${texte.length} caractères — voici ce qu'elle contient :` },
      ...images.map(a => ({ carte: '  img', verdict: '', detail: a })),
      ...jsons.map(a  => ({ carte: '  json', verdict: '', detail: a })),
      ...pistes.map(p => ({ carte: '  ind.', verdict: '', detail: p })),
    ];
  }

  const lignes = [{ carte: '—', verdict: `${trouvees.size} images repérées sur la page`, detail: adressePage }];
  for(const carte of ext.echantillon){
    const adresse = trouvees.get(String(carte.localId));
    if(!adresse){ lignes.push({ carte: carte.id, verdict: 'absente de la page' }); continue; }
    try{
      const r = await corps(adresse);
      const temoin = anglais.get(carte.id);
      const langue = marqueurDeLangue(adresse);
      const verdict = !ESTFRANCAIS(langue) ? `adresse marquée « ${langue} »`
        : temoin && temoin.empreinte === r.empreinte ? 'IDENTIQUE À L’ANGLAIS'
        : 'image distincte';
      lignes.push({ carte: carte.id, verdict, detail: `${r.taille ?? '?'} o · ${adresse}` });
    }catch(err){
      lignes.push({ carte: carte.id, verdict: 'injoignable', detail: err.message });
    }
  }
  return lignes;
}

// ---------------------------------------------------------------- sonde ---

async function principal(){
  const config = JSON.parse(await readFile('outils/sources-visuels.json', 'utf8'));
  const manquantes = await extensionsAmputees();

  if(!manquantes.length){
    console.log('Aucune extension en attente de visuels français. Rien à sonder.');
    return;
  }

  const total = manquantes.reduce((n, e) => n + e.total, 0);
  console.log(`${manquantes.length} extensions sans visuels français, ${total} cartes au total :`);
  for(const e of manquantes) console.log(`  ${e.id.padEnd(6)} ${String(e.total).padStart(4)} cartes  ${e.nom}`);

  console.log('\nTéléchargement des visuels anglais témoins…');
  const anglais = await temoins(manquantes);
  console.log(`  ${anglais.size} témoins récupérés\n`);

  const candidats = config.candidats.filter(c => TOUTES || !c.actif);
  const prometteurs = [];

  for(const candidat of candidats){
    console.log('═'.repeat(72));
    console.log(`${candidat.nom}   [${candidat.genre}]${candidat.actif ? '  (déjà active)' : ''}`);
    console.log('═'.repeat(72));
    let distinctes = 0;
    for(const ext of manquantes){
      const lignes = candidat.genre === 'page'
        ? await sonderPage(candidat, ext, anglais)
        : await sonderMotif(candidat, ext, anglais);
      console.log(`  ${ext.id}`);
      for(const l of lignes){
        console.log(`    ${String(l.carte).padEnd(10)} ${l.verdict}${l.detail ? '  —  ' + l.detail : ''}`);
        if(l.verdict.startsWith('image distincte')) distinctes++;
      }
    }
    console.log(`  → ${distinctes} visuels réellement différents de l'anglais\n`);
    if(distinctes) prometteurs.push({ nom: candidat.nom, distinctes });
  }

  console.log('═'.repeat(72));
  console.log('VERDICT');
  console.log('═'.repeat(72));
  if(!prometteurs.length){
    console.log("Aucune source candidate ne rend de visuel français.");
    console.log("Il n'y a rien à allumer : les pistes de cette liste sont mortes,");
    console.log("il faut en ajouter d'autres dans outils/sources-visuels.json.");
  }else{
    prometteurs.sort((a, b) => b.distinctes - a.distinctes);
    console.log('Sources à retenir, la meilleure en premier :');
    for(const p of prometteurs) console.log(`  ${String(p.distinctes).padStart(3)} visuels  ${p.nom}`);
    console.log('\nPour en allumer une : passer son « actif » à true dans');
    console.log('outils/sources-visuels.json, puis relancer la construction.');
  }
}

principal().catch(err => { console.error('Échec :', err.message); process.exit(1); });
