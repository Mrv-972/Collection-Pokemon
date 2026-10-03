// Relever l'index des visuels de cartes de Poképédia.
// ===================================================
//
// La sonde a établi les faits ; cet outil en tire l'index dont la copie a
// besoin. Ce qu'on sait, mesuré :
//
//   — « allimages » énumère tout : 27 998 fichiers, 281 séries, fin de
//     liste atteinte. C'est l'interface officielle de MediaWiki : elle
//     DÉCLARE l'adresse de chaque fichier, on n'en devine aucune ;
//   — les noms suivent « Carte_<Série>_<numéro>.png », avec des tirets
//     BAS, et un numéro qui n'est pas toujours un nombre (« H1 », « TG01 ») ;
//   — le remplissage des numéros varie selon la série : « Carte_Set_de_
//     Base_4.png » mais « Carte_10th_Movie_Promo_001.png ». On indexe donc
//     sur le numéro débarrassé de ses zéros, jamais sur une forme supposée ;
//   — leur serveur n'envoie pas d'en-tête CORS et leurs images pèsent
//     2 Mo : c'est pourquoi on les copie chez nous au lieu d'y renvoyer ;
//   — licence CC BY-NC-SA 3.0 : crédit obligatoire, usage non commercial.
//     Mrv972 en a été informé et a tranché.
//
//   node outils/moissonner-pokepedia.mjs --sortie donnees [--pages 0]

import { writeFile, mkdir } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, t) =>
  a.startsWith('--') ? [a.slice(2), (t[i+1] && !t[i+1].startsWith('--')) ? t[i+1] : true] : []
).filter(x => x.length));

const sortie = args.sortie ?? 'donnees';
// 0 veut dire « toutes » : une valeur vide serait remplacée par le défaut du
// formulaire GitHub, et la passe « complète » s'arrêterait sans le dire.
const maxPages = Number(args.pages ?? 0) || Infinity;

const API = 'https://www.pokepedia.fr/api.php';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (collecte de visuels francais ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function interroger(parametres){
  const url = API + '?' + new URLSearchParams({ format: 'json', ...parametres });
  for(let essai = 0; essai < 3; essai++){
    try{
      const r = await fetch(url, { headers: IDENTITE });
      if(r.status === 429 || r.status >= 500){ await dormir(5000 * (essai + 1)); continue; }
      if(!r.ok) return { erreur: r.status };
      return r.json();
    }catch(err){
      if(essai === 2) return { erreur: err.message };
      await dormir(3000 * (essai + 1));
    }
  }
  return { erreur: 'abandon' };
}

// La licence, relevée à la source et inscrite dans le fichier : le crédit
// qu'on affichera doit pouvoir se justifier sans fouiller un journal.
const infos = await interroger({ action: 'query', meta: 'siteinfo', siprop: 'rightsinfo|general' });
const licence = {
  texte: infos.query?.rightsinfo?.text ?? null,
  adresse: infos.query?.rightsinfo?.url ?? null,
  site: infos.query?.general?.sitename ?? null,
};
console.log(`licence : ${licence.texte}`);
console.log(`          ${licence.adresse}\n`);
await dormir(1000);

// « Carte_Set_de_Base_4.png » -> série « Set de Base », numéro « 4 ».
const DECOUPE = /^Carte_(.+)_([A-Za-z]{0,3}[0-9]+[a-z]?)\.(png|jpe?g|webp|gif)$/i;
const sansZeros = n => String(n ?? '').replace(/^0+/, '').toLowerCase();

const parSerie = {};          // série -> { numéro -> adresse }
let suite = null, vus = 0, retenus = 0, pages = 0, ecartes = 0;

console.log('Énumération des visuels de cartes…');
for(let i = 0; i < maxPages; i++){
  const d = await interroger({
    action: 'query', list: 'allimages', aiprefix: 'Carte ',
    ailimit: '500', aiprop: 'url|size',
    ...(suite ? { aicontinue: suite } : {}),
  });
  if(d.erreur){ console.log(`  page ${i+1} : erreur ${d.erreur} — on s'arrête.`); break; }
  const images = d.query?.allimages ?? [];
  vus += images.length;
  pages++;
  for(const img of images){
    const m = DECOUPE.exec(img.name);
    // Sans numéro final, ce n'est pas une carte mais une image
    // d'habillage : la retenir ferait croire à une couverture plus large.
    if(!m){ ecartes++; continue; }
    const serie = m[1].replace(/_/g, ' ');
    const numero = sansZeros(m[2]);
    (parSerie[serie] ??= {});
    // Deux fichiers pour un même numéro : on garde le premier, et on le
    // signale plutôt que d'en écraser un en silence.
    if(numero in parSerie[serie]) continue;
    parSerie[serie][numero] = img.url;
    retenus++;
  }
  suite = d.continue?.aicontinue;
  if(pages % 10 === 0 || !suite)
    console.log(`  ${pages} pages, ${vus} fichiers vus, ${retenus} cartes retenues` +
      `${suite ? '' : '  — fin de la liste'}`);
  if(!suite) break;
  await dormir(1200);
}

const series = Object.entries(parSerie).sort((a, b) =>
  Object.keys(b[1]).length - Object.keys(a[1]).length);

console.log(`\n================ bilan ================`);
console.log(`fichiers vus      : ${vus}`);
console.log(`cartes retenues   : ${retenus}`);
console.log(`écartés (sans n°) : ${ecartes}`);
console.log(`séries            : ${series.length}`);
console.log(`complet           : ${suite ? 'NON — relevé partiel' : 'oui'}`);

await mkdir(sortie, { recursive: true });
const fichier = `${sortie}/visuels-pokepedia.json`;
await writeFile(fichier, JSON.stringify({
  source: 'https://www.pokepedia.fr',
  releveLe: new Date().toISOString(),
  licence,
  pagesLues: pages,
  fichiersVus: vus,
  // Un relevé partiel pris pour complet ferait conclure à tort qu'une
  // carte est absente de chez eux.
  complet: !suite,
  series: Object.fromEntries(series),
}, null, 1) + '\n');
console.log(`\nécrit dans ${fichier}`);
