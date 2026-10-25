import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((paires, valeur, i, tout) =>
    valeur.startsWith('--') ? [...paires, [valeur.slice(2), tout[i + 1]]] : paires, []));

const CHEMIN_TCGDEX = args.tcgdex;
const SORTIE = args.sortie ?? 'donnees';

const DOSSIER_VISUELS = 'images/cards';
const EXTENSIONS_IMAGE = ['.webp', '.png', '.jpg', '.jpeg'];

async function recenserVisuelsLocaux(){
  const parCarte = new Map();
  let fichiers = [];
  try{
    fichiers = await readdir(DOSSIER_VISUELS);
  }catch(err){
    return parCarte;
  }
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

function aDejaUnVisuel(id){
  return EXTENSIONS_IMAGE.some(ext => existsSync(`${DOSSIER_VISUELS}/${id}${ext}`));
}

const SUFFIXE_HD = '-hd';
function trierVisuels(parCarte){
  const vignettes = new Map(), hautes = new Map();
  for(const [nom, chemin] of parCarte){
    if(nom.endsWith(SUFFIXE_HD)) hautes.set(nom.slice(0, -SUFFIXE_HD.length), chemin);
    else vignettes.set(nom, chemin);
  }
  return { vignettes, hautes };
}

function champTexte(source, nom){
  const m = source.match(new RegExp(`\\b${nom}:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1].replace(/\\(.)/g, '$1') : null;
}

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

const FAMILLES_CHOISIES = ['supporter', 'objet', 'outil', 'stade'];
const FAMILLES_DRESSEUR = {
  'Supporter': 'supporter', 'Item': 'objet', 'Tool': 'outil', 'Stadium': 'stade',
  'Technical Machine': 'objet', "Rocket's Secret Machine": 'objet',
};
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
  const traductions = new Map();
  const pocketChezTcgdex = new Set();
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

const POCKET_BASE = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist';
const POCKET_IMAGES = 'https://cdn.jsdelivr.net/gh/flibustier/pokemon-tcg-exchange@main/public/images/cards-by-set';
const POCKET_IMAGES_SECOURS = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-exchange/main/public/images/cards-by-set';

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

const MEMOIRE_NOMS_POCKET = 'noms-pocket-fr.json';

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

function traduireNom(nom, traductions, nomsFrancais){
  if(traductions.has(nom)) return traductions.get(nom);

  const avecEx = String(nom).match(/^(.*?)[\s-]ex$/i);
  const base = avecEx ? avecEx[1] : nom;
  const recoller = fr => avecEx ? `${fr}-ex` : fr;

  const connu = traductions.get(base) ?? (nomsFrancais.has(base) ? base : null);
  if(connu) return recoller(connu);

  const mega = base.match(/^Mega\s+(.+?)(?:\s+([XY]))?$/);
  if(mega){
    const pokemon = traductions.get(mega[1]) ?? (nomsFrancais.has(mega[1]) ? mega[1] : null);
    if(pokemon) return recoller(`Méga-${pokemon}${mega[2] ? `-${mega[2]}` : ''}`);
  }

  const rocket = base.match(/^Team Rocket['\u2019]s\s+(.+)$/);
  if(rocket){
    const pokemon = traductions.get(rocket[1]) ?? (nomsFrancais.has(rocket[1]) ? rocket[1] : null);
    if(pokemon) return `${recoller(pokemon)} de la Team Rocket`;
  }
  return nom;
}

const TCGDEX_POCKET = 'https://assets.tcgdex.net/fr/tcgp';

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
        symbol: null,
        serieNom: `Série ${lettre}`,
        dateSortie: s.releaseDate ?? null,
      });
    }
  }
  trierExtensionsPocket(extensions);

  const cartesParSet = new Map();
  for(const ext of extensions){
    const code = encodeURIComponent(ext.codeDistant);
    let brutes = [];
    try{ brutes = aplatir(await telecharger(`${POCKET_BASE}/cards/${code}.min.json`)); }catch(err){ }
    const anglaisLu = brutes.length > 0;
    let enFrancaisSource = new Map();
    try{
      const fr = aplatir(await telecharger(`${POCKET_BASE}/cards/fr/${code}.min.json`));
      const anglais = new Map(brutes.map(c => [c.number, c.name]));
      const identiques = fr.filter(c => anglais.get(c.number) === c.name).length;
      if(fr.length && identiques <= fr.length * 0.6) enFrancaisSource = new Map(fr.map(c => [c.number, c.name]));
      else if(fr.length) console.log(`  ${ext.id} : le fichier français de la source est en anglais, on s'en passe`);
      if(!brutes.length) brutes = fr;
    }catch(err){ }
    if(brutes.length === 0) console.warn(`  ! aucune carte pour ${ext.id}`);
    let traduites = 0, officiels = 0, deLaSource = 0, souvenirs = 0, reprises = 0;
    const enFrancais = chezTcgdex.has(ext.id);
    if(!enFrancais) ext.visuelsAnglais = true;
    const cartes = brutes.slice().sort((a, b) => a.number - b.number).map(c => {
      const numero = String(c.number).padStart(3, '0');
      const id = `${ext.id}-${numero}`;
      const anglais = c.name;
      const tcgdex = nomsTcgdex.get(id);
      const souvenir = memoire.get(id);
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
      else if(nomsDeLApplication.has(apostrophes(anglais))){ nom = nomsDeLApplication.get(apostrophes(anglais)); reprises++; }
      else{
        nom = traduireNom(anglais, dictionnaire, nomsFrancais);
        if(nom === anglais) nom = traduireNom(apostrophes(anglais), dictionnaire, nomsFrancais);
        if(nom !== anglais) traduites++;
      }
      if(anglaisLu && sur) memoire.set(id, [anglais, nom]);
      else if(souvenir && !memePokemon(especes, souvenir[0], souvenir[1])) memoire.delete(id);
      const categorie = categories.get(id)
        ?? (/^cTR_/.test(String(c.image ?? '')) ? { categorie: 'dresseur' } : {});
      return {
      id,
      localId: String(c.number),
      name: nom,
      rarity: RARETES_POCKET[c.rarity] ?? null,
      dexId: null,
      ...categorie,
      image: enFrancais
        ? `${TCGDEX_POCKET}/${ext.id}/${numero}/low.webp`
        : `${POCKET_IMAGES}/${encodeURIComponent(ext.codeDistant)}/${c.number}.webp`,
      imageHaute: enFrancais
        ? `${TCGDEX_POCKET}/${ext.id}/${numero}/high.webp`
        : `${POCKET_IMAGES}/${encodeURIComponent(ext.codeDistant)}/${c.number}.webp`,
      imageSecours: `${POCKET_IMAGES}/${encodeURIComponent(ext.codeDistant)}/${c.number}.webp`,
      };
    });
    const sansNomSur = cartes.length - officiels - deLaSource - souvenirs - reprises;
    if(sansNomSur > 0){
      console.log(`  ${ext.id} : ${officiels} noms TCGdex, ${souvenirs} retrouvés en mémoire, ` +
        `${reprises} réimpressions, ${traduites}/${sansNomSur} traduits automatiquement`);
    }
    cartesParSet.set(ext.id, cartes);
    delete ext.codeDistant;
  }
  await ecrireMemoireNoms(memoire);
  if(rejetes) console.log(`  ${rejetes} nom(s) français écarté(s) par le contrôle des espèces`);
  return { extensions, cartesParSet };
}


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
    if(ancien && neuf === ancien) return false;
    if(++verifiees >= 2) return true;
  }
  return verifiees > 0;
}

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
  }catch(err){ }
  return trouvees;
}

