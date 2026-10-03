// Que manque-t-il encore, et qui peut le combler ?
// ================================================
//
// Trois mesures existent séparément, et aucune ne répond seule :
//   — donnees/couverture-visuels.json   ce qui manque, et où ;
//   — donnees/appariement-pkmcards.json ce que PkmCards couvre, chez nous ;
//   — donnees/physique/                 la taille réelle de chaque extension.
//
// Ce bilan les croise pour répondre à la seule question qui compte :
// des cartes aujourd'hui sans visuel français, combien une source donnée
// en comble réellement ? Une extension « couverte » dont les visuels
// marchent déjà n'apporte rien, et il serait facile de s'en féliciter.
//
// Les chiffres sont des ESTIMATIONS : la couverture est mesurée sur un
// échantillon de cartes par extension, pas sur toutes. Le fichier le dit,
// et ce bilan le répète plutôt que de laisser croire à un comptage exact.
//
//   node outils/bilan-visuels.mjs [--sortie donnees]

import { readFile, writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));
const sortie = typeof args.sortie === 'string' ? args.sortie : null;

const lireJson = async c => JSON.parse(await readFile(c, 'utf8'));
const couverture = await lireJson('donnees/couverture-visuels.json');
const appariement = await lireJson('donnees/appariement-pkmcards.json');
const extensions = await lireJson('donnees/physique/extensions.json');

const tailles = new Map();
for(const e of extensions){
  try{ tailles.set(e.id, (await lireJson(`donnees/physique/sets/${e.id}.json`)).length); }
  catch{ tailles.set(e.id, 0); }
}
const taille = id => tailles.get(id) ?? 0;
const infoDe = id => extensions.find(e => e.id === id) ?? {};
const an = id => String(infoDe(id).dateSortie ?? '?').slice(0, 4);

// Ce que PkmCards couvre, exprimé avec NOS identifiants. Les douteux sont
// écartés : un appariement incertain gonflerait le bilan sans rien combler.
const pkmcards = new Map();
for(const a of Object.values(appariement.apparies))
  pkmcards.set(a.notre, (pkmcards.get(a.notre) ?? 0) + a.cartesRelevees);

// --- les extensions muettes : rien, dans aucune langue -------------------
const muettes = couverture.extensionsMuettes.map(m => ({
  id: m.id, nom: infoDe(m.id).name ?? m.id, an: an(m.id),
  cartes: taille(m.id), chezPkmcards: pkmcards.get(m.id) ?? 0,
}));
const muettesCombles = muettes.filter(m => m.chezPkmcards);
const muettesRestantes = muettes.filter(m => !m.chezPkmcards)
  .sort((a, b) => b.cartes - a.cartes);

// --- les extensions à trous : du français manque, partiellement ----------
// On rapporte la part sondée sans français à la taille réelle : c'est une
// règle de trois, pas un comptage.
const trous = couverture.extensionsATrous.map(t => {
  const part = (t.sondees - t.frOk) / t.sondees;
  return {
    id: t.id, nom: infoDe(t.id).name ?? t.id, an: an(t.id),
    cartes: taille(t.id),
    manqueEstime: Math.round(taille(t.id) * part),
    partSondee: `${t.frOk}/${t.sondees}`,
    chezPkmcards: pkmcards.get(t.id) ?? 0,
  };
});
const manqueTotal = trous.reduce((s, t) => s + t.manqueEstime, 0);
const comblable = trous.filter(t => t.chezPkmcards);
const comblableTotal = comblable.reduce((s, t) => s + t.manqueEstime, 0);
const restant = trous.filter(t => !t.chezPkmcards)
  .sort((a, b) => b.manqueEstime - a.manqueEstime);

// ------------------------------------------------------------- dire ------
const pc = (a, b) => b ? `${(100*a/b).toFixed(0)} %` : '—';

console.log('=============== extensions muettes ===============');
console.log("Rien ne s'affiche, dans aucune langue.");
console.log(`  ${muettes.length} extensions, ${muettes.reduce((s,m)=>s+m.cartes,0)} cartes`);
console.log(`  PkmCards en couvre ${muettesCombles.length}` +
  ` (${muettesCombles.reduce((s,m)=>s+Math.min(m.chezPkmcards,m.cartes),0)} cartes)`);
console.log(`  sans aucune source : ${muettesRestantes.length} extensions,` +
  ` ${muettesRestantes.reduce((s,m)=>s+m.cartes,0)} cartes`);
for(const m of muettesRestantes.slice(0, 15))
  console.log(`    ${String(m.cartes).padStart(4)}  ${m.an}  ${m.id.padEnd(12)} ${m.nom}`);
if(muettesRestantes.length > 15) console.log(`    … et ${muettesRestantes.length - 15} autres`);

console.log('\n=============== ce qui manque en français ===============');
console.log(`  cartes sans visuel français (estimé) : ${manqueTotal}`);
console.log(`  PkmCards peut en combler             : ${comblableTotal} (${pc(comblableTotal, manqueTotal)})`);
console.log(`  restent sans source française        : ${manqueTotal - comblableTotal}`);
console.log('\n  les plus touchées, sans source :');
for(const t of restant.slice(0, 15))
  console.log(`    ${String(t.manqueEstime).padStart(4)}/${String(t.cartes).padEnd(4)} ${t.an}  ${t.id.padEnd(12)} ${t.nom}`);

console.log('\nCes nombres sont des estimations : la couverture est mesurée sur');
console.log(`${couverture.cartesSondeesParExtension} cartes par extension, pas sur toutes.`);

if(sortie){
  const fichier = `${sortie}/bilan-visuels.json`;
  await writeFile(fichier, JSON.stringify({
    bilanLe: new Date().toISOString(),
    // D'où viennent les chiffres, pour qu'on puisse les refaire.
    mesureDu: couverture.mesureLe,
    cartesSondeesParExtension: couverture.cartesSondeesParExtension,
    appariementDu: appariement.apparieLe,
    estimation: true,
    manqueTotal, comblableParPkmcards: comblableTotal,
    sansSource: manqueTotal - comblableTotal,
    muettes: { total: muettes.length, comblees: muettesCombles.length,
               restantes: muettesRestantes },
    aTrousSansSource: restant,
  }, null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
