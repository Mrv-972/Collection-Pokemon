// Fabrique l'instantané des données que le site sert lui-même.
//
// Le site interrogeait des API au moment où le visiteur ouvrait la page.
// Trois conséquences : il se vidait quand une source tombait, il attendait
// le réseau à chaque visite, et on ne pouvait rien corriger de ce qu'une
// source se trompait. Ce script va chercher les données une fois, les range
// en JSON dans le dépôt, et GitHub Pages les sert comme le reste du site.
//
// Il lit les dépôts plutôt que les API : ce sont les sources d'origine, et
// elles donnent des choses que les API font payer cher — la rareté de chaque
// carte, par exemple, qui coûtait une trentaine de requêtes par extension.
//
//   node outils/instantane.mjs --tcgdex <clone> --sortie donnees
//
// Le clone de tcgdex/cards-database est attendu en argument ; les données de
// l'application sont téléchargées.

import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((paires, valeur, i, tout) =>
    valeur.startsWith('--') ? [...paires, [valeur.slice(2), tout[i + 1]]] : paires, []));

const CHEMIN_TCGDEX = args.tcgdex;
const SORTIE = args.sortie ?? 'donnees';

// ------------------------------------------- les visuels que tu déposes ---
//
// Certaines cartes n'ont de visuel français chez personne — les extensions
// Pocket les plus récentes, par exemple. Plutôt que de subir cette limite,
// on peut déposer l'image à la main dans images/cards/, nommée d'après
// l'identifiant de la carte :
//
//     images/cards/B4a-001.webp
//
// Ce dossier existait déjà comme dernier recours à l'affichage, quand une
// image distante échouait. Il devient ici un choix délibéré, appliqué à la
// construction : plus de requête perdue avant d'y arriver.
//
// La construction la repère et la fait passer devant toutes les sources.
// C'est le seul endroit du site où ton propre travail l'emporte sur les
// données récupérées ailleurs, et c'est voulu : tu es le dernier recours.

const DOSSIER_VISUELS = 'images/cards';
const EXTENSIONS_IMAGE = ['.webp', '.png', '.jpg', '.jpeg'];

async function recenserVisuelsLocaux(){
  const parCarte = new Map();
  let fichiers = [];
  try{
    fichiers = await readdir(DOSSIER_VISUELS);
  }catch(err){
    return parCarte;   // le dossier n'existe pas encore : rien à recenser
  }
  for(const fichier of fichiers){
    const point = fichier.lastIndexOf('.');
    if(point < 0) continue;
    if(!EXTENSIONS_IMAGE.includes(fichier.slice(point).toLowerCase())) continue;
    parCarte.set(fichier.slice(0, point), `${DOSSIER_VISUELS}/${fichier}`);
  }
  return parCarte;
}

// ---------------------------------------------------- lecture des .ts ----
//
// Les fiches de TCGdex sont des fichiers TypeScript écrits à la main mais
// très réguliers. On les lit à l'expression rationnelle plutôt qu'en
// déroulant leur chaîne de compilation, qui demanderait tout leur outillage.
// En contrepartie, le script vérifie ses propres résultats à la fin : mieux
// vaut échouer bruyamment que publier un instantané tronqué.

