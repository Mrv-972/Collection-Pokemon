// Thème clair ou sombre, et réglages d'affichage.
// ===============================================
//
// Chargé en tête de chaque page, AVANT ses styles : le thème est posé sur
// <html> avant le premier affichage. Plus tard, la page aurait d'abord
// paru sombre, puis viré au clair d'un coup : un éclair désagréable à
// chaque changement de page.
//
// Trois choix : « auto » (celui de l'appareil), « clair », « sombre ». Le
// choix est retenu sur l'appareil ; pour un membre connecté, il l'est aussi
// sur son compte (compte.js), et le suit d'un appareil à l'autre.
//
// Le site a été dessiné en sombre : toutes ses couleurs sont des variables
// (--ink, --text-on-ink…) que chaque page définit pour le sombre. Le mode
// clair les redéfinit ici, d'un seul endroit, pour toutes les pages.

const CLE_THEME = 'pokeclasseur-theme';
const THEMES = ['auto', 'clair', 'sombre'];

function themeChoisi(){
  try{
    const v = localStorage.getItem(CLE_THEME);
    return THEMES.includes(v) ? v : 'auto';
  }catch{ return 'auto'; }
}

const systemeSombre = () => {
  try{ return window.matchMedia('(prefers-color-scheme: dark)').matches; }
  catch{ return true; }
};

// Le thème réellement affiché : « auto » se résout selon l'appareil.
function themeAffiche(choix = themeChoisi()){
  if(choix === 'clair' || choix === 'sombre') return choix;
  return systemeSombre() ? 'sombre' : 'clair';
}

function appliquerTheme(choix = themeChoisi()){
  const theme = themeAffiche(choix);
  document.documentElement.dataset.theme = theme;
  // La barre des univers recopie la couleur du fond de la page
  // (univers.js) : elle doit suivre un changement de thème.
  const rail = document.querySelector('.rail');
  if(rail && document.body) rail.style.setProperty('--fond-rail', getComputedStyle(document.body).backgroundColor);
  document.dispatchEvent(new CustomEvent('pokeclasseur:theme', { detail: { choix, theme } }));
  return theme;
}

function choisirTheme(choix){
  if(!THEMES.includes(choix)) return;
  try{ localStorage.setItem(CLE_THEME, choix); }catch{ /* le choix vaudra pour cette page */ }
  appliquerTheme(choix);
}

// --- Affichage : taille des vignettes et contraste renforcé ------------
//
// Posés ici pour la même raison que le thème : avant le premier affichage,
// sans quoi la grille de cartes se réarrangerait sous les yeux.
const CLE_VIGNETTES = 'pokeclasseur-vignettes';
const CLE_CONTRASTE = 'pokeclasseur-contraste';
const TAILLES_VIGNETTES = ['compacte', 'normale', 'grande'];

function vignettesChoisies(){
  try{
    const v = localStorage.getItem(CLE_VIGNETTES);
    return TAILLES_VIGNETTES.includes(v) ? v : 'normale';
  }catch{ return 'normale'; }
}

function contrasteRenforce(){
  try{ return localStorage.getItem(CLE_CONTRASTE) === 'oui'; }catch{ return false; }
}

function appliquerAffichage(){
  document.documentElement.dataset.vignettes = vignettesChoisies();
  document.documentElement.dataset.contraste = contrasteRenforce() ? 'oui' : 'non';
}

function choisirAffichage({ vignettes, contraste } = {}){
  try{
    if(TAILLES_VIGNETTES.includes(vignettes)) localStorage.setItem(CLE_VIGNETTES, vignettes);
    if(typeof contraste === 'boolean') localStorage.setItem(CLE_CONTRASTE, contraste ? 'oui' : 'non');
  }catch{ /* le choix vaudra pour cette page */ }
  appliquerAffichage();
  // Mémoire refusée : la page suit quand même le choix.
  if(TAILLES_VIGNETTES.includes(vignettes)) document.documentElement.dataset.vignettes = vignettes;
  if(typeof contraste === 'boolean') document.documentElement.dataset.contraste = contraste ? 'oui' : 'non';
}