async function recolterVisuelsFrancais(pocket){
  let config;
  try{
    config = JSON.parse(await readFile(SOURCES_VISUELS, 'utf8'));
  }catch(err){
    return;
  }
  const sources = (config.candidats ?? []).filter(s => s.actif);
  if(!sources.length) return;

  await mkdir(DOSSIER_VISUELS, { recursive: true });
  console.log(`Récolte des visuels français manquants : ${sources.length} source(s) allumée(s)…`);

  for(const ext of pocket.extensions){
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
      if(!manques) break;
    }
  }
}

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
        }catch(err){ }
      }
      if(existsSync(fichier)) ext.logo = fichier;
      continue;
    }

    if(c.genre === 'logo-serie'){ ignorees++; continue; }

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
        }catch(err){ }
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
    if(err.code === 'ENOENT') return;
    refuser('lecture', `le fichier n'est pas du JSON valide (${err.message})`);
  }
  if(!Array.isArray(saisies)) refuser('lecture', 'le fichier doit contenir un tableau [ … ]');
  if(!saisies.length) return;

  const connues = new Set(pocket.extensions.map(e => e.id));
  let ajoutees = 0, devancees = 0;

  saisies.forEach((ext, rang) => {
    verifierSaisie(ext, rang);

    if(connues.has(ext.id)){
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

const DOSSIER_LOGOS = 'images/sets';
const LOGOS_WIKI = 'https://ptcgp-wiki.metainnovation.site/storage/v1/object/public/public_files/system/set';

async function recolterLogosFrancais(pocket){
  await mkdir(DOSSIER_LOGOS, { recursive: true });
  let pris = 0, deja = 0, sansSuite = 0;

  for(const ext of pocket.extensions){
    const fichier = `${DOSSIER_LOGOS}/${ext.id}.png`;
    if(existsSync(fichier)){ ext.logo = fichier; deja++; continue; }

    const candidates = [
      `${LOGOS_WIKI}/LOGO_${nomPromoWiki(ext.id) ?? ext.id}_fr.png`,
      /^https?:/.test(String(ext.logo)) ? ext.logo : null,
    ].filter(Boolean);

    let obtenu = false;
    for(const adresse of candidates){
      try{
        const r = await fetch(adresse, { redirect: 'follow', headers: IDENTITE });
        if(!r.ok || !/image\//.test(r.headers.get('content-type') ?? '')) continue;
        await writeFile(fichier, Buffer.from(await r.arrayBuffer()));
        ext.logo = fichier;
        pris++;
        obtenu = true;
        break;
      }catch(err){ }
    }
    if(!obtenu) sansSuite++;
  }

  console.log(`Logos d'extension : ${pris} récoltés, ${deja} déjà là, ${sansSuite} restés à leur source d'origine`);
}

async function brancherPkmcards(physique){
  let releve, appariement;
  try{
    releve = JSON.parse(await readFile('donnees/visuels-pkmcards.json', 'utf8'));
    appariement = JSON.parse(await readFile('donnees/appariement-pkmcards.json', 'utf8'));
  }catch{
    console.log('Pas de relevé PkmCards : on garde les secours en place.');
    return;
  }

  const sansZeros = n => String(n ?? '').replace(/^0+/, '').toLowerCase();

  const leurCode = new Map();
  for(const [code, a] of Object.entries(appariement.apparies ?? {})) leurCode.set(a.notre, code);

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

  const adresseServie = a => /[?&]class=/.test(a) ? a : `${a}${a.includes('?') ? '&' : '?'}class=md`;
  const poserSecours = (carte, adresse) => {
    carte.imageSecours = adresseServie(adresse);
    carte.imageHauteSecours = carte.imageSecours.replace(/([?&]class=)md\b/, '$1hd');
  };

  let langues = {};
  try{ langues = JSON.parse(await readFile('donnees/langue-visuels.json', 'utf8')).verdicts ?? {}; }catch{}
  let ecartesAnglais = 0;
  const lueEnAnglais = adresse => {
    if(langues[adresseServie(adresse)]?.langue !== 'en') return false;
    ecartesAnglais++;
    return true;
  };

  const leurCode = new Map();
  for(const [code, a] of Object.entries(appariement.apparies ?? {})) leurCode.set(a.notre, code);

  let poses = 0, remplaceDeLAnglais = 0;
  const parExtension = new Map();
  for(const [setId, cartes] of physique.cartesParSet){
    const code = leurCode.get(setId);
    if(!code) continue;
    const chezEux = releve.series?.[code]?.cartes ?? {};
    const parNumero = new Map(Object.entries(chezEux).map(([n, c]) => [sansZeros(n), c]));
    for(const carte of cartes){
      const chez = parNumero.get(sansZeros(carte.localId));
      if(!chez || lueEnAnglais(chez.adresse)) continue;
      const dejaFrancais = carte.imageSecours && !/\/en\//.test(carte.imageSecours);
      if(dejaFrancais) continue;
      if(carte.imageSecours && /\/en\//.test(carte.imageSecours)) remplaceDeLAnglais++;
      poserSecours(carte, chez.adresse);
      poses++;
      parExtension.set(setId, (parExtension.get(setId) ?? 0) + 1);
    }
  }
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

async function ecrire(dossier, nom, donnees){
  await mkdir(dossier, { recursive: true });
  await writeFile(path.join(dossier, nom), JSON.stringify(donnees), 'utf8');
}

const cleDeNom = nom => String(nom ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/œ/gi, 'oe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

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
    const explicites = lot.filter(({ carte }) => carte.famille && !famillesDeduites.has(carte));
    const familleExplicite = explicites.length
      ? majoritaire('famille', explicites) : null;
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

function verifier(nom, bilan, minima){
  const soucis = [];
  for(const [champ, mini] of Object.entries(minima)){
    if(bilan[champ] < mini) soucis.push(`${champ} : ${bilan[champ]} (moins de ${mini} attendus)`);
  }
  if(soucis.length) throw new Error(`Instantané ${nom} suspect : ${soucis.join(' ; ')}`);
}

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
          carte.imageSecours = carte.image;
          carte.image = local;
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

  for(const ext of pocket.extensions){
    const cartes = pocket.cartesParSet.get(ext.id) ?? [];
    const enAnglais = cartes.some(c => /^https?:/.test(c.image ?? ''));
    if(enAnglais) ext.visuelsAnglais = true;
    else delete ext.visuelsAnglais;
  }

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