function champTexte(source, nom){
  const m = source.match(new RegExp(`\\b${nom}:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1].replace(/\\(.)/g, '$1') : null;
}

// Le premier bloc « name: { … } » d'un fichier est toujours celui de l'objet
// décrit ; les suivants appartiennent aux attaques, aux talents, aux boosters.
function nomTraduit(source){
  const debut = source.indexOf('name:');
  if(debut < 0) return {};
  const bloc = source.slice(debut, source.indexOf('}', debut));
  const lire = langue => {
    const m = bloc.match(new RegExp(`\\b${langue}:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return m ? m[1].replace(/\\(.)/g, '$1') : null;
  };
  return { fr: lire('fr'), en: lire('en') };
}

function premierDexId(source){
  const m = source.match(/dexId:\s*\[([^\]]*)\]/);
  if(!m) return null;
  const n = parseInt(m[1].split(',')[0], 10);
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------ physique ---

async function lireTraductionsRaretes(){
  const brut = await readFile(path.join(CHEMIN_TCGDEX, 'meta/translations/fr.json'), 'utf8');
  return JSON.parse(brut).rarity ?? {};
}

async function construirePhysique(){
  const racine = path.join(CHEMIN_TCGDEX, 'data');
  const raretesFr = await lireTraductionsRaretes();
  const entrees = await readdir(racine, { withFileTypes: true });

  const extensions = [];
  const cartesParSet = new Map();
  // TCGdex décrit chaque carte physique dans les deux langues. On en tire un
  // dictionnaire, qui servira à traduire les cartes de l'application dont la
  // source n'a pas encore de version française.
  const traductions = new Map();
  // Les extensions de l'application dont TCGdex a les visuels français.
  const pocketChezTcgdex = new Set();

  for(const serie of entrees.filter(e => e.isDirectory())){
    const ficheSerie = path.join(racine, `${serie.name}.ts`);
    if(!existsSync(ficheSerie)) continue;
    const sourceSerie = await readFile(ficheSerie, 'utf8');
    const serieId = champTexte(sourceSerie, 'id');
    const serieNom = nomTraduit(sourceSerie);

    const dansLaSerie = await readdir(path.join(racine, serie.name), { withFileTypes: true });
    for(const ext of dansLaSerie.filter(e => e.isDirectory())){
      const ficheSet = path.join(racine, serie.name, `${ext.name}.ts`);
      if(!existsSync(ficheSet)) continue;
      const sourceSet = await readFile(ficheSet, 'utf8');
      const setId = champTexte(sourceSet, 'id');
      if(!setId) continue;
      // TCGdex héberge aussi les extensions de l'application, qu'on prend
      // ailleurs et plus à jour. On ne garde pas leurs cartes — l'instantané
      // physique en serait alourdi d'un millier que le site n'y montre
      // jamais — mais on note lesquelles il connaît : ses visuels, eux, sont
      // en français, là où l'autre source n'héberge que l'anglais.
      if(/^[A-Z]\d/.test(setId) || /^P-[A-Z]$/.test(setId)){
        pocketChezTcgdex.add(setId);
        continue;
      }
      const nomSet = nomTraduit(sourceSet);
      const compte = sourceSet.match(/official:\s*(\d+)/);

      // L'adresse des visuels se déduit de la série et de l'extension, comme
      // le fait l'API : <langue>/<série>/<extension>/<numéro>.
      const base = langue => `https://assets.tcgdex.net/${langue}/${serieId}/${setId}`;

      extensions.push({
        id: setId,
        name: nomSet.fr || nomSet.en || setId,
        cardCount: { official: compte ? Number(compte[1]) : null },
        logo: `${base('fr')}/logo.png`,
        symbol: `${base('fr')}/symbol.png`,
        serieNom: serieNom.fr || serieNom.en || serie.name,
        dateSortie: champTexte(sourceSet, 'releaseDate'),
      });

      const fichiers = (await readdir(path.join(racine, serie.name, ext.name)))
        .filter(f => f.endsWith('.ts'));
      const cartes = [];
      for(const fichier of fichiers){
        const localId = fichier.replace(/\.ts$/, '');
        const source = await readFile(path.join(racine, serie.name, ext.name, fichier), 'utf8');
        const nom = nomTraduit(source);
        if(nom.en && nom.fr && nom.en !== nom.fr) traductions.set(nom.en, nom.fr);
        const rarete = champTexte(source, 'rarity');
        cartes.push({
          id: `${setId}-${localId}`,
          localId,
          name: nom.fr || nom.en || localId,
          rarity: rarete ? (raretesFr[rarete] ?? rarete) : null,
          dexId: premierDexId(source),
          image: `${base('fr')}/${localId}/low.webp`,
          imageHaute: `${base('fr')}/${localId}/high.webp`,
          // Toutes les cartes n'ont pas de visuel français : l'anglais prend
          // le relais avant le point d'interrogation.
          imageSecours: `${base('en')}/${localId}/low.webp`,
        });
      }
      cartes.sort((a, b) => a.localId.localeCompare(b.localId, undefined, { numeric: true }));
      cartesParSet.set(setId, cartes);
    }
  }

  extensions.sort((a, b) => String(a.dateSortie ?? '').localeCompare(String(b.dateSortie ?? '')));
  return { extensions, cartesParSet, traductions, pocketChezTcgdex };
}

// -------------------------------------------------------------- Pocket ---
//
// Les données de l'application viennent du jeu de flibustier, sous licence
// MIT. On garde la convention d'identifiants de TCGdex — trois chiffres,
// « P-A » plutôt que « PROMO-A » — pour que les marquages déjà posés par les
// membres restent attachés à leurs cartes.

const POCKET_BASE = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist';
const POCKET_IMAGES = 'https://cdn.jsdelivr.net/gh/flibustier/pokemon-tcg-exchange@main/public/images/cards-by-set';
const POCKET_IMAGES_SECOURS = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-exchange/main/public/images/cards-by-set';

const EQUIVALENCES_SET = { 'PROMO-A': 'P-A', 'PROMO-B': 'P-B' };
const idLocal = code => EQUIVALENCES_SET[code] ?? code;

const RARETES_POCKET = {
  C: 'Un Diamant', U: 'Deux Diamants', R: 'Trois Diamants', RR: 'Quatre Diamants',
  AR: 'Une Étoile', SR: 'Deux Étoiles', SAR: 'Deux Étoiles', IM: 'Trois Étoiles',
  UR: 'Couronne', S: 'Chromatique', SSR: 'Chromatique deux étoiles',
};

async function telecharger(adresse){
  const r = await fetch(adresse);
  if(!r.ok) throw new Error(`${adresse} → HTTP ${r.status}`);
  return r.json();
}

const aplatir = donnees => Array.isArray(donnees) ? donnees : Object.values(donnees).flat();

// La source de l'application traduit ses fichiers avec un temps de retard :
// la dernière extension parue n'existe qu'en anglais. Plutôt que de l'afficher
// telle quelle sur un site français, on traduit ce qu'on peut grâce au
// dictionnaire tiré des cartes physiques — le suffixe « ex » se recolle après
// coup, puisqu'il ne se traduit pas.
function traduireNom(nom, traductions, nomsFrancais){
  if(traductions.has(nom)) return traductions.get(nom);

  // Le suffixe « ex » ne se traduit pas, et s'écrit avec un trait d'union en
  // français : « Florizarre-ex ».
  const avecEx = String(nom).match(/^(.*?)[\s-]ex$/i);
  const base = avecEx ? avecEx[1] : nom;
  const recoller = fr => avecEx ? `${fr}-ex` : fr;

  const connu = traductions.get(base) ?? (nomsFrancais.has(base) ? base : null);
  if(connu) return recoller(connu);

  // « Team Rocket's Persian ex » se dit « Persian-ex de la Team Rocket » —
  // convention relevée sur les cartes physiques, pas inventée ici. On ne
  // l'applique que si le Pokémon lui-même a été reconnu : mieux vaut un nom
  // anglais honnête qu'un faux nom français.
  const rocket = base.match(/^Team Rocket['\u2019]s\s+(.+)$/);
  if(rocket){
    const pokemon = traductions.get(rocket[1]) ?? (nomsFrancais.has(rocket[1]) ? rocket[1] : null);
    if(pokemon) return `${recoller(pokemon)} de la Team Rocket`;
  }
  return nom;
}

// TCGdex sert ses visuels par langue ; la série de l'application y porte
// l'identifiant « tcgp ». Ses images montrent donc le texte de la carte en
// français, alors que la source Pocket n'héberge qu'une seule version, en
// anglais. On préfère la française quand elle existe, l'autre en secours :
// au pire on retombe sur ce qu'on affichait déjà.
const TCGDEX_POCKET = 'https://assets.tcgdex.net/fr/tcgp';

async function construirePocket(traductions = new Map(), nomsFrancais = new Set(), chezTcgdex = new Set()){
  const parSerie = await telecharger(`${POCKET_BASE}/sets.json`);

  const extensions = [];
  for(const [lettre, liste] of Object.entries(parSerie)){
    for(const s of liste){
      extensions.push({
        id: idLocal(s.code),
        codeDistant: s.code,
        name: s.name?.fr || s.name?.en || s.code,
        cardCount: { official: s.count ?? null },
        logo: null, symbol: null,          // cette source n'héberge pas de logo
        serieNom: `Série ${lettre}`,
        dateSortie: s.releaseDate ?? null,
      });
    }
  }
  extensions.sort((a, b) => String(a.dateSortie ?? '').localeCompare(String(b.dateSortie ?? '')));

  const cartesParSet = new Map();
  for(const ext of extensions){
    // On lit les fichiers par extension, et non le fichier français agrégé :
    // celui-ci contient aujourd'hui des noms anglais, alors que les fichiers
    // par extension sont bien traduits. C'est le contrôle de fin de script
    // qui l'a révélé, en refusant de publier un instantané où les trois
    // quarts des cartes ne trouvaient plus leur Pokémon.
    const chemins = [
      `${POCKET_BASE}/cards/fr/${encodeURIComponent(ext.codeDistant)}.min.json`,
      `${POCKET_BASE}/cards/${encodeURIComponent(ext.codeDistant)}.min.json`,
    ];
    let brutes = [];
    let francaisTrouve = false;
    for(const chemin of chemins){
      try{
        brutes = aplatir(await telecharger(chemin));
        if(brutes.length){ francaisTrouve = chemin.includes('/cards/fr/'); break; }
      }catch(err){ /* on tente le suivant */ }
    }
    if(brutes.length === 0) console.warn(`  ! aucune carte pour ${ext.id}`);
    // Le fichier français de cette extension manquait : on est tombé sur
    // l'anglais, qu'on traduit au mieux.
    const aTraduire = !francaisTrouve;
    let traduites = 0;
    const enFrancais = chezTcgdex.has(ext.id);
    // Le site le dira : pour ces extensions, aucune source ne propose le
    // visuel français, donc le texte imprimé sur la carte reste en anglais.
    if(!enFrancais) ext.visuelsAnglais = true;
    const cartes = brutes.slice().sort((a, b) => a.number - b.number).map(c => {
      const numero = String(c.number).padStart(3, '0');
      let nom = c.name;
      if(aTraduire){
        const essai = traduireNom(nom, traductions, nomsFrancais);
        if(essai !== nom){ nom = essai; traduites++; }
      }
      return {
      id: `${ext.id}-${String(c.number).padStart(3, '0')}`,
      localId: String(c.number),
      name: nom,
      rarity: RARETES_POCKET[c.rarity] ?? null,
      dexId: null,                     // absent de cette source, déduit ensuite
      image: enFrancais
        ? `${TCGDEX_POCKET}/${ext.id}/${numero}/low.webp`
        : `${POCKET_IMAGES}/${encodeURIComponent(ext.codeDistant)}/${c.number}.webp`,
      imageHaute: enFrancais
        ? `${TCGDEX_POCKET}/${ext.id}/${numero}/high.webp`
        : `${POCKET_IMAGES}/${encodeURIComponent(ext.codeDistant)}/${c.number}.webp`,
      // Le visuel anglais reste le filet : si le français manque pour une
      // carte, on montre l'autre plutôt qu'un point d'interrogation.
      imageSecours: `${POCKET_IMAGES}/${encodeURIComponent(ext.codeDistant)}/${c.number}.webp`,
      };
    });
    if(aTraduire){
      console.log(`  ${ext.id} : source anglaise, ${traduites}/${cartes.length} noms traduits`);
      // Le site le dira au visiteur : ces noms sont une reconstruction, pas
      // les noms officiels.
      ext.traductionAutomatique = { traduits: traduites, total: cartes.length };
    }
    cartesParSet.set(ext.id, cartes);
    delete ext.codeDistant;
  }
  return { extensions, cartesParSet };
}

// ------------------------------- retrouver le Pokémon d'une carte Pocket --
//
// Le jeu de données de l'application ne porte pas le numéro de Pokédex, dont
// la page « Par Pokémon » a besoin. Il se déduit du nom — et plutôt que de
// recopier ici la règle qui vit déjà dans catalogue.js, on la charge depuis
// ce fichier. Une seule règle, un seul endroit : elles ne peuvent pas
// diverger sans qu'on s'en aperçoive.

async function chargerRegleDuPokedex(){
  const pokedex = await readFile('pokedex-fr.js', 'utf8');
  const catalogue = await readFile('catalogue.js', 'utf8');
  const debut = catalogue.indexOf('let indexPokedex');
  const fin = catalogue.indexOf("// ============================ L'interface");
  if(debut < 0 || fin < 0) throw new Error("La règle du Pokédex est introuvable dans catalogue.js");

  const portee = {};
  const code = pokedex + '\n' + catalogue.slice(debut, fin)
    + '\nreturn { dexDuNomDeCarte, POKEDEX_FR };';
  return new Function(code).call(portee);
}

// ---------------------------------------------------------- écriture -----

async function ecrire(dossier, nom, donnees){
  await mkdir(dossier, { recursive: true });
  await writeFile(path.join(dossier, nom), JSON.stringify(donnees), 'utf8');
}

async function publier(univers, { extensions, cartesParSet }, sortie){
  const base = path.join(sortie, univers);
  await rm(base, { recursive: true, force: true });
  await ecrire(base, 'extensions.json', extensions);

  const parDex = new Map();
  let total = 0;
  for(const [setId, cartes] of cartesParSet){
    await ecrire(path.join(base, 'sets'), `${encodeURIComponent(setId)}.json`, cartes);
    total += cartes.length;
    for(const carte of cartes){
      if(!carte.dexId) continue;
      if(!parDex.has(carte.dexId)) parDex.set(carte.dexId, []);
      parDex.get(carte.dexId).push(carte);
    }
  }
  for(const [dexId, cartes] of parDex){
    await ecrire(path.join(base, 'dex'), `${dexId}.json`, cartes);
  }
  return { extensions: extensions.length, cartes: total, pokemon: parDex.size };
}

// ------------------------------------------------------------ contrôle ---
//
// Un instantané tronqué serait pire que pas d'instantané : le site
// afficherait sereinement un catalogue amputé. Le script refuse donc de
// publier si les ordres de grandeur ne tiennent pas.

function verifier(nom, bilan, minima){
  const soucis = [];
  for(const [champ, mini] of Object.entries(minima)){
    if(bilan[champ] < mini) soucis.push(`${champ} : ${bilan[champ]} (moins de ${mini} attendus)`);
  }
  if(soucis.length) throw new Error(`Instantané ${nom} suspect — ${soucis.join(' ; ')}`);
}

// ------------------------------------------------------------- départ ----

async function principal(){
  if(!CHEMIN_TCGDEX) throw new Error('Il manque --tcgdex <chemin du clone de tcgdex/cards-database>');

  console.log('Jeu physique — lecture du dépôt TCGdex…');
  const physique = await construirePhysique();

  console.log(`  ${physique.traductions.size} correspondances anglais → français récoltées`);
  console.log(`  ${physique.pocketChezTcgdex.size} extensions Pocket avec visuels français chez TCGdex`);
  const { dexDuNomDeCarte, POKEDEX_FR } = await chargerRegleDuPokedex();

  console.log("Application — téléchargement du jeu de données…");
  const pocket = await construirePocket(physique.traductions, new Set(POKEDEX_FR), physique.pocketChezTcgdex);

  console.log('Rattachement des cartes Pocket à leur Pokémon…');
  let rattachees = 0, orphelines = 0;
  for(const cartes of pocket.cartesParSet.values()){
    for(const carte of cartes){
      carte.dexId = dexDuNomDeCarte(carte.name);
      carte.dexId ? rattachees++ : orphelines++;
    }
  }
  console.log(`  ${rattachees} rattachées, ${orphelines} sans Pokémon (cartes de Dresseur comprises)`);

  const visuelsLocaux = await recenserVisuelsLocaux();
  if(visuelsLocaux.size){
    let poses = 0;
    for(const lot of [physique, pocket]){
      for(const cartes of lot.cartesParSet.values()){
        for(const carte of cartes){
          const local = visuelsLocaux.get(carte.id);
          if(!local) continue;
          // Ce qui venait d'ailleurs devient le secours.
          carte.imageSecours = carte.image;
          carte.image = local;
          carte.imageHaute = local;
          poses++;
        }
      }
    }
    console.log(`Visuels déposés à la main : ${poses} posés sur ${visuelsLocaux.size} fichiers trouvés`);
  }

  const bilanPhysique = await publier('physique', physique, SORTIE);
  const bilanPocket = await publier('pocket', pocket, SORTIE);

  verifier('physique', bilanPhysique, { extensions: 150, cartes: 15000, pokemon: 700 });
  verifier('pocket', bilanPocket, { extensions: 20, cartes: 3000, pokemon: 300 });

  await ecrire(SORTIE, 'version.json', {
    genere_le: new Date().toISOString(),
    sources: {
      physique: 'tcgdex/cards-database (MIT)',
      pocket: 'flibustier/pokemon-tcg-pocket-database (MIT)',
    },
    physique: bilanPhysique,
    pocket: bilanPocket,
  });

  console.log('\nInstantané publié :');
  console.log(`  physique  ${bilanPhysique.extensions} extensions · ${bilanPhysique.cartes} cartes · ${bilanPhysique.pokemon} Pokémon`);
  console.log(`  pocket    ${bilanPocket.extensions} extensions · ${bilanPocket.cartes} cartes · ${bilanPocket.pokemon} Pokémon`);
}

principal().catch(err => { console.error('Échec :', err.message); process.exit(1); });
