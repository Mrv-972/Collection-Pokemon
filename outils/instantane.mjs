// Fabrique l'instantané des données que le site sert lui-même.
//
// Le site interrogeait des API au moment où le visiteur ouvrait la page.
// Trois conséquences : il se vidait quand une source tombait, il attendait
// le réseau à chaque visite, et on ne pouvait rien corriger de ce qu'une
// source se trompait. Ce script va chercher les données une fois, les range
// en JSON dans le dépôt, et GitHub Pages les sert comme le reste du site.
//
// Il lit les dépôts plutôt que les API : ce sont les sources d'origine, et
// elles donnent des choses que les API font payer cher : la rareté de chaque
// carte, par exemple, qui coûtait une trentaine de requêtes par extension.
//
//   node outils/instantane.mjs --tcgdex <clone> --sortie donnees
//
// Le clone de tcgdex/cards-database est attendu en argument ; les données de
// l'application sont téléchargées.

import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((paires, valeur, i, tout) =>
    valeur.startsWith('--') ? [...paires, [valeur.slice(2), tout[i + 1]]] : paires, []));

const CHEMIN_TCGDEX = args.tcgdex;
const SORTIE = args.sortie ?? 'donnees';

// ------------------------------------------- les visuels que tu déposes ---
//
// Certaines cartes n'ont de visuel français chez personne : les extensions
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
  // Une même carte peut avoir deux fichiers : un .webp récolté et un .png
  // téléversé depuis l'administration. Sans règle, celui qui l'emporte
  // dépendrait de l'ordre dans lequel le système rend les fichiers, qui n'est
  // pas garanti. On tranche par l'ordre d'EXTENSIONS_IMAGE, qui est écrit.
  const rang = fichier => EXTENSIONS_IMAGE.indexOf(fichier.slice(fichier.lastIndexOf('.')).toLowerCase());
  for(const fichier of fichiers.slice().sort()){
    const point = fichier.lastIndexOf('.');
    if(point < 0) continue;
    if(rang(fichier) < 0) continue;
    const nom = fichier.slice(0, point);
    const deja = parCarte.get(nom);
    if(deja && rang(deja.split('/').pop()) <= rang(fichier)) continue;
    parCarte.set(nom, `${DOSSIER_VISUELS}/${fichier}`);
  }
  return parCarte;
}

// « Cette carte a-t-elle déjà un visuel chez nous ? », quelle que soit
// l'extension du fichier. Demander « existe-t-il un .webp ? » laisserait
// retélécharger une carte dont on a déjà le .png.
function aDejaUnVisuel(id){
  return EXTENSIONS_IMAGE.some(ext => existsSync(`${DOSSIER_VISUELS}/${id}${ext}`));
}

// Le zoom réclame une définition supérieure, rangée sous « <carte>-hd ». La
// distinction se fait ici, une fois : ailleurs, on se contente de demander
// la vignette et la haute définition d'une carte.
const SUFFIXE_HD = '-hd';
function trierVisuels(parCarte){
  const vignettes = new Map(), hautes = new Map();
  for(const [nom, chemin] of parCarte){
    if(nom.endsWith(SUFFIXE_HD)) hautes.set(nom.slice(0, -SUFFIXE_HD.length), chemin);
    else vignettes.set(nom, chemin);
  }
  return { vignettes, hautes };
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

// La catégorie d'une carte, d'après TCGdex. Rien pour un Pokémon : neuf
// cartes sur dix, inutile d'alourdir chaque fichier d'un champ évident,
// sinon « dresseur » ou « energie », et la famille : supporter, objet,
// outil, stade ; énergie de base ou spéciale. La page « Par Pokémon » s'en
// sert pour chercher aussi les dresseurs, les objets et les énergies.
const FAMILLES_CHOISIES = ['supporter', 'objet', 'outil', 'stade'];
const FAMILLES_DRESSEUR = {
  'Supporter': 'supporter', 'Item': 'objet', 'Tool': 'outil', 'Stadium': 'stade',
  'Technical Machine': 'objet', "Rocket's Secret Machine": 'objet',
};
// TCGdex ne donne pas la famille des cartes Dresseur les plus anciennes :
// à l'époque, elles portaient toutes la seule mention « Dresseur ». Leur
// texte la trahit pourtant : un Stade « reste en jeu », un Outil « s'attache »
// à un Pokémon et le dit. Le reste compte officiellement comme un Objet :
// c'est la règle depuis 2011, quand la mention « Objet » est apparue, mais
// on ne l'applique qu'aux cartes d'avant cette date : sur une carte récente,
// une famille absente est un oubli de la source, pas une ancienne carte.
const ARRIVEE_DE_LA_MENTION_OBJET = '2011-04-25';
function familleDuTexte(source, dateSortie){
  const bloc = source.match(/effect:\s*\{([\s\S]*?)\n\t\}/);
  const texte = bloc ? bloc[1] : '';
  if(/Stadium card|carte Stade|stays in play when you play it|reste en jeu/i.test(texte)) return 'stade';
  if(/Pokémon Tool|Outil Pokémon/i.test(texte) && /\battach/i.test(texte)) return 'outil';
  if(/\bSupporter\b/i.test(texte)) return 'supporter';
  if(texte && dateSortie && String(dateSortie) < ARRIVEE_DE_LA_MENTION_OBJET) return 'objet';
  return null;
}

// Les cartes dont la famille a été déduite de leur texte : face à une carte
// du même nom que TCGdex classe lui-même, c'est TCGdex qui l'emporte.
const famillesDeduites = new WeakSet();

function categorieDeCarte(source, dateSortie = null){
  const categorie = champTexte(source, 'category');
  if(categorie === 'Trainer'){
    const donnee = FAMILLES_DRESSEUR[champTexte(source, 'trainerType')];
    if(donnee) return { categorie: 'dresseur', famille: donnee };
    const deduite = familleDuTexte(source, dateSortie);
    return deduite ? { categorie: 'dresseur', famille: deduite, deduite: true } : { categorie: 'dresseur' };
  }
  if(categorie === 'Energy')
    return { categorie: 'energie', famille: champTexte(source, 'energyType') === 'Special' ? 'speciale' : 'base' };
  return {};
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
  // Et la catégorie de leurs cartes, que l'autre source ne donne pas, ainsi
  // que leurs noms officiels dans les deux langues.
  const categoriesPocket = new Map();
  const nomsPocket = new Map();

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
      // ailleurs et plus à jour. On ne garde pas leurs cartes : l'instantané
      // physique en serait alourdi d'un millier que le site n'y montre
      // jamais, mais on note lesquelles il connaît : ses visuels, eux, sont
      // en français, là où l'autre source n'héberge que l'anglais.
      if(/^[A-Z]\d/.test(setId) || /^P-[A-Z]$/.test(setId)){
        pocketChezTcgdex.add(setId);
        const dossier = path.join(racine, serie.name, ext.name);
        if(existsSync(dossier)){
          for(const fichier of (await readdir(dossier)).filter(f => f.endsWith('.ts'))){
            const numero = parseInt(fichier, 10);
            if(!Number.isFinite(numero)) continue;
            const source = await readFile(path.join(dossier, fichier), 'utf8');
            const id = `${setId}-${String(numero).padStart(3, '0')}`;
            const categorie = categorieDeCarte(source);
            if(categorie.categorie) categoriesPocket.set(id, categorie);
            const nom = nomTraduit(source);
            if(nom.fr && nom.en) nomsPocket.set(id, nom);
          }
        }
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
        serieId,
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
        const { deduite, ...categorie } = categorieDeCarte(source, champTexte(sourceSet, 'releaseDate'));
        const carte = {
          id: `${setId}-${localId}`,
          localId,
          name: nom.fr || nom.en || localId,
          rarity: rarete ? (raretesFr[rarete] ?? rarete) : null,
          dexId: premierDexId(source),
          ...categorie,
          image: `${base('fr')}/${localId}/low.webp`,
          imageHaute: `${base('fr')}/${localId}/high.webp`,
          // Toutes les cartes n'ont pas de visuel français : l'anglais prend
          // le relais avant le point d'interrogation.
          imageSecours: `${base('en')}/${localId}/low.webp`,
        };
        if(deduite) famillesDeduites.add(carte);
        cartes.push(carte);
      }
      cartes.sort((a, b) => a.localId.localeCompare(b.localId, undefined, { numeric: true }));
      cartesParSet.set(setId, cartes);
    }
  }

  extensions.sort((a, b) => String(a.dateSortie ?? '').localeCompare(String(b.dateSortie ?? '')));
  return { extensions, cartesParSet, traductions, pocketChezTcgdex, categoriesPocket, nomsPocket };
}

// -------------------------------------------------------------- Pocket ---
//
// Les données de l'application viennent du jeu de flibustier, sous licence
// MIT. On garde la convention d'identifiants de TCGdex : trois chiffres,
// « P-A » plutôt que « PROMO-A » : pour que les marquages déjà posés par les
// membres restent attachés à leurs cartes.

const POCKET_BASE = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist';
const POCKET_IMAGES = 'https://cdn.jsdelivr.net/gh/flibustier/pokemon-tcg-exchange@main/public/images/cards-by-set';
const POCKET_IMAGES_SECOURS = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-exchange/main/public/images/cards-by-set';

