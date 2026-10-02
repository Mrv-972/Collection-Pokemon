// Combien de visuels physiques manquent vraiment, et où les trouver ?
// ==================================================================
//
// L'instantané porte une adresse pour chacune des 21 393 cartes physiques.
// Aucune n'est « manquante » dans les données : elles sont toutes
// FABRIQUÉES par calcul, à partir de la série et du numéro, sur le modèle
//     https://assets.tcgdex.net/fr/<série>/<extension>/<numéro>/low.webp
// Qu'une adresse existe ne dit donc rien de ce qu'elle renvoie. Le trou est
// ailleurs : beaucoup de ces adresses répondent 404, et le site affiche
// alors un point d'interrogation.
//
// Cette sonde mesure le trou plutôt que de le supposer. Pour chaque
// extension, elle tire quelques cartes au hasard et demande, pour chacune,
// la version française PUIS la version anglaise. Comparer les deux répond à
// la seule question qui compte pour la suite :
//
//   — l'anglais suffirait-il à combler, ou faut-il une autre source ?
//
// À lancer depuis un exécuteur GitHub : le bac à sable de développement
// n'atteint pas ce domaine.
//
//   node outils/sonde-visuels-physiques.mjs --instantane donnees [--par-extension 5]

import { readFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i + 1] && !t[i + 1].startsWith('--')) ? t[i + 1] : true] : []
).filter(x => x.length));

const dossier = args.instantane ?? 'donnees';
const parExtension = Number(args['par-extension'] ?? 5);
const IDENTITE = { 'User-Agent': 'PokeClasseur (sonde des visuels physiques)' };

// Le serveur n'aime pas qu'on lui parle trop vite : on limite le nombre
// d'appels simultanés plutôt que de tout lancer d'un coup.
async function enParallele(taches, largeur = 12){
  const resultats = [];
  let suivant = 0;
  await Promise.all(Array.from({ length: largeur }, async () => {
    while(suivant < taches.length){
      const mien = suivant++;
      resultats[mien] = await taches[mien]();
    }
  }));
  return resultats;
}

async function repond(adresse){
  try{
    const r = await fetch(adresse, { headers: IDENTITE });
    const type = r.headers.get('content-type') ?? '';
    r.body?.cancel();
    return r.ok && type.startsWith('image/');
  }catch{
    return false;
  }
}

// La même adresse, dans l'autre langue.
const versAnglais = adresse => adresse.replace('/fr/', '/en/');

const extensions = JSON.parse(await readFile(`${dossier}/physique/extensions.json`, 'utf8'));
console.log(`${extensions.length} extensions physiques, ${parExtension} cartes sondées par extension.\n`);

const bilan = [];
for(const ext of extensions){
  let cartes = [];
  try{
    cartes = JSON.parse(await readFile(
      `${dossier}/physique/sets/${encodeURIComponent(ext.id)}.json`, 'utf8'));
  }catch{ /* extension sans fichier : rien à sonder */ }

  // Un échantillon réparti, pas les premières : les numéros élevés sont
  // souvent les cartes spéciales, celles qui manquent le plus.
  const pas = Math.max(1, Math.floor(cartes.length / parExtension));
  const echantillon = [];
  for(let i = 0; i < cartes.length && echantillon.length < parExtension; i += pas){
    echantillon.push(cartes[i]);
  }

  const resultats = await enParallele(echantillon.flatMap(c => [
    async () => ({ carte: c.id, langue: 'fr', ok: await repond(c.image) }),
    async () => ({ carte: c.id, langue: 'en', ok: await repond(versAnglais(c.image)) }),
  ]));

  const fr = resultats.filter(r => r.langue === 'fr');
  const en = resultats.filter(r => r.langue === 'en');
  const frOk = fr.filter(r => r.ok).length;
  const enOk = en.filter(r => r.ok).length;
  // Les cartes que l'anglais sauverait : françaises absentes, anglaises là.
  const sauvees = fr.filter((r, i) => !r.ok && en[i].ok).length;

  const logoFr = await repond(ext.logo);
  const logoEn = logoFr ? true : await repond(versAnglais(ext.logo));

  bilan.push({ id: ext.id, nom: ext.name, serie: ext.serieNom,
    cartes: cartes.length, sondees: fr.length, frOk, enOk, sauvees, logoFr, logoEn });

  const etat = fr.length === 0 ? 'aucune carte'
    : `${frOk}/${fr.length} fr` + (frOk < fr.length ? `, ${enOk}/${en.length} en` : '');
  console.log(`${ext.id.padEnd(12)} ${etat.padEnd(22)} logo ${logoFr ? 'fr' : (logoEn ? 'EN SEUL' : 'AUCUN')}   ${ext.name}`);
}

// ------------------------------------------------------------- le bilan ---
const sondees = bilan.reduce((t, b) => t + b.sondees, 0);
const frOk = bilan.reduce((t, b) => t + b.frOk, 0);
const sauvees = bilan.reduce((t, b) => t + b.sauvees, 0);
const perdues = sondees - frOk - sauvees;

console.log('\n================ bilan ================');
console.log(`cartes sondées            : ${sondees}`);
console.log(`visuel français présent   : ${frOk} (${(100*frOk/sondees).toFixed(1)} %)`);
console.log(`absent, mais anglais là   : ${sauvees} (${(100*sauvees/sondees).toFixed(1)} %)`);
console.log(`absent dans les deux      : ${perdues} (${(100*perdues/sondees).toFixed(1)} %)`);

const logosFr = bilan.filter(b => b.logoFr).length;
const logosEn = bilan.filter(b => !b.logoFr && b.logoEn).length;
const logosRien = bilan.filter(b => !b.logoFr && !b.logoEn).length;
console.log(`\nlogos : ${logosFr} en français, ${logosEn} en anglais seulement, ${logosRien} introuvables`);

const aTrous = bilan.filter(b => b.sondees && b.frOk < b.sondees)
  .sort((a, b) => (a.frOk / a.sondees) - (b.frOk / b.sondees));
console.log(`\n${aTrous.length} extensions ont au moins un trou en français.`);
console.log('Les plus touchées :');
for(const b of aTrous.slice(0, 25)){
  console.log(`  ${b.id.padEnd(12)} ${String(b.frOk + '/' + b.sondees).padEnd(8)} ` +
    `anglais ${b.enOk}/${b.sondees}   ${b.serie} — ${b.nom}`);
}

const sansRien = bilan.filter(b => b.sondees && b.frOk === 0 && b.enOk === 0);
if(sansRien.length){
  console.log(`\n${sansRien.length} extensions n'ont RIEN, dans aucune langue :`);
  for(const b of sansRien) console.log(`  ${b.id.padEnd(12)} ${b.serie} — ${b.nom}`);
}
