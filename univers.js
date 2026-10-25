const UNIVERS = {
  pocket: {
    cle: 'pocket',
    nom: 'TCG Pocket',
    court: 'Pocket',
    icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10.5 18.3h3"/></svg>',
    logo: 'images/jeux/tcg-pocket.png',
  },
  physique: {
    cle: 'physique',
    nom: 'TCG physique',
    court: 'Physique',
    icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8.5 3H18a2 2 0 0 1 2 2v11"/></svg>',
    logo: 'images/jeux/tcg-physique.png',
  },
};

const MEMOIRE_UNIVERS = 'pokeclasseur_univers';

const PHYSIQUE_OUVERT_A_TOUS = false;

const INDICE_ADMIN = 'pokeclasseur-admin-indice';

function indiceAdmin(){
  try{ return sessionStorage.getItem(INDICE_ADMIN) === 'oui'; }catch(err){ return false; }
}
function physiqueAccessible(){
  return PHYSIQUE_OUVERT_A_TOUS || indiceAdmin();
}

let universRefuse = null;

function universDemande(){
  let voulu = 'pocket';
  const demande = new URLSearchParams(window.location.search).get('u');
  if(demande && UNIVERS[demande]) voulu = demande;
  else{
    try{
      const retenu = localStorage.getItem(MEMOIRE_UNIVERS);
      if(retenu && UNIVERS[retenu]) voulu = retenu;
    }catch(err){}
  }
  if(voulu === 'physique' && !physiqueAccessible()){
    universRefuse = 'physique';
    return 'pocket';
  }
  return voulu;
}

let universCourant = universDemande();

function universActuel(){ return UNIVERS[universCourant]; }
function estPocket(){ return universCourant === 'pocket'; }

function appartientAUnivers(setId){
  return isPocketSet(setId) === estPocket();
}

function avecUnivers(href, cle = universCourant){
  try{
    const url = new URL(href, window.location.href);
    if(url.origin !== window.location.origin) return href;
    if(!url.pathname.endsWith('.html')) return href;
    url.searchParams.set('u', cle);
    return url.pathname + url.search + url.hash;
  }catch(err){
    return href;
  }
}

function cibleBascule(cle){
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if(page === 'extension.html') return avecUnivers('series.html', cle);
  const PROPRES_A_UN_UNIVERS = ['missions.html', 'classeurs.html'];
  if(PROPRES_A_UN_UNIVERS.includes(page) && cle !== universCourant){
    return avecUnivers('series.html', cle);
  }
  return avecUnivers(window.location.pathname + window.location.search, cle);
}

function adopterUnivers(cle){
  if(!UNIVERS[cle] || cle === universCourant) return true;
  if(cle === 'physique' && !physiqueAccessible()){
    universRefuse = 'physique';
    return false;
  }
  universCourant = cle;
  memoriserUnivers();
  document.documentElement.dataset.univers = cle;
  document.querySelectorAll('.rail-item').forEach(a => {
    a.classList.toggle('on', a.dataset.cible === cle);
  });
  return true;
}

function memoriserUnivers(){
  try{ localStorage.setItem(MEMOIRE_UNIVERS, universCourant); }catch(err){}
}