// Les logos d'extension, eux, existent par langue : contrairement aux
// visuels de cartes, dont il n'y a qu'une seule version. Le catalogue Pocket
// affichait un point d'interrogation à leur place faute de les avoir
// cherchés là.
//
// La graphie du fichier varie (« A2a » ou « A2A » selon les extensions) et
// toutes n'ont pas de version française. Plutôt que de figer une liste qui
// vieillirait, on essaie les combinaisons et on garde la première qui
// répond : le jour où une traduction est ajoutée, la construction suivante
// la prend d'elle-même.
const POCKET_LOGOS = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-exchange/main/public/images/sets';

async function existe(adresse){
  try{
    const r = await fetch(adresse, { method: 'HEAD', headers: IDENTITE });
    return r.ok;
  }catch(err){
    return false;
  }
}

async function logoPocket(code){
  for(const langue of ['fr_FR', 'en_US']){
    for(const graphie of new Set([code, code.toUpperCase()])){
      const adresse = `${POCKET_LOGOS}/LOGO_expansion_${graphie}_${langue}.webp`;
      if(await existe(adresse)) return { adresse, francais: langue === 'fr_FR' };
    }
  }
  return null;
}

// « PROMO-A » chez la source, « P-A » chez nous. La règle vaut pour toute
// lettre : le jour où une série C paraîtra, sa promo suivra sans qu'on ait
// à revenir ici.
const idLocal = code => String(code).replace(/^PROMO-([A-Z])$/, 'P-$1');

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

// Le 5 octobre 2026, la source a publié ses fichiers « français » remplis de
// noms anglais : Bulbizarre est devenu Bulbasaur, et les trois quarts des
// cartes ont perdu leur Pokémon. Le site ne doit plus dépendre d'un tel faux
// pas. On retient donc le dernier nom français connu de chaque carte, avec
// son nom anglais pour contrôle (si la source renumérotait une extension,
// le nom anglais ne correspondrait plus et le souvenir serait écarté).
//
// Pour chaque carte, dans l'ordre :
//   1. le nom officiel de TCGdex, quand il connaît l'extension ;
//   2. celui du fichier français de la source, s'il est vraiment français ;
//   3. le souvenir ;
//   4. à défaut, la traduction automatique : signalée au visiteur.
const MEMOIRE_NOMS_POCKET = 'noms-pocket-fr.json';

// Un nom français, d'où qu'il vienne, doit désigner le même Pokémon que le
// nom anglais : en octobre 2026, TCGdex donnait « Amonita » à la carte
// anglaise « Mantyke » (Babimanta), et la promo « Mega Sceptile ex » était
// retenue sous le nom de « Feunnec ». La table des noms d'espèces de PokeAPI
// (données ouvertes, toutes langues) permet de le vérifier ; un nom qui ne
// désigne pas d'espèce (un Dresseur, un Objet) passe sans contrôle.
const ESPECES = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
const formeEspece = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function chargerEspeces(){
  try{
    const r = await fetch(ESPECES);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const parEn = new Map(), parFr = new Map();
    for(const ligne of (await r.text()).split('\n').slice(1)){
      const [n, langue, nom] = ligne.split(',');
      if(langue === '9') parEn.set(formeEspece(nom), Number(n));
      if(langue === '5') parFr.set(formeEspece(nom), Number(n));
    }
    if(parEn.size < 1000 || parFr.size < 1000) throw new Error('table incomplète');
    return { parEn, parFr };
  }catch(err){
    console.log(`  Table des espèces indisponible (${err.message}) : noms français non contrôlés`);
    return null;
  }
}

// L'espèce nommée dans un nom de carte : le plus long groupe de mots connu.
function especeNommee(nom, table){
  const mots = formeEspece(nom).split(' ');
  for(let l = 3; l >= 1; l--){
    for(let i = 0; i + l <= mots.length; i++){
      const n = table.get(mots.slice(i, i + l).join(' '));
      if(n) return n;
    }
  }
  return null;
}

function memePokemon(especes, anglais, francais){
  if(!especes || !francais) return Boolean(francais);
  const a = especeNommee(anglais, especes.parEn), b = especeNommee(francais, especes.parFr);
  return !(a && b && a !== b);
}
const apostrophes = nom => String(nom ?? '').replace(/[\u2018\u2019]/g, "'").trim();

async function lireMemoireNoms(){
  try{
    const { noms } = JSON.parse(await readFile(path.join('donnees', MEMOIRE_NOMS_POCKET), 'utf8'));
    return new Map(Object.entries(noms ?? {}));
  }catch{ return new Map(); }
}

async function ecrireMemoireNoms(memoire){
  const noms = Object.fromEntries([...memoire].sort(([a], [b]) => a.localeCompare(b)));
  await ecrire(SORTIE, MEMOIRE_NOMS_POCKET, {
    note: "Le dernier nom français connu de chaque carte de l'application, avec son nom anglais pour contrôle. "
      + "La source des cartes Pocket a perdu ses traductions le 5 octobre 2026 ; outils/instantane.mjs s'en sert "
      + "quand elle en manque, et la tient à jour à chaque passage.",
    noms,
  });
}

// La source de l'application traduit ses fichiers avec un temps de retard :
// la dernière extension parue n'existe qu'en anglais. Plutôt que de l'afficher
// telle quelle sur un site français, on traduit ce qu'on peut grâce au
// dictionnaire tiré des cartes physiques : le suffixe « ex » se recolle après
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

  // « Mega Sceptile ex » se dit « Méga-Jungko-ex », convention des cartes
  // de l'application déjà traduites ; « Mega Charizard X ex » donne
  // « Méga-Dracaufeu-X-ex ».
  const mega = base.match(/^Mega\s+(.+?)(?:\s+([XY]))?$/);
  if(mega){
    const pokemon = traductions.get(mega[1]) ?? (nomsFrancais.has(mega[1]) ? mega[1] : null);
    if(pokemon) return recoller(`Méga-${pokemon}${mega[2] ? `-${mega[2]}` : ''}`);
  }

  // « Team Rocket's Persian ex » se dit « Persian-ex de la Team Rocket » :
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

// Les extensions se suivent par date à l'intérieur d'une série, mais les
// promos passent devant : ce sont les cartes hors-boosters de la série, et
// les voir en tête fait comprendre d'un coup d'œil à quelle série elles
// appartiennent. Le tri porte sur trois critères, du plus général au plus
// fin : la série, puis le caractère promotionnel, puis la date.
//
// C'est une fonction plutôt qu'un tri écrit sur place, parce qu'il faut le
// rejouer après avoir fusionné les extensions saisies à la main.
function trierExtensionsPocket(extensions){
  const estPromo = e => /^P-/.test(e.id);
  extensions.sort((a, b) =>
    String(a.serieNom ?? '').localeCompare(String(b.serieNom ?? ''))
    || (estPromo(b) - estPromo(a))
    || String(a.dateSortie ?? '').localeCompare(String(b.dateSortie ?? '')));
  return extensions;
}

