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

// Pocket en premier : c'est la partie du site qui est terminée.
const UNIVERS = {
  pocket: {
    cle: 'pocket',
    nom: 'TCG Pocket',
    court: 'Pocket',
    // Un téléphone.
    icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10.5 18.3h3"/></svg>',
    logo: 'images/jeux/tcg-pocket.png',
  },
  physique: {
    cle: 'physique',
    nom: 'TCG physique',
    court: 'Physique',
    // Deux cartes l'une derrière l'autre.
    icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8.5 3H18a2 2 0 0 1 2 2v11"/></svg>',
    logo: 'images/jeux/tcg-physique.png',
  },
};

const MEMOIRE_UNIVERS = 'pokeclasseur_univers';

// --------------------------------------------- le TCG physique, à venir ----
//
// Le TCG physique n'est pas encore ouvert aux membres : des centaines de
// cartes n'y ont pas encore de visuel français. Il reste accessible à
// l'administrateur, qui y travaille. Le jour où il sera prêt, passer cette
// constante à true l'ouvre à tous, sans rien d'autre à toucher.
const PHYSIQUE_OUVERT_A_TOUS = false;

// L'administrateur ne se reconnaît qu'en interrogeant la base, ce qui prend
// un instant — trop tard pour choisir l'univers avant que la page ne se
// dessine. On garde donc, le temps d'une visite, l'INDICE qu'on l'est déjà.
//
// Cet indice n'est pas une protection, et n'a pas à l'être : il ne donne
// accès à aucune écriture, et les fichiers du TCG physique sont de toute
// façon publics sur le serveur. Ce verrou dit « pas encore prêt », pas
// « secret ». Il est revérifié auprès de la base à chaque page : un indice
// périmé ou fabriqué ramène aussitôt côté Pocket.
const INDICE_ADMIN = 'pokeclasseur-admin-indice';

function indiceAdmin(){
  try{ return sessionStorage.getItem(INDICE_ADMIN) === 'oui'; }catch(err){ return false; }
}
function physiqueAccessible(){
  return PHYSIQUE_OUVERT_A_TOUS || indiceAdmin();
}

// Le physique a été demandé — par l'adresse, le souvenir de la dernière
// visite, ou un lien d'extension — et refusé. On s'en souvient pour, si
// l'administrateur se révèle, le ramener là où il voulait aller.
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

// Où mène la bascule d'univers. Certaines pages n'ont pas d'équivalent en
// face : une extension précise, et les missions secrètes, qui sont une
// mécanique propre à l'application mobile. On retombe alors sur le
// catalogue. Une page de Pokémon, elle, a son équivalent : le même Pokémon
// existe des deux côtés.
function cibleBascule(cle){
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if(page === 'extension.html') return avecUnivers('series.html', cle);
  // Les missions n'existent que du côté Pocket, les classeurs que du côté
  // physique : passer en face mène au catalogue, mais rester de son côté
  // doit laisser la page où elle est.
  const PROPRES_A_UN_UNIVERS = ['missions.html', 'classeurs.html'];
  if(PROPRES_A_UN_UNIVERS.includes(page) && cle !== universCourant){
    return avecUnivers('series.html', cle);
  }
  return avecUnivers(window.location.pathname + window.location.search, cle);
}

