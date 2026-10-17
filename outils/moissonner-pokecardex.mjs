// Relever l'index des visuels français de Pokécardex.
// ====================================================
//
// Tout ce qui suit a été mesuré, pas supposé :
//
//   - robots.txt autorise tout ; seul Baidu est bloqué ;
//   - une lecture simple ne rend qu'une coquille de 159 Ko : c'est
//     Cloudflare, pas une application JavaScript. Il faut donc un vrai
//     navigateur, qui franchit sa page de vérification ;
//   - /series liste 249 séries sous la forme /series/<CODE> ; le code est
//     dans l'adresse ET dans l'attribut « alt » du symbole ;
//   - une page de série porte le nom français en <h1>, et chaque carte
//     une image dont l'adresse est de la forme
//         pokecardex-scans.b-cdn.net/sets/<CODE>/FR/<numéro>.jpg
//     avec « alt » valant « <nom> <numéro>/<total> » ;
//   - ces images sont en chargement différé (loading="lazy") : sans
//     descendre dans la page, on n'en voit qu'une partie. C'est l'erreur
//     qui m'avait fait rater dix cartes sur trente-quatre chez PkmCards ;
//   - leur CDN répond « access-control-allow-origin: * », donc on pourra
//     pointer vers ces images sans les copier.
//
//   node outils/moissonner-pokecardex.mjs --sortie donnees [--series 0]

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { sansTiretPartout } from './typographie.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = args.sortie ?? 'donnees';
// 0 veut dire « toutes ». Une valeur vide serait remplacée par le défaut du
// formulaire GitHub, et la passe « complète » s'arrêterait sans le dire :
// c'est arrivé avec PkmCards.
const maxSeries = Number(args.series ?? 0) || Infinity;
const essai = Boolean(args.essai);

const RACINE = 'https://www.pokecardex.com';
const IDENTITE = 'PokeClasseur/1.0 (collecte de visuels francais ; ' +
                 'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)';
const dormir = ms => new Promise(r => setTimeout(r, ms));

const nav = await chromium.launch();
const contexte = await nav.newContext({ userAgent: IDENTITE, locale: 'fr-FR',
                                        viewport: { width: 1600, height: 1200 } });
// On laisse les images se charger, et c'est une leçon payée : refuser les
// images pour « alléger leur serveur » a rendu ZÉRO carte sur douze
// séries. Leur page pose deux images par carte : un fond provisoire et le
// vrai visuel, et bloquer le second déclenche leur gestion d'erreur, qui
// remet le fond provisoire à la place. L'adresse qu'on venait chercher
// disparaissait donc à cause de l'optimisation elle-même.
//
// On n'allège que ce qui ne porte aucune adresse de carte : vidéos et
// polices de caractères.
await contexte.route('**/*', route => {
  const t = route.request().resourceType();
  if(t === 'media' || t === 'font') return route.abort();
  route.continue();
});
const page = await contexte.newPage();

// --- 1. la liste des séries ----------------------------------------------
console.log('Lecture de la liste des séries…');
await page.goto(`${RACINE}/series`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3500);

const codes = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href*="/series/"]')]
    .map(a => (a.getAttribute('href') ?? '').split('/').filter(Boolean).pop())
    .filter(Boolean))]);
console.log(`${codes.length} séries listées.\n`);

// --- 2. chaque série, carte par carte ------------------------------------
// L'adresse d'un visuel porte le code et le numéro ; « alt » porte le nom.
// On lit les deux et on les recoupe, plutôt que de reconstruire l'adresse
// à partir d'une règle devinée.
const DECOUPE = /pokecardex-scans\.b-cdn\.net\/sets\/([^/]+)\/FR\/([^/?.]+)\.(jpg|jpeg|png|webp)/i;

const series = {};
let totalCartes = 0, sansCarte = [];
let totalTrous = 0; const seriesATrous = [];
// « --seule SF » : une seule série, pour l'examiner (avec --essai).
const retenues = args.seule ? [String(args.seule)]
  : codes.slice(0, maxSeries === Infinity ? undefined : maxSeries);