// Les couleurs du mode clair. Un papier crème plutôt qu'un blanc pur : le
// site évoque un classeur de cartes, et le blanc pur fatigue l'œil sur de
// grandes surfaces. Les ors et les bleus sont assombris : ceux du mode
// sombre, posés sur du clair, ne seraient plus lisibles.
//
// « --trait-rgb » sert aux bordures et aux fonds légers, écrits partout
// « rgba(var(--trait-rgb), 0.08) » : un voile clair sur fond sombre, un
// voile sombre sur fond clair.
const STYLE_THEME = `
  :root{
    --trait-rgb:237,234,224;
    --alerte:#E08862;
    --succes:#5FBAAA;
    --succes-fond:#EDF5F3;
    color-scheme:dark;
  }
  html[data-theme="clair"]{
    color-scheme:light;
    --ink:#F4F0E6;
    --ink-soft:#FFFDF8;
    --paper:#FFFDF8;
    --paper-line:#E2D8C2;
    --text-on-ink:#1E2127;
    --text-on-ink-dim:#5D6168;
    --text:#1E2127;
    --text-soft:#5D6168;
    --dim:#5D6168;
    --trait-rgb:30,33,39;
    --trait:rgba(30,33,39,0.16);
    --gold:#6B5005; --gold-rgb:107,80,5; --accent-clair:#5E4604;
    --teal:#1F6F63; --teal-deep:#123F38;
    --rust:#A8431C;
    --alerte:#A8431C;
    --succes:#1D6A5E;
    --succes-fond:#E3F0EC;
    --rouge-doux:#A8431C;
  }
  html[data-theme="clair"][data-univers="pocket"]{
    --gold:#1A5389; --gold-rgb:26,83,137; --accent-clair:#16497A;
  }
  html[data-theme="clair"] body{background:var(--ink);color:var(--text-on-ink)}
  html[data-theme="clair"] ::placeholder{color:#7C8087}
  html[data-theme="clair"] img.glyph,
  html[data-theme="clair"] .glyph{color:#A3A6AB}

  /* Taille des vignettes, sur les grilles de cartes. « normale » garde la
     grille de chaque page telle quelle. */
  html[data-vignettes="compacte"] .card-grid{grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}
  html[data-vignettes="grande"] .card-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}
  @media(max-width:960px){
    html[data-vignettes="compacte"] .card-grid{grid-template-columns:repeat(5,minmax(0,1fr))}
    html[data-vignettes="grande"] .card-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  }
  @media(max-width:720px){
    html[data-vignettes="compacte"] .card-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
    html[data-vignettes="grande"] .card-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  }
  @media(max-width:360px){
    html[data-vignettes="compacte"] .card-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
    html[data-vignettes="grande"] .card-grid{grid-template-columns:1fr}
  }

  /* Contraste renforcé : textes secondaires plus nets, accents plus
     appuyés, contour de sélection bien visible au clavier. */
  html[data-contraste="oui"]{
    --text-on-ink:#FFFFFF; --text-on-ink-dim:#D4D6D2;
    --accent-clair:#F4DF92; --trait-rgb:255,255,255;
  }
  html[data-contraste="oui"][data-theme="clair"]{
    --text-on-ink:#000000; --text-on-ink-dim:#2B2F35;
    --text:#000000; --text-soft:#2B2F35; --dim:#2B2F35;
    --gold:#4A3702; --gold-rgb:74,55,2; --accent-clair:#3E2E02;
    --trait-rgb:0,0,0; --alerte:#8A3312; --succes:#12524A;
  }
  html[data-contraste="oui"][data-theme="clair"][data-univers="pocket"]{
    --gold:#0F3A66; --gold-rgb:15,58,102; --accent-clair:#0C3157;
  }
  html[data-contraste="oui"] :focus-visible{outline:3px solid var(--gold,#C9A227) !important;outline-offset:2px}
  html[data-contraste="oui"] .tag-toggle:not(.active){opacity:.7}
`;

(function(){
  const style = document.createElement('style');
  style.id = 'style-theme';
  style.textContent = STYLE_THEME;
  // En tête du <head> : les styles propres à chaque page viennent après et
  // gardent la main pour le sombre ; le clair, plus précis
  // (html[data-theme="clair"]), l'emporte sur leurs « :root ».
  document.head.prepend(style);
  appliquerTheme();
  appliquerAffichage();

  // En « auto », suivre l'appareil s'il change en cours de visite (bascule
  // automatique le soir, par exemple).
  try{
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if(themeChoisi() === 'auto') appliquerTheme('auto');
    });
  }catch{ /* navigateur ancien : le thème restera celui du chargement */ }

  // Un autre onglet a changé le thème : celui-ci suit.
  window.addEventListener('storage', e => {
    if(e.key === CLE_THEME) appliquerTheme();
    if(e.key === CLE_VIGNETTES || e.key === CLE_CONTRASTE) appliquerAffichage();
  });
})();