const STYLE_RAIL = `
  .navlinks a[hidden]{display:none !important}
  .navlinks a{white-space:nowrap}
  @media(min-width:1081px) and (max-width:1240px){
    .navlinks{gap:clamp(12px, calc(4vw - 18px), 32px) !important}
  }
  @media(min-width:721px) and (max-width:1080px){
    nav:has(.navlinks){flex-wrap:wrap;row-gap:14px}
    .navlinks{order:3;width:100%;justify-content:space-between;gap:10px !important}
  }
  @media(min-width:721px) and (max-width:860px){
    .navlinks{font-size:13px !important}
  }
  html[data-univers="pocket"]{
    --gold:#4B96D8; --gold-rgb:75,150,216; --accent-clair:#8CC4EC;
  }

  body{padding-left:56px;}

  button.rail-item{font:inherit;cursor:pointer;background:none;border-top:0;border-right:0;border-bottom:0}
  .rail-item.a-venir-onglet,.rail:hover .rail-item.a-venir-onglet,
  .rail:focus-within .rail-item.a-venir-onglet{opacity:1}
  .a-venir-onglet svg,.a-venir-onglet .rail-nom{opacity:.5}
  .a-venir-onglet .rail-logo{filter:grayscale(.6)}
  .rail-badge{font-size:8.5px;line-height:1;letter-spacing:.2px;padding:3px 5px;border-radius:999px;
              background:rgba(var(--teinte-rgb),.18);color:var(--teinte);white-space:nowrap}
  .rail-badge-prive{background:rgba(140,140,140,.18);color:#B9BCB9}
  .rail-badge-a-venir{position:relative;z-index:1;font-size:10px;font-weight:700;letter-spacing:.3px;
    padding:5px 8px;background:#C9A227;color:#15171A;
    box-shadow:0 0 0 0 rgba(201,162,39,.55);animation:a-venir-pouls 2.4s ease-out infinite}
  .rail:hover .rail-badge-a-venir,.rail:focus-within .rail-badge-a-venir{margin-top:84px;font-size:12px;padding:6px 12px}
  @keyframes a-venir-pouls{
    0%{box-shadow:0 0 0 0 rgba(201,162,39,.55)}
    70%,100%{box-shadow:0 0 0 7px rgba(201,162,39,0)}
  }

  #a-venir-annonce{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:9500;
    width:min(460px,calc(100vw - 32px));box-sizing:border-box;padding:14px 44px 14px 16px;border-radius:12px;
    background:#1B1E24;color:#EDEAE0;border:1px solid rgba(201,162,39,.55);
    box-shadow:0 10px 30px rgba(0,0,0,.45);font-size:14px;line-height:1.5}
  #a-venir-annonce strong{display:block;color:#E3C766;margin-bottom:4px}
  #a-venir-annonce p{margin:0;color:#EDEAE0;font-size:15px}
  #a-venir-annonce button{position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:50%;
    border:1px solid rgba(255,255,255,.2);background:none;color:#EDEAE0;cursor:pointer;font-size:17px;line-height:1}

  .a-venir{max-width:520px;margin:48px auto;padding:34px 26px;text-align:center;border-radius:16px;
    border:1px solid rgba(201,162,39,.35);background:rgba(201,162,39,.05)}
  .a-venir-icone{display:inline-flex;color:#C9A227}
  .a-venir-icone svg{width:42px;height:42px}
  .a-venir h2{margin:12px 0 10px}
  .a-venir p{color:var(--text-on-ink-dim,#9B9E9C);line-height:1.6;margin:0 0 20px}
  .a-venir-lien{display:inline-block;padding:11px 20px;border-radius:999px;text-decoration:none;
    background:#4B96D8;color:#fff;font-weight:600}
  .rail-item[data-cible="physique"]{--teinte:#C9A227;--teinte-rgb:201,162,39;}
  .rail-item[data-cible="pocket"]  {--teinte:#4B96D8;--teinte-rgb:75,150,216;}

  .rail:hover,.rail:focus-within{width:196px}
  @media(hover:hover) and (min-width:721px){
    body{transition:padding-left .2s ease}
    body:has(> .rail:hover),body:has(> .rail:focus-within){padding-left:196px}
  }
  @media(min-width:721px){
    .wrap{margin-left:calc((100% - min(100%, 1080px)) / 4) !important;margin-right:auto !important}
  }
  .rail:hover .rail-compact,.rail:focus-within .rail-compact{opacity:0}
  .rail:hover .rail-logo,.rail:focus-within .rail-logo{opacity:1}
  .rail:hover .rail-item,.rail:focus-within .rail-item{opacity:.75}
  .rail:hover .rail-item.on,.rail:focus-within .rail-item.on{opacity:1}

  .rail{position:fixed;left:0;top:0;bottom:0;width:56px;z-index:60;
        transition:width .2s ease;
        display:flex;flex-direction:column;flex-wrap:nowrap;
        align-items:stretch;justify-content:stretch;gap:0;
        margin:0;padding:0;border-bottom:none;
        border-right:1px solid rgba(140,140,140,0.16);background:var(--fond-rail,transparent);}

  .rail-item{flex:1 1 0;display:flex;flex-direction:column;
             align-items:center;justify-content:center;gap:7px;
             width:auto;padding:0;border-radius:0;text-decoration:none;
             color:var(--teinte);opacity:.42;
             border-left:3px solid transparent;
             transition:opacity .15s,background .15s,border-color .15s;}
  .rail-item + .rail-item{border-top:1px solid rgba(140,140,140,0.22)}
  .rail-item:hover{opacity:.78;background:rgba(var(--teinte-rgb),0.10)}
  .rail-item.on{opacity:1;background:rgba(var(--teinte-rgb),0.15);
                border-left-color:var(--teinte);}
  .rail-item svg{width:21px;height:21px;display:block}
  .rail-nom{font-size:9.5px;letter-spacing:.2px;line-height:1;}

  .rail-item{position:relative;overflow:hidden}
  .rail-compact{display:flex;flex-direction:column;align-items:center;gap:7px;
                transition:opacity .16s;}
  .rail-logo{position:absolute;width:150px;max-width:none;height:auto;
             opacity:0;pointer-events:none;transition:opacity .2s;}

  @media(hover:none){
    .rail:hover,.rail:focus-within{width:56px}
    .rail:hover .rail-compact,.rail:focus-within .rail-compact{opacity:1}
    .rail-logo{display:none}
    .rail:hover .rail-badge-a-venir,.rail:focus-within .rail-badge-a-venir{margin-top:0;font-size:10px;padding:5px 8px}
  }
  @media(prefers-reduced-motion:reduce){
    .rail,.rail-compact,.rail-logo,body{transition:none}
    .rail-badge-a-venir{animation:none}
  }

  @media(max-width:720px){
    body{padding-left:0}
    .rail{position:sticky;top:0;left:auto;bottom:auto;width:100%;height:auto;
          flex-direction:row;flex-wrap:nowrap;justify-content:stretch;gap:0;padding:0;
          border-right:none;border-bottom:1px solid rgba(140,140,140,0.16);}
    .rail-item{flex:1 1 0;flex-direction:row;justify-content:center;gap:8px;
               width:auto;padding:13px 0;border-radius:0;
               border-left:none;border-bottom:3px solid transparent}
    .rail-item + .rail-item{border-top:none;border-left:1px solid rgba(140,140,140,0.22)}
    .rail-item.on{border-left-color:transparent;border-bottom-color:var(--teinte)}
    .rail-item svg{width:17px;height:17px}
    .rail-nom{font-size:12px}
    .rail:hover,.rail:focus-within{width:100%}
    .rail:hover .rail-compact,.rail:focus-within .rail-compact{opacity:1}
    .rail-logo{display:none}
    .rail:hover .rail-badge-a-venir,.rail:focus-within .rail-badge-a-venir{margin-top:0;font-size:10px;padding:5px 8px}
  }
  html[data-theme="clair"] .rail{background:#E7E0D0;border-right:1px solid rgba(30,33,39,0.16)}
  html[data-theme="clair"] .rail-item[data-cible="physique"]{--teinte:#6B5005;--teinte-rgb:107,80,5;}
  html[data-theme="clair"] .rail-item[data-cible="pocket"]  {--teinte:#1A5389;--teinte-rgb:26,83,137;}
  html[data-theme="clair"] .rail-item{opacity:.8}
  html[data-theme="clair"] .rail-item.on{opacity:1;background:rgba(var(--teinte-rgb),0.13)}
  html[data-theme="clair"] .rail-item + .rail-item{border-top-color:rgba(30,33,39,0.14)}
  html[data-theme="clair"] .rail-nom{font-weight:600}
  html[data-theme="clair"] .a-venir-onglet svg,html[data-theme="clair"] .a-venir-onglet .rail-nom{opacity:.85}
  html[data-theme="clair"] .rail:hover .rail-item,html[data-theme="clair"] .rail:focus-within .rail-item{opacity:.9}
  html[data-theme="clair"] .rail:hover .rail-item.on,html[data-theme="clair"] .rail:focus-within .rail-item.on{opacity:1}
  @media(max-width:720px){
    html[data-theme="clair"] .rail{border-right:none;border-bottom:1px solid rgba(30,33,39,0.16)}
    html[data-theme="clair"] .rail-item + .rail-item{border-left-color:rgba(30,33,39,0.14)}
  }
`;

