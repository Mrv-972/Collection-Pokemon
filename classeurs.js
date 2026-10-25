const CLE_CLASSEURS = 'pokeclasseur-classeurs';

const FORMATS = {
  '2x2': { colonnes: 2, lignes: 2, nom: '4 cases (2 × 2)' },
  '3x3': { colonnes: 3, lignes: 3, nom: '9 cases (3 × 3)' },
  '4x3': { colonnes: 4, lignes: 3, nom: '12 cases (4 × 3)' },
  '4x4': { colonnes: 4, lignes: 4, nom: '16 cases (4 × 4)' },
};

const FORMAT_PAR_DEFAUT = '3x3';
const casesParPage = format => FORMATS[format].colonnes * FORMATS[format].lignes;

const COULEURS = [
  { cle: 'creme',  nom: 'Crème',  teinte: '#C6B894', page: '#E9E2D2' },
  { cle: 'rouge',  nom: 'Rouge',  teinte: '#A8431C', page: '#EEDBD0' },
  { cle: 'bleu',   nom: 'Bleu',   teinte: '#2D5F8A', page: '#D8E3EE' },
  { cle: 'vert',   nom: 'Vert',   teinte: '#1F6F63', page: '#D5E6E1' },
  { cle: 'or',     nom: 'Or',     teinte: '#C9A227', page: '#EFE5C6' },
  { cle: 'violet', nom: 'Violet', teinte: '#6B4A8A', page: '#E2D9ED' },
  { cle: 'noir',   nom: 'Noir',   teinte: '#3A3D42', page: '#DCDDE0' },
];

const estCouleurLibre = cle => /^#[0-9a-f]{6}$/i.test(String(cle ?? ''));

const versRVB = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const versHex = rvb =>
  '#' + rvb.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');

const eclaircir = (hex, part) =>
  versHex(versRVB(hex).map(n => n * (1 - part) + 255 * part));
function couleurLibre(hex){
  return { cle: hex, nom: 'Couleur choisie', teinte: hex, page: eclaircir(hex, 0.82) };
}

const couleurDe = cle => estCouleurLibre(cle)
  ? couleurLibre(cle)
  : (COULEURS.find(c => c.cle === cle) ?? COULEURS[0]);

const teinteDe = cle => couleurDe(cle).teinte;

const estTransparent = classeur => classeur.transparent !== false;

function lireLeRangement(){
  try{
    const brut = JSON.parse(localStorage.getItem(CLE_CLASSEURS));
    return {
      classeurs: Array.isArray(brut?.classeurs) ? brut.classeurs : [],
      dossiers: Array.isArray(brut?.dossiers) ? brut.dossiers : [],
    };
  }catch{
    return { classeurs: [], dossiers: [] };
  }
}

function ecrireLeRangement(rangement){
  try{
    localStorage.setItem(CLE_CLASSEURS, JSON.stringify({ version: 1, ...rangement }));
    return true;
  }catch(err){
    console.warn('Enregistrement des classeurs impossible', err);
    return false;
  }
}

function lireLesClasseurs(){
  return lireLeRangement().classeurs.map(c => {
    const repris = ('rubrique' in c)
      ? { ...c, dossier: c.dossier ?? c.rubrique, rubrique: undefined } : { ...c };
    if(!repris.couverture) repris.couverture = repris.couleur || COULEURS[0].cle;
    return repris;
  });
}

function enregistrerLesClasseurs(classeurs){
  return ecrireLeRangement({ classeurs, dossiers: lireLeRangement().dossiers });
}

function lireLesDossiers(){
  return lireLeRangement().dossiers;
}

function enregistrerLesDossiers(dossiers){
  return ecrireLeRangement({ classeurs: lireLeRangement().classeurs, dossiers });
}

function nouvelIdentifiant(){
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function classeurNeuf(nom){
  return {
    id: nouvelIdentifiant(),
    nom: nom || 'Nouveau classeur',
    format: FORMAT_PAR_DEFAUT,
    couleur: null,
    transparent: true,
    couverture: COULEURS[0].cle,
    dossier: null,
    pages: [pageVide(FORMAT_PAR_DEFAUT)],
    images: {},
    versos: [],
    creeLe: new Date().toISOString(),
  };
}

const pageVide = format => new Array(casesParPage(format)).fill(null);

function changerLeFormat(classeur, format){
  const cartes = classeur.pages.flat().filter(Boolean);
  const parPage = casesParPage(format);
  const pages = [];
  for(let i = 0; i < cartes.length; i += parPage){
    const page = cartes.slice(i, i + parPage);
    while(page.length < parPage) page.push(null);
    pages.push(page);
  }
  if(!pages.length) pages.push(pageVide(format));
  return accorderLesVersos({ ...classeur, format, pages });
}

function poserALaSuite(classeur, carteId){
  const pages = classeur.pages.map(p => [...p]);
  for(const page of pages){
    const libre = page.indexOf(null);
    if(libre !== -1){ page[libre] = carteId; return { ...classeur, pages }; }
  }
  const page = pageVide(classeur.format);
  page[0] = carteId;
  return { ...classeur, pages: [...pages, page] };
}

function echangerDeuxCases(classeur, a, b){
  const pages = classeur.pages.map(p => [...p]);
  const tmp = pages[a.page][a.case];
  pages[a.page][a.case] = pages[b.page][b.case];
  pages[b.page][b.case] = tmp;
  return { ...classeur, pages };
}

function compterLesCartes(classeur){
  return classeur.pages.flat().filter(Boolean).length;
}

const PREFIXE_IMAGE = 'img_';
const estImage = valeur => String(valeur).startsWith(PREFIXE_IMAGE);

const nouvelleCleImage = () =>
  PREFIXE_IMAGE + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function ajouterUneImage(classeur, donnees){
  const cle = nouvelleCleImage();
  return { cle, classeur: { ...classeur, images: { ...(classeur.images ?? {}), [cle]: donnees } } };
}

const imageDuClasseur = (classeur, cle) => classeur?.images?.[cle] ?? null;

const SANS_DOSSIER = 'Sans dossier';

const parOrdreAlphabetique = (a, b) =>
  a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });

