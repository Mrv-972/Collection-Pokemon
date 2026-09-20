// Les deux univers du site.
//
// PokéClasseur couvre deux jeux qui portent le même nom mais ne se jouent
// pas pareil : les cartes physiques qu'on range dans un classeur et qu'on
// s'envoie par la poste, et Pokémon TCG Pocket, l'application mobile où les
// cartes sont virtuelles et les échanges se font dans le jeu.
//
// Mélanger les deux n'aurait servi personne : on ne troque pas une carte
// d'application contre une carte de carton. Le site se partage donc en deux
// moitiés étanches côté cartes — chacune son catalogue, ses classeurs, ses
// mises en relation — tandis que le compte et la messagerie restent communs :
// c'est la même personne des deux côtés.
//
// L'univers courant voyage dans l'adresse (?u=pocket) pour qu'un lien
// partagé arrive au bon endroit, et se retient d'une visite à l'autre pour
// qu'un signet nu ramène là où on s'était arrêté.

const UNIVERS = {
  physique: {
    cle: 'physique',
    nom: 'TCG physique',
    court: 'Physique',
    // Deux cartes l'une derrière l'autre.
    icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8.5 3H18a2 2 0 0 1 2 2v11"/></svg>',
    logo: 'images/jeux/tcg-physique.png',
  },
  pocket: {
    cle: 'pocket',
    nom: 'TCG Pocket',
    court: 'Pocket',
    // Un téléphone.
    icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10.5 18.3h3"/></svg>',
    logo: 'images/jeux/tcg-pocket.png',
  },
};

const MEMOIRE_UNIVERS = 'pokeclasseur_univers';

function universDemande(){
  const demande = new URLSearchParams(window.location.search).get('u');
  if(demande && UNIVERS[demande]) return demande;
  try{
    const retenu = localStorage.getItem(MEMOIRE_UNIVERS);
    if(retenu && UNIVERS[retenu]) return retenu;
  }catch(err){}
  return 'physique';
}

let universCourant = universDemande();

function universActuel(){ return UNIVERS[universCourant]; }
function estPocket(){ return universCourant === 'pocket'; }

// Le filtre unique dont dépendent le catalogue, les pages Pokémon et les
// échanges : une extension appartient à l'univers courant, ou non.
function appartientAUnivers(setId){
  return isPocketSet(setId) === estPocket();
}

// Ajoute l'univers à une adresse interne, sans toucher à ce qui s'y trouve
// déjà (le numéro d'extension, le Pokémon demandé...).
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

// Où mène la bascule d'univers. Une page attachée à une extension précise
// n'a pas d'équivalent en face : on retombe alors sur le catalogue. Une page
// de Pokémon, si — le même Pokémon existe des deux côtés.
function cibleBascule(cle){
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if(page === 'extension.html') return avecUnivers('series.html', cle);
  return avecUnivers(window.location.pathname + window.location.search, cle);
}

// Change d'univers sans recharger : sert quand on ouvre le lien partagé
// d'une extension qui n'appartient pas à l'univers retenu.
function adopterUnivers(cle){
  if(!UNIVERS[cle] || cle === universCourant) return;
  universCourant = cle;
  memoriserUnivers();
  document.documentElement.dataset.univers = cle;
  document.querySelectorAll('.rail-item').forEach(a => {
    a.classList.toggle('on', a.dataset.cible === cle);
  });
}

function memoriserUnivers(){
  try{ localStorage.setItem(MEMOIRE_UNIVERS, universCourant); }catch(err){}
}

// ---------------------------------------------------- barre latérale ----