function ongletDUnivers(u){
  const verrouille = u.cle === 'physique' && !physiqueAccessible();
  if(verrouille){
    return `
    <button type="button" class="rail-item a-venir-onglet" data-cible="${u.cle}"
            title="${u.nom} (à venir)">
      <span class="rail-compact">${u.icone}<span class="rail-nom">${u.court}</span></span>
      <span class="rail-badge rail-badge-a-venir">À venir</span>
      <img class="rail-logo" src="${u.logo}" alt="" aria-hidden="true" loading="lazy">
    </button>`;
  }
  const prive = u.cle === 'physique' && !PHYSIQUE_OUVERT_A_TOUS;
  return `
    <a class="rail-item ${u.cle === universCourant ? 'on' : ''}" data-cible="${u.cle}"
       href="${cibleBascule(u.cle)}"
       title="${u.nom}${prive ? ' (visible par toi seul pour l\'instant)' : ''}"
       ${u.cle === universCourant ? 'aria-current="page"' : ''}>
      <span class="rail-compact">${u.icone}<span class="rail-nom">${u.court}</span>
        ${prive ? '<span class="rail-badge rail-badge-prive">Privé</span>' : ''}</span>
      <img class="rail-logo" src="${u.logo}" alt="" aria-hidden="true" loading="lazy">
    </a>`;
}

