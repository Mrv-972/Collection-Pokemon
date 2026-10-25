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

function themeAffiche(choix = themeChoisi()){
  if(choix === 'clair' || choix === 'sombre') return choix;
  return systemeSombre() ? 'sombre' : 'clair';
}

function appliquerTheme(choix = themeChoisi()){
  const theme = themeAffiche(choix);
  document.documentElement.dataset.theme = theme;
  const rail = document.querySelector('.rail');
  if(rail && document.body) rail.style.setProperty('--fond-rail', getComputedStyle(document.body).backgroundColor);
  document.dispatchEvent(new CustomEvent('pokeclasseur:theme', { detail: { choix, theme } }));
  return theme;
}

function choisirTheme(choix){
  if(!THEMES.includes(choix)) return;
  try{ localStorage.setItem(CLE_THEME, choix); }catch{ }
  appliquerTheme(choix);
}

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
  }catch{ }
  appliquerAffichage();
  if(TAILLES_VIGNETTES.includes(vignettes)) document.documentElement.dataset.vignettes = vignettes;
  if(typeof contraste === 'boolean') document.documentElement.dataset.contraste = contraste ? 'oui' : 'non';
}

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
  document.head.prepend(style);
  appliquerTheme();
  appliquerAffichage();

  try{
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if(themeChoisi() === 'auto') appliquerTheme('auto');
    });
  }catch{ }

  window.addEventListener('storage', e => {
    if(e.key === CLE_THEME) appliquerTheme();
    if(e.key === CLE_VIGNETTES || e.key === CLE_CONTRASTE) appliquerAffichage();
  });
})();