async function construirePocket(traductions = new Map(), nomsFrancais = new Set(), chezTcgdex = new Set(),
                                categories = new Map(), nomsTcgdex = new Map()){
  const parSerie = await telecharger(`${POCKET_BASE}/sets.json`);
  const memoire = await lireMemoireNoms();
  const especes = await chargerEspeces();
  let rejetes = 0;
  // Les noms des cartes de l'application que TCGdex connaît enrichissent le
  // dictionnaire : « Copycat » s'y dit « Copieuse », ce que les cartes
  // physiques n'apprennent pas.
  // La mémoire aussi : une extension de réimpressions, comme les boosters
  // de luxe, reprend des cartes dont on connaît déjà le nom français.
  const nomsDeLApplication = new Map();
  for(const [en, fr] of memoire.values()) if(memePokemon(especes, en, fr)) nomsDeLApplication.set(apostrophes(en), fr);
  for(const { en, fr } of nomsTcgdex.values()) if(memePokemon(especes, en, fr)) nomsDeLApplication.set(apostrophes(en), fr);
  const dictionnaire = new Map([...traductions, ...nomsDeLApplication]);

  const extensions = [];
  for(const [lettre, liste] of Object.entries(parSerie)){
    for(const s of liste){
      const logo = await logoPocket(s.code);
      extensions.push({
        id: idLocal(s.code),
        codeDistant: s.code,
        name: s.name?.fr || s.name?.en || s.code,
        cardCount: { official: s.count ?? null },
        logo: logo?.adresse ?? null,
        symbol: null,                      // cette source n'a pas de symbole
        serieNom: `Série ${lettre}`,
        dateSortie: s.releaseDate ?? null,
      });
    }
  }
  trierExtensionsPocket(extensions);

  const cartesParSet = new Map();
  for(const ext of extensions){
    // Le fichier anglais fait foi pour la liste des cartes et sert de
    // contrôle ; le fichier français, quand il existe, n'apporte que les
    // noms, et seulement s'il est vraiment en français : celui d'octobre
    // 2026 répétait l'anglais mot pour mot.
    const code = encodeURIComponent(ext.codeDistant);
    let brutes = [];
    try{ brutes = aplatir(await telecharger(`${POCKET_BASE}/cards/${code}.min.json`)); }catch(err){ /* vide */ }
    const anglaisLu = brutes.length > 0;
    let enFrancaisSource = new Map();
    try{
      const fr = aplatir(await telecharger(`${POCKET_BASE}/cards/fr/${code}.min.json`));
      const anglais = new Map(brutes.map(c => [c.number, c.name]));
      const identiques = fr.filter(c => anglais.get(c.number) === c.name).length;
      if(fr.length && identiques <= fr.length * 0.6) enFrancaisSource = new Map(fr.map(c => [c.number, c.name]));
      else if(fr.length) console.log(`  ${ext.id} : le fichier français de la source est en anglais, on s'en passe`);
      if(!brutes.length) brutes = fr;
    }catch(err){ /* pas de fichier français */ }
    if(brutes.length === 0) console.warn(`  ! aucune carte pour ${ext.id}`);
    let traduites = 0, officiels = 0, deLaSource = 0, souvenirs = 0, reprises = 0;
    const enFrancais = chezTcgdex.has(ext.id);
    // Le site le dira : pour ces extensions, aucune source ne propose le
    // visuel français, donc le texte imprimé sur la carte reste en anglais.
    if(!enFrancais) ext.visuelsAnglais = true;
    const cartes = brutes.slice().sort((a, b) => a.number - b.number).map(c => {
      const numero = String(c.number).padStart(3, '0');
      const id = `${ext.id}-${numero}`;
      const anglais = c.name;
      const tcgdex = nomsTcgdex.get(id);
      const souvenir = memoire.get(id);
      // Chaque source proposée n'est retenue que si elle nomme le même
      // Pokémon que l'anglais ; sinon on passe à la suivante.
      const verifie = fr => {
        if(!fr) return false;
        if(memePokemon(especes, anglais, fr)) return true;
        rejetes++;
        console.log(`  ${id} : « ${fr} » écarté, ce n'est pas le Pokémon de « ${anglais} »`);
        return false;
      };
      let nom, sur = false;
      if(tcgdex && apostrophes(tcgdex.en) === apostrophes(anglais) && verifie(tcgdex.fr)){ nom = tcgdex.fr; officiels++; sur = true; }
      else if(enFrancaisSource.has(c.number) && verifie(enFrancaisSource.get(c.number))){ nom = enFrancaisSource.get(c.number); deLaSource++; sur = true; }
      else if(souvenir && apostrophes(souvenir[0]) === apostrophes(anglais) && verifie(souvenir[1])){ nom = souvenir[1]; souvenirs++; }
      // Une réimpression : une carte de l'application portait déjà ce nom
      // anglais, son nom français est connu.
      else if(nomsDeLApplication.has(apostrophes(anglais))){ nom = nomsDeLApplication.get(apostrophes(anglais)); reprises++; }
      else{
        nom = traduireNom(anglais, dictionnaire, nomsFrancais);
        if(nom === anglais) nom = traduireNom(apostrophes(anglais), dictionnaire, nomsFrancais);
        if(nom !== anglais) traduites++;
      }
      // Un nom sûr rejoint la mémoire ; une traduction automatique, jamais :
      // ni un nom dont on n'a pas lu la version anglaise pour contrôle. Un
      // souvenir démenti par le contrôle en sort.
      if(anglaisLu && sur) memoire.set(id, [anglais, nom]);
      else if(souvenir && !memePokemon(especes, souvenir[0], souvenir[1])) memoire.delete(id);
      // La catégorie vient de TCGdex quand il connaît l'extension ; sinon, le
      // nom du fichier image dit au moins si c'est une carte Dresseur
      // (« cTR_… ») : sa famille se déduira des cartes du même nom.
      const categorie = categories.get(id)
        ?? (/^cTR_/.test(String(c.image ?? '')) ? { categorie: 'dresseur' } : {});
      return {
      id,
      localId: String(c.number),
      name: nom,
      rarity: RARETES_POCKET[c.rarity] ?? null,
      dexId: null,                     // absent de cette source, déduit ensuite
      ...categorie,
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
    // Les cartes qui n'ont reçu ni nom sûr ni souvenir : le site le dira au
    // visiteur, ces noms-là sont une reconstruction, pas les noms officiels.
    const sansNomSur = cartes.length - officiels - deLaSource - souvenirs - reprises;
    if(sansNomSur > 0){
      console.log(`  ${ext.id} : ${officiels} noms TCGdex, ${souvenirs} retrouvés en mémoire, ` +
        `${reprises} réimpressions, ${traduites}/${sansNomSur} traduits automatiquement`);
      ext.traductionAutomatique = { traduits: traduites, total: cartes.length };
    }
    cartesParSet.set(ext.id, cartes);
    delete ext.codeDistant;
  }
  await ecrireMemoireNoms(memoire);
  if(rejetes) console.log(`  ${rejetes} nom(s) français écarté(s) par le contrôle des espèces`);
  return { extensions, cartesParSet };
}


// ------------------------------- récolte des visuels français manquants ---
//
// Huit extensions Pocket n'ont, chez les sources d'origine, que des visuels
// anglais. Le navigateur qui affiche le site ne peut pas aller les chercher
// ailleurs : un navigateur refuse par sécurité d'aller lire un autre site que
// le sien. Cette construction-ci, elle, tourne sur un serveur : cette règle
// ne s'y applique pas, donc c'est ici, et seulement ici, que la récolte peut
// se faire.
//
// Les adresses à essayer sont listées dans outils/sources-visuels.json et
// aucune n'est allumée tant que la sonde n'a pas prouvé qu'elle rend bien une
// image DIFFÉRENTE de l'anglaise. La vérification est refaite ici à chaque
// construction, sur deux cartes par extension : le jour où une source se met
// à resservir l'anglais sous une adresse française, on ne la suit pas.

// Beaucoup de sites refusent sèchement une requête sans identité. On se
// présente donc, honnêtement : le nom du projet et son adresse, pour que
// l'administrateur d'en face sache qui l'interroge et puisse nous écrire.
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (+https://github.com/Mrv-972/Collection-Pokemon)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

const SOURCES_VISUELS = 'outils/sources-visuels.json';
const codeDistant = id => String(id).replace(/^P-([A-Z])$/, 'PROMO-$1');

function nomPromoWiki(id){
  const m = String(id).match(/^P-([A-Z])$/);
  if(!m) return null;
  return m[1] === 'A' ? 'PROMO' : `PROMO${m[1]}`;
}

function gabarit(texte, { set, numero }){
  return texte
    .replaceAll('{SETDIST}', codeDistant(set))
    .replaceAll('{PROMO}', nomPromoWiki(set) ?? set)
    .replaceAll('{SETMAJ}', set.toUpperCase())
    .replaceAll('{SET}', set)
    .replaceAll('{NUM3}', String(numero).padStart(3, '0'))
    .replaceAll('{NUM}', String(numero));
}

// Une adresse peut porter sa langue dans son nom : « B3_001_EN_SM.webp ».
// Quand elle le fait et que ce n'est pas le français, inutile d'aller plus
// loin : l'illustration sera la même qu'aujourd'hui, en plus petit.
function marqueurDeLangue(adresse){
  const m = String(adresse).match(/[_\-\/](en|en_US|english|ja|jp|zh|ko|de|es|it|pt|fr|fr_FR|french)[_\-\.\/]/i);
  return m ? m[1].toLowerCase() : null;
}
const francaisPlausible = adresse => {
  const l = marqueurDeLangue(adresse);
  return l === null || l === 'fr' || l === 'fr_fr' || l === 'french';
};

async function empreinteDe(adresse){
  try{
    const r = await fetch(adresse, { redirect: 'follow', headers: IDENTITE });
    if(!r.ok) return null;
    const type = r.headers.get('content-type') ?? '';
    if(!/image\//.test(type)) return null;
    const octets = Buffer.from(await r.arrayBuffer());
    return createHash('sha1').update(octets).digest('hex');
  }catch(err){
    return null;
  }
}

// Une source qui rend le fichier anglais sous une adresse française ne nous
// apporte rien. On le vérifie avant d'adopter la source pour l'extension.
async function vraimentFrancais(adresses, cartes){
  let verifiees = 0;
  for(const carte of cartes){
    const candidate = adresses.get(String(carte.localId));
    if(!candidate) continue;
    const [neuf, ancien] = await Promise.all([
      empreinteDe(candidate),
      empreinteDe(carte.imageSecours ?? carte.image),
    ]);
    if(!neuf) continue;
    if(ancien && neuf === ancien) return false;   // c'est la même image
    if(++verifiees >= 2) return true;
  }
  return verifiees > 0;
}

// Parcours en petits paquets : 1300 requêtes une par une seraient
// interminables, et toutes d'un coup se feraient jeter par le serveur d'en
// face.
async function parPaquets(elements, taille, travail){
  const resultats = [];
  for(let i = 0; i < elements.length; i += taille){
    resultats.push(...await Promise.all(elements.slice(i, i + taille).map(travail)));
  }
  return resultats;
}

async function adressesDepuisMotif(source, ext, cartes){
  const trouvees = new Map();
  await parPaquets(cartes, 12, async carte => {
    const adresse = gabarit(source.motif, { set: ext.id, numero: carte.localId });
    if(!francaisPlausible(adresse)) return;
    if(await existe(adresse)) trouvees.set(String(carte.localId), adresse);
  });
  return trouvees;
}

async function adressesDepuisPage(source, ext){
  const trouvees = new Map();
  try{
    const r = await fetch(gabarit(source.page, { set: ext.id, numero: 1 }), { redirect: 'follow', headers: IDENTITE });
    if(!r.ok) return trouvees;
    const texte = await r.text();
    const motif = new RegExp(gabarit(source.motifImage, { set: ext.id, numero: 1 }), 'g');
    for(const m of texte.matchAll(motif)){
      if(francaisPlausible(m[0])) trouvees.set(String(Number(m[1])), m[0]);
    }
  }catch(err){ /* source muette : on passera à la suivante */ }
  return trouvees;
}

async function recolterVisuelsFrancais(pocket){
  let config;
  try{
    config = JSON.parse(await readFile(SOURCES_VISUELS, 'utf8'));
  }catch(err){
    return;                                   // pas de liste, pas de récolte
  }
  const sources = (config.candidats ?? []).filter(s => s.actif);
  if(!sources.length) return;

  await mkdir(DOSSIER_VISUELS, { recursive: true });
  console.log(`Récolte des visuels français manquants : ${sources.length} source(s) allumée(s)…`);

  for(const ext of pocket.extensions){
    // On ne se fie plus au drapeau « visuelsAnglais » pour savoir où chercher.
    // Il disait qu'une extension était présente chez TCGdex parce que leur
    // dépôt de données la contient : ce qui ne garantit pas que leur serveur
    // d'images héberge la version française. Six extensions étaient dans ce
    // cas : données là, visuels absents, et le site retombait sur l'anglais
    // sans que rien ne le signale.
    //
    // Le seul critère fiable est donc : cette carte a-t-elle un visuel chez
    // nous, oui ou non. Les extensions déjà complètes sont écartées
    // immédiatement, sans une seule requête.
    const toutes = pocket.cartesParSet.get(ext.id) ?? [];
    const cartes = toutes.filter(c => !aDejaUnVisuel(c.id));
    if(!cartes.length) continue;

    for(const source of sources){
      const adresses = source.genre === 'page'
        ? await adressesDepuisPage(source, ext)
        : await adressesDepuisMotif(source, ext, cartes);
      if(!adresses.size) continue;

      if(!await vraimentFrancais(adresses, cartes)){
        console.log(`  ${ext.id} : ${source.nom} resert le visuel anglais : écartée`);
        continue;
      }

      // On télécharge, on ne pointe pas. Pointer reviendrait à faire payer
      // le trafic de ce site à celui qui héberge la source, à chaque page
      // ouverte par un visiteur. Une fois copié chez nous, le fichier ne
      // leur coûte plus rien, et le site ne dépend plus de leur serveur.
      // Les fichiers déjà présents ne sont pas redemandés : la construction
      // de demain ne repassera pas la commande d'aujourd'hui.
      let pris = 0, deja = 0, manques = 0;
      await parPaquets(cartes, 6, async carte => {
        const adresse = adresses.get(String(carte.localId));
        if(!adresse){ manques++; return; }
        const fichier = `${DOSSIER_VISUELS}/${carte.id}.webp`;
        if(aDejaUnVisuel(carte.id)){ deja++; return; }
        try{
          const r = await fetch(adresse, { redirect: 'follow', headers: IDENTITE });
          if(!r.ok){ manques++; return; }
          await writeFile(fichier, Buffer.from(await r.arrayBuffer()));
          pris++;
        }catch(err){ manques++; }
      });

      console.log(`  ${ext.id} : ${pris} visuels téléchargés, ${deja} déjà là, ${manques} introuvables (${source.nom})`);
      if(!manques) break;   // rien ne manque plus : sources suivantes inutiles
    }
  }
}

// --------------------- absorber les corrections de l'administration ------
//
// L'espace d'administration enregistre ses corrections dans Supabase, d'où
// le site les lit aussitôt : l'effet est immédiat. Mais Supabase n'est qu'une
// zone de dépôt : laisser les corrections y vivre pour toujours rendrait le
// site dépendant d'un service extérieur, ce qu'on a passé la journée à
// défaire pour 3863 cartes.
//
// La construction les inscrit donc dans les fichiers du dépôt. Une fois
// absorbée, la correction s'applique sur une donnée déjà identique : elle ne
// change plus rien, et l'espace d'administration propose de la supprimer.
//
// On ne la supprime PAS ici. Effacer depuis la construction demanderait une
// clé d'écriture, donc un secret dans le dépôt ; et surtout, une correction
// effacée trop tôt : parce que la construction a échoué après l'avoir lue :
// disparaîtrait de l'écran sans prévenir. C'est à toi de retirer ce que la
// page indique comme absorbé.

async function coordonneesSupabase(){
  const config = await readFile('supabase-config.js', 'utf8');
  const url = config.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1];
  const cle = config.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/)?.[1];
  return url && cle && !url.includes('REMPLACER') ? { url, cle } : null;
}

async function lireCorrections(){
  const coord = await coordonneesSupabase();
  if(!coord) return [];
  const r = await fetch(
    `${coord.url}/rest/v1/corrections?select=univers,genre,cible,donnees,image_chemin`,
    { headers: { apikey: coord.cle, Authorization: `Bearer ${coord.cle}` } }
  );
  if(!r.ok) throw new Error(`corrections → HTTP ${r.status}`);
  return { lignes: await r.json(), base: coord.url };
}

async function absorberCorrections(lots){
  let paquet;
  try{
    paquet = await lireCorrections();
  }catch(err){
    // Une correction non absorbée reste affichée par le site, qui la lit
    // directement. Rien n'est perdu : on réessaiera demain.
    console.log(`Corrections : lecture impossible (${err.message}) : on réessaiera`);
    return;
  }
  const lignes = paquet.lignes ?? [];
  if(!lignes.length){ console.log('Corrections : aucune en attente'); return; }

  await mkdir(DOSSIER_VISUELS, { recursive: true });
  let visuels = 0, champs = 0, ignorees = 0;

  for(const c of lignes){
    const lot = lots[c.univers];
    if(!lot){ ignorees++; continue; }

    // Un logo d'extension remplacé à la main : il rejoint le dépôt, comme
    // les visuels de carte, et l'instantané pointe dessus. Sans cela, le
    // site continuerait de le lire depuis Supabase indéfiniment.
    if(c.genre === 'logo-extension'){
      if(!c.image_chemin){ ignorees++; continue; }
      const ext = lot.extensions.find(e => e.id === c.cible);
      if(!ext){ ignorees++; continue; }
      const suffixe = path.extname(c.image_chemin).toLowerCase();
      const nom = `${c.cible}${EXTENSIONS_IMAGE.includes(suffixe) ? suffixe : '.png'}`;
      const fichier = `${DOSSIER_LOGOS}/${nom}`;
      if(!existsSync(fichier)){
        try{
          const r = await fetch(`${paquet.base}/storage/v1/object/public/corrections/${c.image_chemin}`);
          if(r.ok){
            await mkdir(DOSSIER_LOGOS, { recursive: true });
            await writeFile(fichier, Buffer.from(await r.arrayBuffer()));
            visuels++;
          }
        }catch(err){ /* on réessaiera demain */ }
      }
      if(existsSync(fichier)) ext.logo = fichier;
      continue;
    }

    // Le logo d'une série reste servi depuis Supabase : une série n'a pas
    // de fiche dans l'instantané où inscrire son visuel. Sa correction ne
    // sera donc jamais « absorbée », et c'est normal.
    if(c.genre === 'logo-serie'){ ignorees++; continue; }

    // Le visuel d'abord : il vaut pour les trois genres de correction, une
    // carte ajoutée pouvant arriver avec le sien.
    if(c.image_chemin && c.genre !== 'extension'){
      const extension = path.extname(c.image_chemin).toLowerCase();
      const fichier = `${DOSSIER_VISUELS}/${c.cible}${EXTENSIONS_IMAGE.includes(extension) ? extension : '.webp'}`;
      if(!existsSync(fichier)){
        try{
          const r = await fetch(`${paquet.base}/storage/v1/object/public/corrections/${c.image_chemin}`);
          if(r.ok){
            await writeFile(fichier, Buffer.from(await r.arrayBuffer()));
            visuels++;
          }
        }catch(err){ /* on réessaiera */ }
      }
    }

    if(c.genre === 'extension'){
      const ext = lot.extensions.find(e => e.id === c.cible);
      if(ext){
        for(const champ of ['name', 'serieNom', 'dateSortie']){
          if(c.donnees?.[champ]){ ext[champ] = c.donnees[champ]; champs++; }
        }
      }else if(c.donnees?.name){
        lot.extensions.push({
          id: c.cible,
          name: c.donnees.name,
          cardCount: { official: c.donnees.cardCount ?? null },
          logo: null,
          symbol: null,
          serieNom: c.donnees.serieNom ?? 'Autres',
          dateSortie: c.donnees.dateSortie ?? null,
          saisieManuelle: true,
        });
        lot.cartesParSet.set(c.cible, lot.cartesParSet.get(c.cible) ?? []);
        champs++;
      }
      continue;
    }

    const setId = c.cible.replace(/-\d+$/, '');
    const cartes = lot.cartesParSet.get(setId);
    if(!cartes){ ignorees++; continue; }

    let carte = cartes.find(x => x.id === c.cible);
    if(!carte && c.genre === 'carte' && c.donnees?.ajout && c.donnees?.name){
      carte = {
        id: c.cible,
        localId: String(c.donnees.localId ?? Number(c.cible.split('-').pop())),
        name: c.donnees.name,
        rarity: c.donnees.rarity ?? null,
        dexId: c.donnees.dexId ?? null,
        image: null, imageHaute: null, imageSecours: null,
      };
      cartes.push(carte);
      cartes.sort((a, b) => Number(a.localId) - Number(b.localId));
      champs++;
    }
    if(!carte){ ignorees++; continue; }

    if(c.genre === 'carte'){
      for(const champ of ['name', 'rarity', 'dexId']){
        if(c.donnees?.[champ] !== undefined && c.donnees[champ] !== null){
          carte[champ] = c.donnees[champ];
          champs++;
        }
      }
      // La famille d'une carte Dresseur, choisie par l'administrateur pour
      // une carte que les sources ne classent pas encore.
      if(FAMILLES_CHOISIES.includes(c.donnees?.famille)){
        carte.categorie = 'dresseur';
        carte.famille = c.donnees.famille;
        champs++;
      }
    }
  }

  console.log(`Corrections : ${lignes.length} lue(s) : ${visuels} visuel(s) copié(s), ${champs} champ(s) appliqué(s), ${ignorees} sans cible`);
  console.log('  Elles restent dans Supabase : leur suppression se fait depuis le tiroir d\'administration (bouton « Corrections »), une fois marquées « absorbée ».');
}

// ------------------------- les extensions saisies à la main --------------
//
// Filet de sécurité, pas outil du quotidien. Quand une extension paraît et
// qu'aucune source ne la publie encore, il faut bien pouvoir la déclarer :
// sans page d'extension, les visuels qu'on déposerait n'auraient nulle part
// où s'afficher.
//
// Deux règles gouvernent cette fusion, et elles vont dans le même sens :
//
//   1. Les sources automatiques l'emportent. Une extension saisie ici
//      disparaît d'elle-même dès qu'une source la publie, sinon une saisie
//      d'aujourd'hui, forcément incomplète, figerait le catalogue et
//      empêcherait la vraie donnée d'arriver demain.
//
//   2. Une saisie mal formée arrête la construction. Le jeu de données
//      publié la veille reste alors en place, et l'erreur est visible dans
//      l'onglet Actions. C'est préférable à un catalogue à moitié valide
//      que personne ne remarquerait.

const EXTENSIONS_MANUELLES = 'extensions-manuelles.json';

function refuser(quoi, pourquoi){
  throw new Error(
    `${EXTENSIONS_MANUELLES} : ${quoi} : ${pourquoi}\n` +
    `  Rien n'a été publié ; l'instantané de la veille reste en place.`
  );
}

function verifierSaisie(ext, rang){
  const ou = ext?.id ? `extension « ${ext.id} »` : `extension n°${rang + 1}`;
  if(!ext || typeof ext !== 'object') refuser(ou, 'ce n\'est pas une fiche');
  if(!/^[A-Za-z0-9-]+$/.test(String(ext.id ?? ''))) {
    refuser(ou, 'il manque un « id », ou il contient autre chose que des lettres, chiffres et tirets');
  }
  if(!String(ext.name ?? '').trim()) refuser(ou, 'il manque le « name », le nom affiché de l\'extension');
  if(!String(ext.serieNom ?? '').trim()) refuser(ou, 'il manque la « serieNom », par exemple « Série B »');
  if(!Array.isArray(ext.cartes)) refuser(ou, 'il manque la liste « cartes » (un tableau, même vide)');

  const vus = new Set();
  for(const c of ext.cartes){
    const numero = String(c?.localId ?? '').trim();
    if(!/^\d+$/.test(numero)) refuser(ou, `une carte a un « localId » absent ou non numérique (« ${c?.localId} »)`);
    if(vus.has(numero)) refuser(ou, `deux cartes portent le numéro ${numero}`);
    vus.add(numero);
    if(!String(c?.name ?? '').trim()) refuser(ou, `la carte ${numero} n'a pas de « name »`);
  }
}

async function fusionnerExtensionsManuelles(pocket, dexDuNomDeCarte){
  let saisies;
  try{
    saisies = JSON.parse(await readFile(EXTENSIONS_MANUELLES, 'utf8'));
  }catch(err){
    if(err.code === 'ENOENT') return;           // pas de fichier, rien à faire
    refuser('lecture', `le fichier n'est pas du JSON valide (${err.message})`);
  }
  if(!Array.isArray(saisies)) refuser('lecture', 'le fichier doit contenir un tableau [ … ]');
  if(!saisies.length) return;

  const connues = new Set(pocket.extensions.map(e => e.id));
  let ajoutees = 0, devancees = 0;

  saisies.forEach((ext, rang) => {
    verifierSaisie(ext, rang);

    if(connues.has(ext.id)){
      // La source l'a rattrapée : c'est elle qui fait foi désormais.
      console.log(`  ${ext.id} : publiée par la source, la saisie manuelle est ignorée (tu peux la retirer)`);
      devancees++;
      return;
    }

    const cartes = ext.cartes
      .map(c => {
        const numero = String(c.localId).trim();
        const id = `${ext.id}-${numero.padStart(3, '0')}`;
        return {
          id,
          localId: numero,
          name: String(c.name).trim(),
          rarity: c.rarity ?? null,
          // Le visuel suivra le chemin ordinaire : la récolte tentera les
          // sources, et un fichier déposé à la main sera repris comme pour
          // n'importe quelle autre carte.
          dexId: dexDuNomDeCarte(String(c.name).trim()),
          image: null,
          imageHaute: null,
          imageSecours: null,
        };
      })
      .sort((a, b) => Number(a.localId) - Number(b.localId));

    pocket.extensions.push({
      id: ext.id,
      name: String(ext.name).trim(),
      cardCount: { official: ext.cardCount ?? (cartes.length || null) },
      logo: null,
      symbol: null,
      serieNom: String(ext.serieNom).trim(),
      dateSortie: ext.dateSortie ?? null,
      saisieManuelle: true,
    });
    pocket.cartesParSet.set(ext.id, cartes);
    connues.add(ext.id);
    ajoutees++;
  });

  if(ajoutees) trierExtensionsPocket(pocket.extensions);
  console.log(`Extensions saisies à la main : ${ajoutees} ajoutée(s), ${devancees} devancée(s) par la source`);
}

// ------------------------------------ les logos d'extension, en français ---
//
// Les logos venaient de flibustier, qui ne traduit que ce qu'il a eu le temps
// de traduire : neuf extensions récentes s'affichaient avec leur logo anglais
// au milieu d'un site français.
//
// Le wiki francophone les range dans le même stockage public que ses cartes,
// sous une forme lue dans son code :
//
//     .../public_files/system/set/LOGO_<extension>_fr.png
//
// On prend les 23, pas seulement les 9 qui manquaient : une fois chez nous,
// plus aucun logo ne dépend d'un serveur extérieur, et ils viennent tous de
// la même source plutôt que de deux qui ne se ressemblent pas.

const DOSSIER_LOGOS = 'images/sets';
const LOGOS_WIKI = 'https://ptcgp-wiki.metainnovation.site/storage/v1/object/public/public_files/system/set';

// Chez le wiki, la promo de la série A s'appelle « PROMO » et celle de la
// série B « PROMOB ». La règle se lit : « PROMO » suivi de la lettre, sauf
// pour la première qui n'en porte pas. Une série C donnera « PROMOC » : ce
// n'est pas vérifié, mais ce n'est pas un risque : une adresse fausse est
// simplement écartée, et la carte garde le visuel qu'elle avait.

async function recolterLogosFrancais(pocket){
  await mkdir(DOSSIER_LOGOS, { recursive: true });
  let pris = 0, deja = 0, sansSuite = 0;

  for(const ext of pocket.extensions){
    const fichier = `${DOSSIER_LOGOS}/${ext.id}.png`;
    if(existsSync(fichier)){ ext.logo = fichier; deja++; continue; }

    // On essaie le wiki, puis, s'il n'a pas cette extension, le logo qu'on
    // servait déjà. Le second cas n'est pas un pis-aller : P-B a un logo
    // français chez flibustier que le wiki n'a pas, et le rapatrier vaut
    // mieux que de le remplacer par un logo générique ou de le laisser
    // pendre à un serveur extérieur.
    const candidates = [
      `${LOGOS_WIKI}/LOGO_${nomPromoWiki(ext.id) ?? ext.id}_fr.png`,
      /^https?:/.test(String(ext.logo)) ? ext.logo : null,
    ].filter(Boolean);

    let obtenu = false;
    for(const adresse of candidates){
      try{
        const r = await fetch(adresse, { redirect: 'follow', headers: IDENTITE });
        // Un stockage public répond volontiers 200 avec un message d'erreur
        // en guise de fichier : on exige une vraie image.
        if(!r.ok || !/image\//.test(r.headers.get('content-type') ?? '')) continue;
        await writeFile(fichier, Buffer.from(await r.arrayBuffer()));
        ext.logo = fichier;
        pris++;
        obtenu = true;
        break;
      }catch(err){ /* source suivante */ }
    }
    if(!obtenu) sansSuite++;
  }

  console.log(`Logos d'extension : ${pris} récoltés, ${deja} déjà là, ${sansSuite} restés à leur source d'origine`);
}

// ------------------------ copier chez nous le reste du catalogue Pocket ---
//
// Les extensions qui ne manquaient de rien tirent toujours leurs visuels de
// TCGdex. Ça marche, mais ça veut dire qu'une page de ce site déclenche une
// requête chez eux à chaque affichage, et que le jour où leur serveur bouge,
// les cartes disparaissent.
//
// On copie donc les deux définitions : la vignette des grilles et la haute
// définition du zoom. Les deux, parce que n'en prendre qu'une dégraderait
// visiblement le zoom : mesuré à 310 Mo pour l'ensemble, ce qui reste très
// en deçà de ce que GitHub Pages accepte.
//
// Comme ailleurs : rien n'est redemandé deux fois, et rien n'écrase un
// fichier existant.

// Brancher les visuels français relevés chez PkmCards.
// ====================================================
//
// Beaucoup de cartes n'ont pas de visuel français chez TCGdex : l'adresse
// existe, mais elle répond 404, et le site affiche un point
// d'interrogation. PkmCards, lui, a ces visuels en français. On s'en sert
// de secours à la place de l'anglais : Mrv972 ne veut que du français.
//
// Le rapprochement n'est pas devinable : leurs codes d'extension ne sont
// pas les nôtres (« fst » pour Poing de Fusion) : il a été établi à part,
// en vérifiant que les mêmes noms de cartes tombent aux mêmes numéros, et
// vit dans donnees/appariement-pkmcards.json. Les appariements douteux en
// sont écartés : servir une image venue d'une autre extension serait pire
// que le point d'interrogation.
async function brancherPkmcards(physique){
  let releve, appariement;
  try{
    releve = JSON.parse(await readFile('donnees/visuels-pkmcards.json', 'utf8'));
    appariement = JSON.parse(await readFile('donnees/appariement-pkmcards.json', 'utf8'));
  }catch{
    console.log('Pas de relevé PkmCards : on garde les secours en place.');
    return;
  }

  // Leurs numéros portent des zéros devant (« 001 »), les nôtres non.
  const sansZeros = n => String(n ?? '').replace(/^0+/, '').toLowerCase();

  // notre identifiant d'extension -> leur code
  const leurCode = new Map();
  for(const [code, a] of Object.entries(appariement.apparies ?? {})) leurCode.set(a.notre, code);

  // « leurcode-numéro » -> adresse, avec le numéro normalisé pour pouvoir
  // le rapprocher du nôtre.
  const parCle = new Map();
  for(const [cle, adresse] of Object.entries(releve.visuels ?? {})){
    const m = /^(.+)-([0-9a-z]+)$/i.exec(cle);
    if(m) parCle.set(`${m[1].toLowerCase()}-${sansZeros(m[2])}`, adresse);
  }

  let poses = 0;
  const parExtension = new Map();
  for(const [setId, cartes] of physique.cartesParSet){
    const code = leurCode.get(setId);
    if(!code) continue;
    for(const carte of cartes){
      const adresse = parCle.get(`${code}-${sansZeros(carte.localId)}`);
      if(!adresse) continue;
      carte.imageSecours = adresse;
      poses++;
      parExtension.set(setId, (parExtension.get(setId) ?? 0) + 1);
    }
  }
  console.log(`Secours français depuis PkmCards : ${poses} cartes` +
    ` sur ${parExtension.size} extensions` +
    ` (relevé du ${String(releve.releveLe ?? '?').slice(0, 10)}` +
    `${releve.complet ? '' : ', PARTIEL'})`);
}

// Brancher les visuels français de Pokécardex.
// ============================================
//
// Troisième source, pour ce que ni TCGdex ni PkmCards n'ont : les
// coffrets, galeries de dresseurs, kits du dresseur, promos et
// collections McDonald's : mesuré à 1 297 cartes pas en français, dont
// 936 sans aucun visuel et 361 affichées en anglais.
//
// On POINTE vers leurs images au lieu de les copier, parce que leur CDN
// répond « access-control-allow-origin: * » : l'export d'un classeur
// partagé fonctionnera. C'est ce qui la distingue de Poképédia, dont les
// images ont dû être copiées dans le dépôt faute de cet en-tête.
//
// Le rapprochement vient de donnees/appariement-pokecardex.json, établi
// en vérifiant que les mêmes noms de cartes tombent aux mêmes numéros.
// Les appariements douteux en sont écartés : afficher la carte d'une
// autre extension serait pire que le point d'interrogation pour
// quelqu'un qui range une collection.
async function brancherPokecardex(physique){
  let releve, appariement;
  try{
    releve = JSON.parse(await readFile('donnees/visuels-pokecardex.json', 'utf8'));
    appariement = JSON.parse(await readFile('donnees/appariement-pokecardex.json', 'utf8'));
  }catch{
    console.log('Pas de relevé Pokécardex : on garde les secours en place.');
    return;
  }

  const sansZeros = n => String(n ?? '').replace(/^0+/, '').toLowerCase();

  // Leur serveur de cartes REFUSE l'adresse nue (403) et ne sert l'image
  // qu'avec un paramètre de taille : « …/FR/63.jpg » échoue, « …/FR/63.jpg
  // ?class=md » répond, en WebP, avec l'autorisation d'affichage. Le
  // moissonneur retirait ce paramètre, et toutes les cartes branchées sur
  // Pokécardex s'affichaient en point d'interrogation, y compris celles
  // qui avaient jusque-là un visuel anglais. Mesuré, pas supposé.
  const adresseServie = a => /[?&]class=/.test(a) ? a : `${a}${a.includes('?') ? '&' : '?'}class=md`;
  // Leur même image existe aussi en « hd » (444 px au lieu de 214) : c'est
  // elle que le zoom affiche quand ce secours est en service.
  const poserSecours = (carte, adresse) => {
    carte.imageSecours = adresseServie(adresse);
    carte.imageHauteSecours = carte.imageSecours.replace(/([?&]class=)md\b/, '$1hd');
  };

  // La langue lue sur l'image elle-même (outils/langue-visuels.mjs). Leur
  // site montre parfois le scan ANGLAIS d'une carte, faute du français :
  // s'en servir comme « secours français » serait mentir. Un scan lu en
  // anglais est donc écarté, et la carte garde son secours anglais de
  // TCGdex, qui dit honnêtement ce qu'il est.
  let langues = {};
  try{ langues = JSON.parse(await readFile('donnees/langue-visuels.json', 'utf8')).verdicts ?? {}; }catch{}
  let ecartesAnglais = 0;
  const lueEnAnglais = adresse => {
    if(langues[adresseServie(adresse)]?.langue !== 'en') return false;
    ecartesAnglais++;
    return true;
  };

  // notre identifiant d'extension -> leur code
  const leurCode = new Map();
  for(const [code, a] of Object.entries(appariement.apparies ?? {})) leurCode.set(a.notre, code);

  let poses = 0, remplaceDeLAnglais = 0;
  const parExtension = new Map();
  for(const [setId, cartes] of physique.cartesParSet){
    const code = leurCode.get(setId);
    if(!code) continue;
    const chezEux = releve.series?.[code]?.cartes ?? {};
    // Leurs numéros peuvent porter des zéros devant, les nôtres non : on
    // compare des formes normalisées des deux côtés.
    const parNumero = new Map(Object.entries(chezEux).map(([n, c]) => [sansZeros(n), c]));
    for(const carte of cartes){
      const chez = parNumero.get(sansZeros(carte.localId));
      if(!chez || lueEnAnglais(chez.adresse)) continue;
      // On ne remplace jamais un secours DÉJÀ français : PkmCards a été
      // vérifié carte par carte, il n'y a rien à y gagner.
      const dejaFrancais = carte.imageSecours && !/\/en\//.test(carte.imageSecours);
      if(dejaFrancais) continue;
      if(carte.imageSecours && /\/en\//.test(carte.imageSecours)) remplaceDeLAnglais++;
      poserSecours(carte, chez.adresse);
      poses++;
      parExtension.set(setId, (parExtension.get(setId) ?? 0) + 1);
    }
  }
  // Les séries à préfixe (promos, coffres, galeries) rattachées carte par
  // carte par l'appariement, numéro ET nom vérifiés. On les prend telles
  // quelles : rien à recalculer ici, donc rien à mal recalculer.
  for(const [setId, sous] of Object.entries(appariement.sousSeries ?? {})){
    const cartes = physique.cartesParSet.get(setId);
    if(!cartes) continue;
    for(const carte of cartes){
      const adresse = sous.cartes?.[carte.localId];
      if(!adresse || lueEnAnglais(adresse)) continue;
      const dejaFrancais = carte.imageSecours && !/\/en\//.test(carte.imageSecours);
      if(dejaFrancais) continue;
      if(carte.imageSecours && /\/en\//.test(carte.imageSecours)) remplaceDeLAnglais++;
      poserSecours(carte, adresse);
      poses++;
      parExtension.set(setId, (parExtension.get(setId) ?? 0) + 1);
    }
  }

  // Le rattrapage : séries rattachées à la main, chaque carte retrouvée par
  // son numéro imprimé, son numéro ou son nom, nom toujours vérifié. Même
  // forme que les séries à préfixe, même usage.
  for(const [setId, r] of Object.entries(appariement.rattrapages ?? {})){
    const cartes = physique.cartesParSet.get(setId);
    if(!cartes) continue;
    for(const carte of cartes){
      const adresse = r.cartes?.[carte.localId];
      if(!adresse || lueEnAnglais(adresse)) continue;
      const dejaFrancais = carte.imageSecours && !/\/en\//.test(carte.imageSecours);
      if(dejaFrancais) continue;
      if(carte.imageSecours && /\/en\//.test(carte.imageSecours)) remplaceDeLAnglais++;
      poserSecours(carte, adresse);
      poses++;
      parExtension.set(setId, (parExtension.get(setId) ?? 0) + 1);
    }
  }

  // L'adresse « /fr/ » de TCGdex sert parfois l'image ANGLAISE (Skyridge,
  // Arceus, Team Rocket Returns : lu sur l'image). Quand un scan français a
  // été trouvé ailleurs, il passe devant ; l'image de TCGdex devient le
  // secours, une image anglaise valant mieux qu'aucune si le scan manquait.
  const versHaute = a => String(a ?? '').replace('/low.webp', '/high.webp');
  let permutees = 0;
  for(const cartes of physique.cartesParSet.values()){
    for(const carte of cartes){
      const lu = langues[carte.image]?.langue ?? langues[versHaute(carte.image)]?.langue;
      if(lu !== 'en') continue;
      const secours = carte.imageSecours ?? '';
      if(!/^https?:/.test(secours) || /\/en\//.test(secours) || langues[secours]?.langue === 'en') continue;
      const { image, imageHaute } = carte;
      carte.image = secours;
      carte.imageHaute = carte.imageHauteSecours ?? secours;
      carte.imageSecours = image;
      carte.imageHauteSecours = imageHaute;
      permutees++;
    }
  }
  console.log(`Images TCGdex lues en anglais, remplacées par un scan français : ${permutees}`);

  console.log(`Secours français depuis Pokécardex : ${poses} cartes` +
    ` sur ${parExtension.size} extensions` +
    ` (dont ${remplaceDeLAnglais} qui étaient en anglais ;` +
    ` ${ecartesAnglais} scans écartés, lus en anglais sur l'image)` +
    ` : relevé du ${String(releve.releveLe ?? '?').slice(0, 10)}` +
    `${releve.complet ? '' : ', PARTIEL'}`);
}

async function copierLeResteDuCatalogue(pocket){
  await mkdir(DOSSIER_VISUELS, { recursive: true });
  const aFaire = [];
  for(const cartes of pocket.cartesParSet.values()){
    for(const carte of cartes){
      if(/^https?:/.test(carte.image ?? '') && !aDejaUnVisuel(carte.id)){
        aFaire.push({ adresse: carte.image, fichier: `${DOSSIER_VISUELS}/${carte.id}.webp` });
      }
      // La haute définition ne se demande que si on prend AUSSI la vignette,
      // c'est-à-dire si la carte n'a pas déjà son visuel chez nous. Sinon on
      // redemandait chaque nuit la haute définition de cartes servies par une
      // autre source : 1028 requêtes vouées au 404, puisque le serveur qui
      // n'avait pas la vignette française n'a pas davantage la grande.
      if(/^https?:/.test(carte.imageHaute ?? '') && carte.imageHaute !== carte.image
         && !aDejaUnVisuel(carte.id)
         && !existsSync(`${DOSSIER_VISUELS}/${carte.id}${SUFFIXE_HD}.webp`)){
        aFaire.push({ adresse: carte.imageHaute, fichier: `${DOSSIER_VISUELS}/${carte.id}${SUFFIXE_HD}.webp` });
      }
    }
  }
  if(!aFaire.length){ console.log('Reste du catalogue Pocket : tout est déjà dans le dépôt.'); return; }

  console.log(`Copie du reste du catalogue Pocket : ${aFaire.length} fichiers à prendre…`);
  let pris = 0, echecs = 0, octets = 0;
  await parPaquets(aFaire, 8, async ({ adresse, fichier }) => {
    try{
      const r = await fetch(adresse, { redirect: 'follow', headers: IDENTITE });
      if(!r.ok){ echecs++; return; }
      const donnees = Buffer.from(await r.arrayBuffer());
      await writeFile(fichier, donnees);
      octets += donnees.length;
      pris++;
    }catch(err){ echecs++; }
  });
  console.log(`  ${pris} copiés (${(octets / 1048576).toFixed(0)} Mo), ${echecs} en échec`);
}

// ------------------------------- retrouver le Pokémon d'une carte Pocket --
//
// Le jeu de données de l'application ne porte pas le numéro de Pokédex, dont
// la page « Par Pokémon » a besoin. Il se déduit du nom, et plutôt que de
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

// La clé d'un nom de carte, pour un nom de fichier : « Poké Ball » et
// « Poke Ball » se retrouvent ensemble.
const cleDeNom = nom => String(nom ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/œ/gi, 'oe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// Une Énergie de base porte, selon l'extension, « Énergie Obscurité »,
// « Énergie Darkness de base » ou « Darkness Energy » : c'est la même carte
// pour qui la cherche. Son type se lit toujours dans le nom ; on les range
// donc sous un seul nom par type.
const TYPES_ENERGIE = [
  [/\bfeu\b|\bfire\b/i, 'Feu'], [/\beau\b|\bwater\b/i, 'Eau'], [/plante|\bgrass\b/i, 'Plante'],
  [/[ée]lectri|electrik|lightning/i, 'Électrique'], [/\bpsy|psychic/i, 'Psy'], [/combat|fighting/i, 'Combat'],
  [/obscurit|darkness|\bdark\b/i, 'Obscurité'], [/m[ée]tal/i, 'Métal'], [/\bf[ée]e\b|fairy/i, 'Fée'],
];
function nomDeRangement(carte){
  if(carte.categorie !== 'energie' || carte.famille !== 'base') return null;
  const type = TYPES_ENERGIE.find(([motif]) => motif.test(carte.name));
  return type ? `Énergie ${type[1]}` : null;
}

// Les cartes qui ne sont pas des Pokémon : dresseurs, objets, stades,
// énergies, rangées par nom, comme les cartes d'un Pokémon le sont par son
// numéro. Une carte sans famille connue (les plus anciennes, les toutes
// dernières de l'application) prend celle des cartes du même nom.
// Les familles lues sur les cartes elles-mêmes, pour celles qu'aucune
// source ne classe (outils/familles-dresseur.json) : la clé du nom, puis la
// famille imprimée en haut à gauche de la carte.
const FAMILLES_LUES = 'outils/familles-dresseur.json';
async function lireFamillesLues(){
  try{
    const { familles } = JSON.parse(await readFile(FAMILLES_LUES, 'utf8'));
    return new Map(Object.entries(familles ?? {}).filter(([, f]) => FAMILLES_CHOISIES.includes(f)));
  }catch{ return new Map(); }
}

function rangerAutresCartes(extensions, cartesParSet, famillesConnues = new Map(), famillesLues = new Map()){
  const rang = new Map(extensions.map((e, i) => [e.id, i]));
  const parNom = new Map();
  for(const [setId, cartes] of cartesParSet){
    for(const carte of cartes){
      if(!carte.categorie) continue;
      const cle = cleDeNom(nomDeRangement(carte) ?? carte.name);
      if(!cle) continue;
      if(!parNom.has(cle)) parNom.set(cle, []);
      parNom.get(cle).push({ carte, rang: rang.get(setId) ?? -1 });
    }
  }
  // Une carte sans catégorie ni Pokémon (saisie à la main, image au nom
  // inattendu) qui porte le nom d'une carte Dresseur connue en est une.
  for(const [setId, cartes] of cartesParSet){
    for(const carte of cartes){
      if(carte.categorie || carte.dexId) continue;
      const lot = parNom.get(cleDeNom(carte.name));
      if(!lot) continue;
      carte.categorie = lot[0].carte.categorie;
      lot.push({ carte, rang: rang.get(setId) ?? -1 });
    }
  }
  const index = [];
  for(const [cle, lot] of parNom){
    const majoritaire = (champ, parmi = lot) => {
      const compte = new Map();
      for(const { carte } of parmi) if(carte[champ]) compte.set(carte[champ], (compte.get(carte[champ]) ?? 0) + 1);
      return [...compte].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    const categorie = majoritaire('categorie');
    // La famille donnée par la source passe avant celle déduite du texte :
    // « Erika » est une Supporter en 2019, une simple carte Dresseur en 1999.
    const explicites = lot.filter(({ carte }) => carte.famille && !famillesDeduites.has(carte));
    const familleExplicite = explicites.length
      ? majoritaire('famille', explicites) : null;
    // À défaut, la famille lue sur la carte, puis celle d'une carte du même
    // nom dans l'autre univers : « Cornélia » est une Supporter dans les deux.
    const famille = familleExplicite ?? majoritaire('famille')
      ?? (categorie === 'dresseur' ? famillesLues.get(cle) ?? famillesConnues.get(cle) : null) ?? null;
    for(const { carte } of lot) if(!carte.famille && famille && carte.categorie === categorie) carte.famille = famille;
    lot.sort((a, b) => b.rang - a.rang);
    index.push({
      cle, nom: nomDeRangement(lot[0].carte) ?? majoritaire('name'), categorie, famille, nb: lot.length,
      image: lot[0].carte.image, imageSecours: lot[0].carte.imageSecours ?? null,
      cartes: lot.map(x => x.carte),
    });
  }
  return index.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

async function publier(univers, { extensions, cartesParSet }, sortie, autres = []){
  const base = path.join(sortie, univers);
  await rm(base, { recursive: true, force: true });

  // Une extension de promos s'agrandit à chaque nouvelle carte : sa source
  // n'en annonce donc pas le total (Promo-B côté Pocket, par exemple). Sans
  // total, le catalogue n'affiche pas de barre d'avancement. Le nombre de
  // cartes qu'on publie pour elle n'est pas un chiffre inventé : c'est
  // exactement ce que le visiteur peut cocher.
  for(const ext of extensions){
    const annonce = ext.cardCount?.official ?? ext.cardCount?.total ?? null;
    const publiees = cartesParSet.get(ext.id)?.length ?? 0;
    if(!(annonce > 0) && publiees > 0) ext.cardCount = { ...ext.cardCount, official: publiees };
  }
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
  for(const entree of autres) await ecrire(path.join(base, 'autres'), `${entree.cle}.json`, entree.cartes);
  await ecrire(base, 'autres.json', autres.map(({ cartes, ...entree }) => entree));
  return { extensions: extensions.length, cartes: total, pokemon: parDex.size, autres: autres.length };
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
  if(soucis.length) throw new Error(`Instantané ${nom} suspect : ${soucis.join(' ; ')}`);
}

// ------------------------------------------------------------- départ ----

async function principal(){
  if(!CHEMIN_TCGDEX) throw new Error('Il manque --tcgdex <chemin du clone de tcgdex/cards-database>');

  console.log('Jeu physique : lecture du dépôt TCGdex…');
  const physique = await construirePhysique();

  console.log(`  ${physique.traductions.size} correspondances anglais → français récoltées`);
  console.log(`  ${physique.pocketChezTcgdex.size} extensions Pocket avec visuels français chez TCGdex`);
  const { dexDuNomDeCarte, POKEDEX_FR } = await chargerRegleDuPokedex();

  console.log("Application : téléchargement du jeu de données…");
  const pocket = await construirePocket(physique.traductions, new Set(POKEDEX_FR), physique.pocketChezTcgdex,
    physique.categoriesPocket, physique.nomsPocket);

  await fusionnerExtensionsManuelles(pocket, dexDuNomDeCarte);

  console.log('Rattachement des cartes Pocket à leur Pokémon…');
  let rattachees = 0, orphelines = 0;
  for(const cartes of pocket.cartesParSet.values()){
    for(const carte of cartes){
      // Une carte Dresseur ne représente pas le Pokémon qu'elle nomme :
      // « Carapuce à O » est un Objet, pas une carte de Carapuce.
      carte.dexId = carte.categorie ? null : dexDuNomDeCarte(carte.name);
      carte.dexId ? rattachees++ : orphelines++;
    }
  }
  console.log(`  ${rattachees} rattachées, ${orphelines} sans Pokémon (cartes de Dresseur comprises)`);

  await absorberCorrections({ pocket, physique });

  await recolterVisuelsFrancais(pocket);

  await recolterLogosFrancais(pocket);
  await copierLeResteDuCatalogue(pocket);

  await brancherPkmcards(physique);
  await brancherPokecardex(physique);

  const { vignettes, hautes } = trierVisuels(await recenserVisuelsLocaux());
  // Un fichier copié qu'on a lu EN ANGLAIS (outils/langue-visuels.mjs) ne
  // passe plus devant un scan français : Poképédia héberge aussi les scans
  // anglais des cartes jamais éditées en France : Gym Heroes, par exemple.
  // On ne l'écarte que si Pokécardex a fourni, pour cette carte, un scan
  // non lu en anglais ; sinon il reste : une image anglaise vaut mieux
  // qu'un point d'interrogation.
  let languesLocales = {};
  try{ languesLocales = JSON.parse(await readFile('donnees/langue-visuels.json', 'utf8')).verdicts ?? {}; }catch{}
  let localesAnglaises = 0;
  if(vignettes.size){
    let poses = 0, posesHd = 0;
    for(const lot of [physique, pocket]){
      for(const cartes of lot.cartesParSet.values()){
        for(const carte of cartes){
          const local = vignettes.get(carte.id);
          if(!local) continue;
          if(languesLocales[`depot:${carte.id}`]?.langue === 'en' && /pokecardex/.test(carte.imageSecours ?? '')){
            localesAnglaises++;
            continue;
          }
          // Ce qui venait d'ailleurs devient le secours : l'adresse
          // française qu'on servait jusqu'ici, pas l'anglaise plus ancienne :
          // si le fichier local manquait, mieux vaut retomber sur la bonne
          // langue.
          carte.imageSecours = carte.image;
          carte.image = local;
          // Faute de haute définition locale, la vignette fait l'affaire :
          // c'est ce qui se passait déjà pour les visuels du wiki, qui n'en
          // ont qu'une seule.
          const hd = hautes.get(carte.id);
          carte.imageHaute = hd ?? local;
          if(hd) posesHd++;
          poses++;
        }
      }
    }
    console.log(`Visuels servis depuis le dépôt : ${poses} cartes, dont ${posesHd} avec une haute définition` +
      ` (${localesAnglaises} copies lues en anglais laissées pour un scan français)`);
  }

  // Le bandeau « visuels des cartes en anglais » se déduit de l'état final,
  // jamais d'une intention prise en cours de route. Une extension dont
  // chaque carte a son visuel chez nous est en français, point, et si
  // demain une extension paraît sans visuel français, le bandeau
  // réapparaîtra de lui-même.
  for(const ext of pocket.extensions){
    const cartes = pocket.cartesParSet.get(ext.id) ?? [];
    const enAnglais = cartes.some(c => /^https?:/.test(c.image ?? ''));
    if(enAnglais) ext.visuelsAnglais = true;
    else delete ext.visuelsAnglais;
  }

  // Les cartes sans visuel français, classées par la dernière vérification
  // (outils/sans-edition-francaise.mjs). Le site leur pose un bandeau :
  // « N'existe pas en français » quand aucune édition française n'est
  // connue, « Visuel en anglais » quand la carte existe en français mais
  // que seule son image anglaise a été trouvée.
  try{
    const classement = JSON.parse(await readFile('donnees/sans-edition-francaise.json', 'utf8'));
    const sansEdition = new Set(classement.sansEdition ?? []);
    const visuelAnglais = new Set(classement.visuelAnglais ?? []);
    let marquees = 0;
    for(const cartes of physique.cartesParSet.values()){
      for(const carte of cartes){
        if(sansEdition.has(carte.id)){ carte.sansEditionFr = true; marquees++; }
        else if(visuelAnglais.has(carte.id)){ carte.visuelAnglais = true; marquees++; }
      }
    }
    console.log(`Bandeaux de langue : ${sansEdition.size} cartes sans édition française, ` +
      `${visuelAnglais.size} au visuel anglais (${marquees} posés)`);
  }catch{ console.log('Pas de classement des cartes sans visuel français : aucun bandeau de langue.'); }

  // Le rangement des cartes Dresseur et Énergie passe avant l'écriture des
  // extensions : il complète la famille des cartes qui n'en avaient pas.
  const famillesLues = await lireFamillesLues();
  const autresPhysique = rangerAutresCartes(physique.extensions, physique.cartesParSet, new Map(), famillesLues);
  const autresPocket = rangerAutresCartes(pocket.extensions, pocket.cartesParSet,
    new Map(autresPhysique.filter(e => e.famille).map(e => [e.cle, e.famille])), famillesLues);
  const nonClasses = [...autresPhysique, ...autresPocket].filter(e => e.categorie === 'dresseur' && !e.famille);
  if(nonClasses.length){
    console.log(`Cartes Dresseur sans famille connue (onglet « Autres Dresseurs ») : ${nonClasses.map(e => e.nom).join(', ')}`);
    console.log(`  À classer depuis le site (bouton ✎ d'une carte, champ « Famille ») ou dans ${FAMILLES_LUES}.`);
  }
  const bilanPhysique = await publier('physique', physique, SORTIE, autresPhysique);
  const bilanPocket = await publier('pocket', pocket, SORTIE, autresPocket);

  verifier('physique', bilanPhysique, { extensions: 150, cartes: 15000, pokemon: 700, autres: 500 });
  // 986 Pokémon rattachés en septembre 2026, 343 lors du faux pas de la
  // source en octobre : le seuil passe à 800 pour qu'un tel recul bloque.
  verifier('pocket', bilanPocket, { extensions: 20, cartes: 3000, pokemon: 800, autres: 50 });

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
  console.log(`  physique  ${bilanPhysique.extensions} extensions · ${bilanPhysique.cartes} cartes · ${bilanPhysique.pokemon} Pokémon · ${bilanPhysique.autres} autres noms`);
  console.log(`  pocket    ${bilanPocket.extensions} extensions · ${bilanPocket.cartes} cartes · ${bilanPocket.pokemon} Pokémon · ${bilanPocket.autres} autres noms`);
}

principal().catch(err => { console.error('Échec :', err.message); process.exit(1); });