function tousLesDossiers(classeurs, dossiers){
  const noms = new Set((dossiers ?? []).map(d => String(d).trim()).filter(Boolean));
  for(const c of classeurs){
    const d = (c.dossier || '').trim();
    if(d) noms.add(d);
  }
  return [...noms].sort(parOrdreAlphabetique);
}

function classeursParDossier(classeurs, dossiers){
  const parNom = liste =>
    liste.slice().sort((a, b) => parOrdreAlphabetique(a.nom ?? '', b.nom ?? ''));
  const groupes = tousLesDossiers(classeurs, dossiers)
    .map(nom => ({ nom, classeurs: parNom(classeurs.filter(c => (c.dossier || '').trim() === nom)) }));
  const sans = classeurs.filter(c => !(c.dossier || '').trim());
  if(sans.length) groupes.push({ nom: SANS_DOSSIER, classeurs: parNom(sans), sansDossier: true });
  return groupes;
}

function couvertureDe(classeur){
  const choix = classeur?.couverture;
  if(choix && estImage(choix)){
    const donnees = imageDuClasseur(classeur, choix);
    if(donnees) return { genre: 'image', valeur: donnees };
  }
  return { genre: 'couleur', valeur: teinteDe(choix) };
}

const pagesSuiventLaCouverture = classeur => !classeur?.couleur;

function couleurDesPages(classeur){
  if(classeur?.couleur) return couleurDe(classeur.couleur);
  const couv = classeur?.couverture;
  return (couv && !estImage(couv)) ? couleurDe(couv) : COULEURS[0];
}

function oublierLesImagesInutiles(classeur){
  const images = classeur.images ?? {};
  const partout = [
    ...classeur.pages.flat(),
    ...(classeur.versos ?? []).flatMap(v => v ?? []),
    classeur.couverture,
  ];
  const utilisees = new Set(partout.filter(v => v && estImage(v)));
  const gardees = {};
  for(const [cle, donnees] of Object.entries(images)){
    if(utilisees.has(cle)) gardees[cle] = donnees;
  }
  return { ...classeur, images: gardees };
}

const DOS_DE_CARTE = 'dos';
const VERSO_VIDE = 'vide';
const VERSO_PAPIER = 'papier';

function enMiroirDeLaPage(page, colonnes){
  const miroir = [];
  for(let i = 0; i < page.length; i += colonnes){
    miroir.push(...page.slice(i, i + colonnes).reverse());
  }
  return miroir;
}

function versoDeLaPage(classeur, index){
  const recto = classeur.pages[index] ?? [];
  const colonnes = FORMATS[classeur.format].colonnes;
  const automatique = estTransparent(classeur)
    ? enMiroirDeLaPage(recto, colonnes).map(valeur => {
        if(!valeur) return null;
        return estImage(valeur) ? VERSO_PAPIER : DOS_DE_CARTE;
      })
    : new Array(casesParPage(classeur.format)).fill(null);
  const choisis = classeur.versos?.[index] ?? [];
  return automatique.map((defaut, i) => {
    const choix = choisis[i];
    if(choix === VERSO_VIDE) return null;
    return choix ?? defaut;
  });
}

function poserAuVerso(classeur, index, caseIndex, valeur){
  const parPage = casesParPage(classeur.format);
  const versos = (classeur.versos ?? []).map(v => (v ? [...v] : null));
  while(versos.length < classeur.pages.length) versos.push(null);
  if(!versos[index]) versos[index] = new Array(parPage).fill(null);
  versos[index][caseIndex] = valeur;
  return { ...classeur, versos };
}

function accorderLesVersos(classeur){
  const parPage = casesParPage(classeur.format);
  const versos = classeur.pages.map((_, i) => {
    const v = classeur.versos?.[i];
    if(!v) return null;
    const ajuste = v.slice(0, parPage);
    while(ajuste.length < parPage) ajuste.push(null);
    return ajuste.some(x => x !== null) ? ajuste : null;
  });
  return { ...classeur, versos };
}