// Le style est injecté ici plutôt que recopié dans les huit pages : une
// seule définition à corriger le jour où elle bouge.
const STYLE_RAIL = `
  /* L'accent du site change avec l'univers : doré pour le carton, bleu pour
     l'application. C'est le signal le plus économique pour savoir d'un coup
     d'œil de quel côté on se trouve — plus sûr qu'un libellé qu'on finit par
     ne plus lire. */
  html[data-univers="pocket"]{
    --gold:#4B96D8; --gold-rgb:75,150,216; --accent-clair:#8CC4EC;
  }

  body{padding-left:56px;}
  /* La barre est un <nav>, et chaque page habille déjà ses <nav> : sans ces
     remises à zéro explicites, elle héritait du justify-content:space-between
     de la barre du haut et se retrouvait avec un univers en haut de l'écran
     et l'autre tout en bas. */
  /* Chaque univers porte sa couleur, écrite en dur et non tirée de --gold :
     cette variable vaut justement bleu quand on est côté Pocket, si bien que
     les deux moitiés auraient viré ensemble. Ici on veut que le jaune
     désigne toujours le jeu physique et le bleu toujours Pocket, quel que
     soit celui où l'on se trouve — c'est ce qui en fait un repère. */
  .rail-item[data-cible="physique"]{--teinte:#C9A227;--teinte-rgb:201,162,39;}
  .rail-item[data-cible="pocket"]  {--teinte:#4B96D8;--teinte-rgb:75,150,216;}

  /* Au survol, la barre s'élargit et montre les logos des deux jeux. Elle
     passe PAR-DESSUS la page plutôt que de la pousser : « body » garde son
     retrait de 56 px, donc rien ne se déplace sous le curseur.

     « focus-within » accompagne « hover » : quelqu'un qui navigue au clavier
     arrive dans la barre sans souris, et doit voir la même chose. */
  .rail:hover,.rail:focus-within{width:196px}
  .rail:hover .rail-compact,.rail:focus-within .rail-compact{opacity:0}
  .rail:hover .rail-logo,.rail:focus-within .rail-logo{opacity:1}
  /* Barre ouverte, on remonte l'univers qu'on ne lit pas de 42 % à 75 % :
     à 42 %, son logo se devinait plus qu'il ne se lisait, ce qui vide
     l'élargissement de son intérêt. L'écart avec l'univers courant, resté à
     100 %, suffit à dire lequel est actif. */
  .rail:hover .rail-item,.rail:focus-within .rail-item{opacity:.75}
  .rail:hover .rail-item.on,.rail:focus-within .rail-item.on{opacity:1}

  .rail{position:fixed;left:0;top:0;bottom:0;width:56px;z-index:60;
        transition:width .2s ease;
        display:flex;flex-direction:column;flex-wrap:nowrap;
        align-items:stretch;justify-content:stretch;gap:0;
        margin:0;padding:0;border-bottom:none;
        border-right:1px solid rgba(140,140,140,0.16);background:var(--fond-rail,transparent);}

  /* « flex:1 1 0 » et non « 1 1 auto » : sans base nulle, la moitié dont le
     libellé est le plus long prendrait plus de place que l'autre. */
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

  /* Les deux formes se superposent au même endroit et se croisent en
     fondu : le logo est en position absolue pour que l'icône n'ait pas à
     lui céder la place, ce qui ferait sauter la mise en page pendant
     l'élargissement. */
  .rail-item{position:relative;overflow:hidden}
  .rail-compact{display:flex;flex-direction:column;align-items:center;gap:7px;
                transition:opacity .16s;}
  .rail-logo{position:absolute;width:150px;max-width:none;height:auto;
             opacity:0;pointer-events:none;transition:opacity .2s;}

  /* Sans souris ni clavier, une barre qui grandit ne sert à rien et pourrait
     s'ouvrir sur un effleurement. Sur ces appareils, elle reste fixe. */
  @media(hover:none){
    .rail:hover,.rail:focus-within{width:56px}
    .rail:hover .rail-compact,.rail:focus-within .rail-compact{opacity:1}
    .rail-logo{display:none}
  }
  @media(prefers-reduced-motion:reduce){
    .rail,.rail-compact,.rail-logo{transition:none}
  }

  /* Sur téléphone, une colonne de 56 px prendrait un septième de la largeur.
     La barre passe donc en haut, collée au défilement, en deux onglets. */
  @media(max-width:720px){
    body{padding-left:0}
    .rail{position:sticky;top:0;left:auto;bottom:auto;width:100%;height:auto;
          flex-direction:row;flex-wrap:nowrap;justify-content:stretch;gap:0;padding:0;
          border-right:none;border-bottom:1px solid rgba(140,140,140,0.16);}
    .rail-item{flex:1 1 0;flex-direction:row;justify-content:center;gap:8px;
               width:auto;padding:13px 0;border-radius:0;
               border-left:none;border-bottom:3px solid transparent}
    /* La séparation et le repère actif tournent avec la barre : trait
       vertical entre les deux moitiés, soulignement sous celle qu'on lit. */
    .rail-item + .rail-item{border-top:none;border-left:1px solid rgba(140,140,140,0.22)}
    .rail-item.on{border-left-color:transparent;border-bottom-color:var(--teinte)}
    .rail-item svg{width:17px;height:17px}
    .rail-nom{font-size:12px}
    /* En barre du haut, il n'y a pas de largeur à gagner : les logos
       resteraient illisibles et la forme compacte dit déjà tout. */
    .rail:hover,.rail:focus-within{width:100%}
    .rail:hover .rail-compact,.rail:focus-within .rail-compact{opacity:1}
    .rail-logo{display:none}
  }
`;