for(const [i, code] of retenues.entries()){
  try{
    await page.goto(`${RACINE}/series/${code}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1800);

    // Descendre par pas PLUS COURTS que l'écran, jusqu'en bas de la page.
    //
    // Leur page ne pose le vrai visuel d'une carte qu'au moment où elle
    // passe à l'écran. On descendait par bonds de deux écrans : une rangée
    // de huit cartes sur neuf n'était jamais à l'écran à l'arrêt, et
    // manquait au relevé : les positions 33 à 40, puis 105 à 112, dans
    // presque chaque série. 2 393 cartes, et autant de visuels français
    // qu'on croyait inexistants. Avec un pas de 60 % de l'écran, chaque
    // rangée y passe au moins une fois.
    let tours = 0, enBas = 0, avant = -1;
    while(tours < 400 && enBas < 3){
      const etat = await page.evaluate(() => {
        window.scrollBy(0, Math.round(window.innerHeight * 0.6));
        return {
          n: document.querySelectorAll('img').length,
          bas: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4,
        };
      });
      await page.waitForTimeout(350);
      // En bas ET plus rien de nouveau, trois fois de suite : la page a tout
      // donné, y compris ce qu'un chargement tardif ajoute à la fin.
      enBas = etat.bas && etat.n === avant ? enBas + 1 : 0;
      avant = etat.n;
      tours++;
    }

    const lu = await page.evaluate(() => ({
      nom: document.querySelector('h1')?.textContent?.trim() ?? '',
      cartes: [...document.querySelectorAll('img')].map(i => ({
        src: i.getAttribute('src') ?? '',
        // Le chargement différé range parfois l'adresse ailleurs que
        // dans « src » : on prend les deux.
        dataSrc: i.getAttribute('data-src') ?? '',
        alt: i.getAttribute('alt') ?? '',
      })),
    }));

    if(args.seule){
      // Tout ce que la page montre pour chaque numéro : quelles images
      // portent une adresse de carte, et avec quel texte.
      for(const c of lu.cartes){
        const m = DECOUPE.exec(c.src) ?? DECOUPE.exec(c.dataSrc);
        if(m && Number(m[2]) >= 100) console.log(`  n° ${m[2]}  alt « ${c.alt} »  src ${c.src ? 'oui' : 'non'}  data-src ${c.dataSrc ? 'oui' : 'non'}`);
      }
    }
    const parNumero = {};
    for(const c of lu.cartes){
      const m = DECOUPE.exec(c.src) ?? DECOUPE.exec(c.dataSrc);
      if(!m) continue;
      // On GARDE le « ?class=md » : leur serveur refuse l'adresse nue (403).
      // Le retirer « pour choisir la taille plus tard » a rendu toutes les
      // adresses inutilisables.
      const adresse = c.src || c.dataSrc;
      // « Noeunoeuf 001/128 » -> « Noeunoeuf », mais aussi
      // « Méganium 001 » -> « Méganium » : dans les séries de promos, le
      // numéro n'a pas de « /total ». Ne retirer que la première forme
      // laissait le numéro collé au nom de toutes les promos. On exige un
      // chiffre dans le mot retiré, pour garder « Pikachu V » entier.
      const FIN = /\s+([a-z]{0,3}[0-9]+[a-z]?)(?:\/[0-9a-z]+)?\s*$/i;
      const nom = c.alt.replace(FIN, '').trim();
      // Ce mot retiré est parfois le numéro IMPRIMÉ de la carte, distinct
      // de sa position dans leur liste : « Baudrive SH1 » est leur n° 104,
      // « Pharamp H1/H32 » leur n° 155. C'est la clé qui permet de la
      // retrouver chez nous, où elle s'appelle « SH1 » et « H01 ». Le
      // retirer sans le garder a fait perdre ces rattachements d'un relevé
      // à l'autre ; on le garde donc à part, quand il n'est pas la simple
      // position.
      const imprime = FIN.exec(c.alt)?.[1] ?? null;
      const position = String(m[2]).toLowerCase();
      const fiche = { adresse, nom };
      if(imprime && imprime.replace(/^0+/, '').toLowerCase() !== position.replace(/^0+/, '')) fiche.imprime = imprime;
      parNumero[position] = fiche;
    }

    const combien = Object.keys(parNumero).length;
    totalCartes += combien;
    // Les numéros absents entre 1 et le plus grand : le symptôme exact du
    // défaut de défilement corrigé plus haut. On les compte pour qu'un
    // retour du problème se voie au journal, au lieu de se découvrir des
    // semaines plus tard en cherchant pourquoi des cartes manquent.
    const entiers = Object.keys(parNumero).map(Number).filter(Number.isInteger);
    if(entiers.length){
      const presents = new Set(entiers);
      let trous = 0;
      for(let k = 1; k <= Math.max(...entiers); k++) if(!presents.has(k)) trous++;
      if(trous) seriesATrous.push(`${code} (${trous})`);
      totalTrous += trous;
    }
    if(combien) series[code] = { nom: lu.nom, cartes: parNumero };
    else{
      sansCarte.push(code);
      // Une série sans carte doit dire POURQUOI. « 0 carte sur 273 images »
      // et « 0 carte sur 0 image » sont deux pannes différentes, et la
      // première m'aurait fait gagner une passe.
      console.log(`  ${code} : 0 carte retenue sur ${lu.cartes.length} images` +
        ` : exemple : ${JSON.stringify(lu.cartes.find(c => c.src || c.dataSrc) ?? null)}`);
    }

    if((i + 1) % 20 === 0 || i === retenues.length - 1)
      console.log(`  ${i + 1}/${retenues.length} séries : ${totalCartes} cartes relevées`);
  }catch(err){
    console.log(`  ÉCHEC ${code} : ${err.message.split('\n')[0]}`);
    sansCarte.push(code);
  }
  await dormir(600);
}

await nav.close();

// --------------------------------------------------------------- bilan ----
console.log(`\n================ bilan ================`);
console.log(`séries parcourues : ${retenues.length}`);
console.log(`séries avec cartes: ${Object.keys(series).length}`);
console.log(`séries sans carte : ${sansCarte.length}${sansCarte.length ? '  (' + sansCarte.slice(0, 12).join(', ') + (sansCarte.length > 12 ? '…' : '') + ')' : ''}`);
console.log(`cartes relevées   : ${totalCartes}`);
// Un trou n'est pas forcément une faute : certaines séries sautent
// réellement des numéros. Mais s'il en revient des milliers, c'est le
// relevé qui flanche, pas Pokécardex.
console.log(`numéros sautés   : ${totalTrous} sur ${seriesATrous.length} séries` +
  (seriesATrous.length ? `  (${seriesATrous.slice(0, 15).join(', ')}${seriesATrous.length > 15 ? '…' : ''})` : ''));
console.log('\nles plus fournies :');
for(const [code, s] of Object.entries(series)
    .sort((a, b) => Object.keys(b[1].cartes).length - Object.keys(a[1].cartes).length).slice(0, 15))
  console.log(`  ${String(Object.keys(s.cartes).length).padStart(4)}  ${code.padEnd(8)} ${s.nom}`);

if(essai){
  console.log("\n--essai : rien n'est écrit.");
}else{
  await mkdir(sortie, { recursive: true });
  const fichier = `${sortie}/visuels-pokecardex.json`;
  await writeFile(fichier, JSON.stringify(sansTiretPartout({
    source: RACINE,
    cdn: 'https://pokecardex-scans.b-cdn.net',
    releveLe: new Date().toISOString(),
    // Leur CDN autorise l'affichage chez nous : c'est ce qui permet de
    // pointer vers ces images au lieu de les copier.
    cors: '*',
    seriesListees: codes.length,
    seriesParcourues: retenues.length,
    complet: maxSeries === Infinity,
    cartes: totalCartes,
    numerosSautes: totalTrous,
    series,
  }), null, 1) + '\n');
  console.log(`\nécrit dans ${fichier}`);
}
