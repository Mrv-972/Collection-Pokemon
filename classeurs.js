// Classeurs virtuels : essayer un rangement avant de le faire pour de vrai.
//
// Ranger un classeur de cartes se fait une fois — après, changer l'ordre
// veut dire tout ressortir des pochettes. D'où cette page : on dispose les
// cartes à l'écran, on regarde ce que ça donne, on recommence, et on ne
// touche au vrai classeur qu'une fois décidé.
//
// Tout est enregistré dans la mémoire du navigateur, sur cet appareil. Ce
// n'est pas idéal — les marquages de cartes, eux, suivent le compte — mais
// cela évite d'imposer une table de plus en base pour une première version.
// La suite logique est d'y ajouter la synchronisation.

const CLE_CLASSEURS = 'pokeclasseur-classeurs';

// Les formats de pochettes qu'on trouve dans le commerce. Le 3 × 3 est de
// loin le plus répandu ; les autres existent et méritaient d'être là.
const FORMATS = {
  '2x2': { colonnes: 2, lignes: 2, nom: '4 cases (2 × 2)' },
  '3x3': { colonnes: 3, lignes: 3, nom: '9 cases (3 × 3)' },
  '4x3': { colonnes: 4, lignes: 3, nom: '12 cases (4 × 3)' },
  '4x4': { colonnes: 4, lignes: 4, nom: '16 cases (4 × 4)' },
};

const FORMAT_PAR_DEFAUT = '3x3';
const casesParPage = format => FORMATS[format].colonnes * FORMATS[format].lignes;

// La couleur de la couverture. Elle ne sert à rien d'autre qu'à distinguer
// ses classeurs d'un coup d'œil, ce qui est déjà quelque chose quand on en
// a six.
const COULEURS = [
  { cle: 'rouge',  nom: 'Rouge',   teinte: '#A8431C' },
  { cle: 'bleu',   nom: 'Bleu',    teinte: '#2D5F8A' },
  { cle: 'vert',   nom: 'Vert',    teinte: '#1F6F63' },
  { cle: 'or',     nom: 'Or',      teinte: '#C9A227' },
  { cle: 'violet', nom: 'Violet',  teinte: '#6B4A8A' },
  { cle: 'noir',   nom: 'Noir',    teinte: '#3A3D42' },
];

const teinteDe = cle => (COULEURS.find(c => c.cle === cle) ?? COULEURS[0]).teinte;

// ------------------------------------------------------ enregistrement ---

function lireLesClasseurs(){
  try{
    const brut = JSON.parse(localStorage.getItem(CLE_CLASSEURS));
    return Array.isArray(brut?.classeurs) ? brut.classeurs : [];
  }catch{
    return [];
  }
}

function enregistrerLesClasseurs(classeurs){
  try{
    localStorage.setItem(CLE_CLASSEURS, JSON.stringify({ version: 1, classeurs }));
    return true;
  }catch(err){
    console.warn('Enregistrement des classeurs impossible', err);
    return false;
  }
}

// Un identifiant qui ne dépend de rien : deux classeurs créés dans la même
// seconde doivent rester distincts.
function nouvelIdentifiant(){
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function classeurNeuf(nom){
  return {
    id: nouvelIdentifiant(),
    nom: nom || 'Nouveau classeur',
    format: FORMAT_PAR_DEFAUT,
    couleur: COULEURS[0].cle,
    // Une page vide pour commencer : un classeur sans page ne se regarde pas.
    pages: [pageVide(FORMAT_PAR_DEFAUT)],
    // Les images importées par le membre, rangées par clé.
    images: {},
    creeLe: new Date().toISOString(),
  };
}

const pageVide = format => new Array(casesParPage(format)).fill(null);

// Changer de format ne doit rien perdre : les cartes sont remises à la
// suite, dans l'ordre où elles étaient, et le nombre de pages s'ajuste.
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
  return { ...classeur, format, pages };   // « images » suit, par la copie
}

// Poser une carte dans la première case libre, en créant une page au besoin.
// C'est ce qu'on attend quand on clique sur une carte à ajouter : elle se
// range, sans avoir à désigner l'endroit.
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

// Échanger deux cases, y compris d'une page à l'autre. Déplacer par échange
// plutôt que par insertion évite de décaler toutes les cartes suivantes, ce
// qui, dans un classeur, est justement ce qu'on ne veut pas.
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

// ------------------------------------------ les images personnelles ------
//
// Tout le monde ne remplit pas ses pochettes de cartes : on y glisse aussi
// une illustration, une photo, un intercalaire dessiné à la main. Une case
// peut donc contenir, au lieu d'un identifiant de carte, la clé d'une image
// rangée dans le classeur lui-même.
//
// Les images vivent à part, dans « classeur.images », et les cases n'en
// gardent que la clé. Deux cases peuvent ainsi montrer la même image sans
// la stocker deux fois, et le format des pages se change sans y toucher.

const PREFIXE_IMAGE = 'img_';
const estImage = valeur => String(valeur).startsWith(PREFIXE_IMAGE);

const nouvelleCleImage = () =>
  PREFIXE_IMAGE + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function ajouterUneImage(classeur, donnees){
  const cle = nouvelleCleImage();
  return { cle, classeur: { ...classeur, images: { ...(classeur.images ?? {}), [cle]: donnees } } };
}

const imageDuClasseur = (classeur, cle) => classeur?.images?.[cle] ?? null;

// Une image dont plus aucune case ne se sert n'a pas à rester : la mémoire
// du navigateur est petite, et un classeur qu'on remanie longtemps finirait
// par la remplir de ce qu'on a retiré.
function oublierLesImagesInutiles(classeur){
  const images = classeur.images ?? {};
  const utilisees = new Set(classeur.pages.flat().filter(v => v && estImage(v)));
  const gardees = {};
  for(const [cle, donnees] of Object.entries(images)){
    if(utilisees.has(cle)) gardees[cle] = donnees;
  }
  return { ...classeur, images: gardees };
}