const TEXTE_A_VENIR = 'La partie TCG Physique sera très bientôt disponible, nous sommes en train de la finaliser.';

function brancherOngletAVenir(rail){
  const bouton = rail.querySelector('.a-venir-onglet');
  if(!bouton) return;
  bouton.addEventListener('click', () => annoncerAVenir());
}

function annoncerAVenir(){
  document.getElementById('a-venir-annonce')?.remove();
  const a = document.createElement('div');
  a.id = 'a-venir-annonce';
  a.setAttribute('role', 'status');
  a.innerHTML = `
    <p>${TEXTE_A_VENIR}</p>
    <button type="button" aria-label="Fermer">×</button>`;
  a.querySelector('button').onclick = () => a.remove();
  document.body.appendChild(a);
  clearTimeout(annoncerAVenir.minuteur);
  annoncerAVenir.minuteur = setTimeout(() => a.remove(), 9000);
}

function blocAVenir(){
  return `
    <div class="a-venir">
      <span class="a-venir-icone" aria-hidden="true">${UNIVERS.physique.icone}</span>
      <h2>TCG Physique : à venir</h2>
      <p>${TEXTE_A_VENIR}</p>
      <a class="a-venir-lien" href="${avecUnivers('series.html', 'pocket')}">Voir le TCG Pocket</a>
    </div>`;
}

async function verifierAccesPhysique(){
  if(PHYSIQUE_OUVERT_A_TOUS) return;
  const avait = indiceAdmin();
  let admin = false;
  if(typeof verifierAdmin === 'function'){
    try{ admin = (await verifierAdmin()).admin === true; }catch(err){ admin = false; }
  }
  try{
    if(admin) sessionStorage.setItem(INDICE_ADMIN, 'oui');
    else sessionStorage.removeItem(INDICE_ADMIN);
  }catch(err){}

  if(admin && !avait && (universRefuse === 'physique' || document.querySelector('.a-venir'))){
    location.replace(avecUnivers(location.pathname + location.search, 'physique'));
    return;
  }
  if(!admin && avait){
    location.replace(avecUnivers(location.pathname + location.search, 'pocket'));
    return;
  }
  if(!admin && universRefuse === 'physique' && !document.querySelector('.a-venir')) annoncerAVenir();
}

function poserRail(){
  document.documentElement.dataset.univers = universCourant;
  memoriserUnivers();

  const style = document.createElement('style');
  style.textContent = STYLE_RAIL;
  document.head.appendChild(style);

  const rail = document.createElement('nav');
  rail.className = 'rail';
  rail.setAttribute('aria-label', 'Univers');
  rail.innerHTML = Object.values(UNIVERS).map(ongletDUnivers).join('');
  document.body.prepend(rail);
  brancherOngletAVenir(rail);

  rail.style.setProperty('--fond-rail', getComputedStyle(document.body).backgroundColor);
}

function propagerLien(a){
  if(a.closest('.rail')) return;
  const neuf = avecUnivers(a.getAttribute('href'));
  if(neuf !== a.getAttribute('href')) a.setAttribute('href', neuf);
}

function propagerUnivers(){
  document.querySelectorAll('a[href]').forEach(propagerLien);
}

function masquerLiensHorsUnivers(){
  document.querySelectorAll('.lien-pocket').forEach(a => { a.hidden = !estPocket(); });
  document.querySelectorAll('.lien-physique').forEach(a => { a.hidden = estPocket(); });
}

function initUnivers(){
  poserRail();
  verifierAccesPhysique();
  propagerUnivers();
  masquerLiensHorsUnivers();

  const guetteur = new MutationObserver(lots => {
    for(const lot of lots){
      if(lot.type === 'attributes'){ propagerLien(lot.target); continue; }
      for(const noeud of lot.addedNodes){
        if(noeud.nodeType !== 1) continue;
        if(noeud.matches?.('a[href]')) propagerLien(noeud);
        noeud.querySelectorAll?.('a[href]').forEach(propagerLien);
      }
    }
  });
  guetteur.observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['href'],
  });

  document.addEventListener('click', (e) => {
    const lien = e.target.closest('a[href]');
    if(!lien || lien.closest('.rail')) return;
    const neuf = avecUnivers(lien.getAttribute('href'));
    if(neuf !== lien.getAttribute('href')) lien.setAttribute('href', neuf);
  }, true);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initUnivers);
}else{
  initUnivers();
}