function poserRail(){
  document.documentElement.dataset.univers = universCourant;
  // L'univers lu dans l'adresse vaut choix : sans cette ligne, revenir sur
  // le site par un signet nu ramenait toujours au physique, quel que soit
  // le côté où l'on s'était arrêté.
  memoriserUnivers();

  const style = document.createElement('style');
  style.textContent = STYLE_RAIL;
  document.head.appendChild(style);

  const rail = document.createElement('nav');
  rail.className = 'rail';
  rail.setAttribute('aria-label', 'Univers');
  rail.innerHTML = Object.values(UNIVERS).map(u => `
    <a class="rail-item ${u.cle === universCourant ? 'on' : ''}" data-cible="${u.cle}"
       href="${cibleBascule(u.cle)}" title="${u.nom}"
       ${u.cle === universCourant ? 'aria-current="page"' : ''}>
      <span class="rail-compact">${u.icone}<span class="rail-nom">${u.court}</span></span>
      <img class="rail-logo" src="${u.logo}" alt="" aria-hidden="true" loading="lazy">
    </a>
  `).join('');
  document.body.prepend(rail);

  // La barre est collante en haut sur téléphone : il lui faut un fond opaque,
  // qu'on prend sur la page plutôt que de le redire ici.
  rail.style.setProperty('--fond-rail', getComputedStyle(document.body).backgroundColor);
}

// Tous les liens internes emportent l'univers courant. On le fait à deux
// moments : au chargement, pour que l'adresse affichée au survol soit juste,
// et au clic, qui seul rattrape les liens créés après coup — une vignette
// d'extension, un bouton « Lui écrire ».
function propagerLien(a){
  if(a.closest('.rail')) return;
  const neuf = avecUnivers(a.getAttribute('href'));
  if(neuf !== a.getAttribute('href')) a.setAttribute('href', neuf);
}

function propagerUnivers(){
  document.querySelectorAll('a[href]').forEach(propagerLien);
}

function initUnivers(){
  poserRail();
  propagerUnivers();

  // Les pages construisent l'essentiel de leurs liens après coup : vignettes
  // d'extensions, boutons « Lui écrire »... On repasse donc à chaque arrivée
  // de contenu, pour que l'adresse lue au survol soit déjà la bonne.
  // On surveille aussi les adresses réécrites en place — compte.js remet la
  // sienne à jour au fil de la connexion — sans quoi elles repartiraient
  // sans univers. La réécriture ne se déclenche pas elle-même : quand
  // l'adresse porte déjà le bon univers, rien n'est écrit.
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

  // Le clic reste le filet de sécurité : il rattrape ce qui aurait échappé
  // au guetteur, quelle qu'en soit la raison.
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