// Change d'univers sans recharger : sert quand on ouvre le lien partagé
// d'une extension qui n'appartient pas à l'univers retenu.
function adopterUnivers(cle){
  if(!UNIVERS[cle] || cle === universCourant) return true;
  // Un lien vers une extension physique ne fait pas basculer un membre :
  // la page appelante affiche alors « À venir » à la place.
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

// ---------------------------------------------------- barre latérale ----

// Le style est injecté ici plutôt que recopié dans les huit pages : une
// seule définition à corriger le jour où elle bouge.
const STYLE_RAIL = `
  /* Un lien masqué le reste, quelle que soit la mise en page de la barre. */
  .navlinks a[hidden]{display:none !important}
  /* L'accent du site change avec l'univers : doré pour le carton, bleu pour
     l'application. C'est le signal le plus économique pour savoir d'un coup
     d'œil de quel côté on se trouve — plus sûr qu'un libellé qu'on finit par
     ne plus lire. */
  html[data-univers="pocket"]{
    --gold:#4B96D8; --gold-rgb:75,150,216; --accent-clair:#8CC4EC;
  }

  body{padding-left:56px;}

  /* L'onglet du physique fermé : présent, pour qu'on sache qu'il existe,
     mais visiblement en attente. */
  button.rail-item{font:inherit;cursor:pointer;background:none;border-top:0;border-right:0;border-bottom:0}
  .a-venir-onglet{opacity:.55}
  .rail-badge{font-size:8.5px;line-height:1;letter-spacing:.2px;padding:3px 5px;border-radius:999px;
              background:rgba(var(--teinte-rgb),.18);color:var(--teinte);white-space:nowrap}
  .rail-badge-prive{background:rgba(140,140,140,.18);color:#B9BCB9}

  #a-venir-annonce{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:9500;
    width:min(460px,calc(100vw - 32px));box-sizing:border-box;padding:14px 44px 14px 16px;border-radius:12px;
    background:#1B1E24;color:#EDEAE0;border:1px solid rgba(201,162,39,.55);
    box-shadow:0 10px 30px rgba(0,0,0,.45);font-size:14px;line-height:1.5}
  #a-venir-annonce strong{display:block;color:#E3C766;margin-bottom:4px}
  #a-venir-annonce p{margin:0;color:#B9BCB9}
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

function ongletDUnivers(u){
  const verrouille = u.cle === 'physique' && !physiqueAccessible();
  if(verrouille){
    // Un bouton, pas un lien : il n'y a nulle part où aller pour l'instant.
    return `
    <button type="button" class="rail-item a-venir-onglet" data-cible="${u.cle}"
            title="${u.nom} — à venir" aria-describedby="a-venir-aide">
      <span class="rail-compact">${u.icone}<span class="rail-nom">${u.court}</span>
        <span class="rail-badge">À venir</span></span>
      <img class="rail-logo" src="${u.logo}" alt="" aria-hidden="true" loading="lazy">
    </button>`;
  }
  // L'administrateur voit le physique, avec un rappel que lui seul le voit.
  const prive = u.cle === 'physique' && !PHYSIQUE_OUVERT_A_TOUS;
  return `
    <a class="rail-item ${u.cle === universCourant ? 'on' : ''}" data-cible="${u.cle}"
       href="${cibleBascule(u.cle)}"
       title="${u.nom}${prive ? ' — visible par toi seul pour l\'instant' : ''}"
       ${u.cle === universCourant ? 'aria-current="page"' : ''}>
      <span class="rail-compact">${u.icone}<span class="rail-nom">${u.court}</span>
        ${prive ? '<span class="rail-badge rail-badge-prive">Privé</span>' : ''}</span>
      <img class="rail-logo" src="${u.logo}" alt="" aria-hidden="true" loading="lazy">
    </a>`;
}

const TEXTE_A_VENIR = `Le TCG physique arrive bientôt sur PokéClasseur. Nous terminons de
  rassembler les visuels français de toutes les cartes, pour qu'aucune ne
  s'affiche vide ou en anglais. En attendant, tout le TCG Pocket est disponible.`;

function brancherOngletAVenir(rail){
  const bouton = rail.querySelector('.a-venir-onglet');
  if(!bouton) return;
  bouton.addEventListener('click', () => annoncerAVenir());
}

// La petite annonce : affichée au clic sur l'onglet, ou quand un lien
// menait au physique, pour qu'on comprenne pourquoi on arrive côté Pocket.
function annoncerAVenir(){
  document.getElementById('a-venir-annonce')?.remove();
  const a = document.createElement('div');
  a.id = 'a-venir-annonce';
  a.setAttribute('role', 'status');
  a.innerHTML = `
    <strong>TCG physique — à venir</strong>
    <p id="a-venir-aide">${TEXTE_A_VENIR}</p>
    <button type="button" aria-label="Fermer">×</button>`;
  a.querySelector('button').onclick = () => a.remove();
  document.body.appendChild(a);
  clearTimeout(annoncerAVenir.minuteur);
  annoncerAVenir.minuteur = setTimeout(() => a.remove(), 9000);
}

// Ce qu'une page propre au physique affiche à la place de son contenu.
function blocAVenir(){
  return `
    <div class="a-venir">
      <span class="a-venir-icone" aria-hidden="true">${UNIVERS.physique.icone}</span>
      <h2>TCG physique — à venir</h2>
      <p>${TEXTE_A_VENIR}</p>
      <a class="a-venir-lien" href="${avecUnivers('series.html', 'pocket')}">Voir le TCG Pocket</a>
    </div>`;
}

// Confronter l'indice à la base. Trois issues :
//   — administrateur sans indice : on le pose, et s'il voulait aller côté
//     physique, on l'y emmène ;
//   — administrateur avec indice : rien à faire ;
//   — pas administrateur, mais physique affiché (indice périmé ou
//     fabriqué) : retour immédiat côté Pocket.
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
  rail.innerHTML = Object.values(UNIVERS).map(ongletDUnivers).join('');
  document.body.prepend(rail);
  brancherOngletAVenir(rail);

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

// Certains liens n'ont de sens que d'un côté : les missions secrètes sont
// une mécanique de l'application mobile, et les classeurs n'existent que
// pour des cartes qu'on peut tenir dans la main. On les retire de la barre
// plutôt que d'y laisser un onglet qui mène à une page vide.
function masquerLiensHorsUnivers(){
  document.querySelectorAll('.lien-pocket').forEach(a => { a.hidden = !estPocket(); });
  document.querySelectorAll('.lien-physique').forEach(a => { a.hidden = estPocket(); });
}

function initUnivers(){
  poserRail();
  // admin.js est chargé plus bas dans la page : au moment où le document est
  // prêt, verifierAdmin existe.
  verifierAccesPhysique();
  propagerUnivers();
  masquerLiensHorsUnivers();

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
