// Habillage d'essai « Badges d'arène ».
// =====================================
//
// Une autre direction artistique pour tout le site, à l'essai avant de
// décider : chaque extension devient un badge d'arène, qu'on remporte en la
// complétant. Marine, rouge et or, titres en Saira, pictogrammes au trait à
// la place des émojis sur les boutons des cartes.
//
// Rien ne change pour les visiteurs tant qu'ils ne l'ont pas demandé :
//   ?da=badges     ajouté à l'adresse de n'importe quelle page l'active, et
//                  le navigateur s'en souvient d'une page à l'autre ;
//   ?da=classique  revient au site habituel.
// Un bandeau en haut de chaque page rappelle l'essai et offre le retour.
//
// Chargé juste après theme.js, avant les styles de la page, pour la même
// raison que lui : l'habillage est posé avant le premier affichage, sans
// apercevoir l'ancien décor une fraction de seconde.
//
// Tout passe par des règles préfixées :root[data-da="badges"] : elles
// l'emportent sur celles des pages sans les toucher, et disparaissent avec
// l'attribut. Retirer ce fichier rend le site exactement tel qu'avant.

(function(){
  const CLE_DA = 'pokeclasseur-da';
  const CLE_BANDEAU = 'pokeclasseur-da-bandeau';

  const demande = new URLSearchParams(location.search).get('da');
  let active = false;
  try{
    if(demande === 'badges') localStorage.setItem(CLE_DA, 'badges');
    else if(demande === 'classique') localStorage.removeItem(CLE_DA);
    active = localStorage.getItem(CLE_DA) === 'badges';
  }catch{
    // Mémoire refusée : l'essai vaut pour cette page seulement.
    active = demande === 'badges';
  }
  if(!active) return;

  document.documentElement.dataset.da = 'badges';

  const police = document.createElement('link');
  police.rel = 'stylesheet';
  police.href = 'https://fonts.googleapis.com/css2?family=Saira:wght@500;600;700;800&family=Source+Sans+3:wght@400;600;700&display=swap';
  document.head.appendChild(police);

  // --------------------------------------------------------- les badges ---
  //
  // Chaque extension reçoit une forme et une couleur, tirées de son
  // identifiant : toujours les mêmes, sur toutes les pages, sans rien
  // stocker. Six formes et huit couleurs font quarante-huit badges
  // différents, assez pour que deux voisines se ressemblent rarement.
  const FORMES = [
    'polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)',
    'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)',
    'polygon(50% 0,100% 50%,50% 100%,0 50%)',
    'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
    'polygon(0 0,100% 0,100% 55%,50% 100%,0 55%)',
    'polygon(50% 0,85% 45%,85% 75%,50% 100%,15% 75%,15% 45%)',
  ];
  const TEINTES = ['#E7B23A', '#3B82D6', '#D2263C', '#8A5CD6', '#2FA36B', '#E07A2E', '#2BA5B5', '#C2508A'];

  function empreinte(texte){
    let h = 2166136261;
    for(const c of texte){ h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function identiteDuBadge(idExtension){
    const h = empreinte(idExtension);
    return {
      forme: FORMES[h % FORMES.length],
      teinte: TEINTES[Math.floor(h / FORMES.length) % TEINTES.length],
    };
  }

  const echapper = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // Le badge dans son anneau de progression. Gagné, il prend sa couleur et
  // un reflet ; en cours, il reste gris et l'anneau se remplit.
  function anneau(idExtension, part, gagne, { libelle = null } = {}){
    const { forme, teinte } = identiteDuBadge(idExtension);
    const accessibilite = libelle
      ? `role="img" aria-label="${echapper(libelle)}"`
      : 'aria-hidden="true"';
    return `<span class="anneau-arene" data-gagne="${gagne ? 'oui' : 'non'}" style="--p:${part}%;--teinte:${teinte}" ${accessibilite}>`
         + `<span class="badge-arene" style="--forme:${forme}"><i></i></span></span>`;
  }

  // Les marquages : ceux que tags.js tient en mémoire quand la page le
  // charge (à jour à la case près), sinon ceux du navigateur.
  function marquages(){
    if(typeof tagState === 'object' && tagState) return tagState;
    try{ return JSON.parse(localStorage.getItem('pokeclasseur_tags')) || {}; }
    catch{ return {}; }
  }
  function obtenuesDe(idExtension, tags = marquages()){
    const prefixe = idExtension + '-';
    let n = 0;
    for(const [id, t] of Object.entries(tags)) if(t?.obt && id.startsWith(prefixe)) n++;
    return n;
  }
  const totalDe = ext => {
    const n = ext?.cardCount?.official ?? ext?.cardCount?.total ?? null;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const partDe = (n, total) => Math.min(100, Math.round((n / total) * 100));

  // ------------------------------------------------------ pictogrammes ---
  //
  // Dessinés au trait et posés en masque : ils prennent la couleur du texte
  // du bouton, ce qu'un émoji ne sait pas faire.
  const icone = (corps, epaisseur = 2.4) => `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='${epaisseur}' stroke-linecap='round' stroke-linejoin='round'>${corps}</svg>`)}")`;
  const ICONES = {
    obt: icone("<path d='M5 12.5l4.5 4.5L19 7.5'/>", 2.8),
    rech: icone("<path d='M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'/>"),
    ech: icone("<path d='M6 8h12l-3.5-3.5M18 16H6l3.5 3.5'/>"),
    manq: icone("<rect x='5' y='5' width='14' height='14' rx='3' stroke-dasharray='3.2 3'/>", 2.2),
    eclair: icone("<path d='M13 3L5 13.5h6L10 21l8-10.5h-6z'/>", 2.2),
  };

  // --------------------------------------------------------- les styles ---
  const D = ':root[data-da="badges"]';
  const STYLE_DA = `
  /* Couleurs. Le sombre d'abord, le clair ensuite : à précision égale, la
     dernière règle l'emporte. Le clair est celui de la maquette ; le sombre
     en reprend les teintes sur un fond marine. */
  ${D}[data-theme]{
    --da-marine:#16213E; --da-marine-2:#22305A; --da-rouge:#D2263C; --da-rouge-fonce:#A81B2E;
    --da-or:#E7B23A; --da-or-clair:#F6D77A;
    --ink:#0F1830; --ink-soft:#18244A; --paper:#18244A; --paper-line:#2A3A66;
    --text-on-ink:#F2F4FA; --text-on-ink-dim:#B9C2D8; --text:#F2F4FA; --text-soft:#B9C2D8; --dim:#B9C2D8;
    --trait-rgb:185,194,216; --trait:rgba(185,194,216,0.18);
    --gold:#F6D77A; --gold-rgb:246,215,122; --accent-clair:#F6D77A;
    --teal:#D2263C; --teal-deep:#A81B2E; --rust:#FF8A98;
    --alerte:#FF8A98; --succes:#6FD3A5; --succes-fond:#173A33;
    --da-panneau:#18244A; --da-piste:#2A3A66; --da-gris:#4A5880; --da-bord:#2A3A66;
    --da-ombre:0 2px 0 #0A1124; --da-gagne:#3A3218; --da-ech:#3B5BA8;
    --da-remplissage:#F6D77A; --da-icone:#8C98B8; --fond-anneau:var(--da-panneau);
  }
  ${D}[data-theme="clair"]{
    --ink:#EEF1F7; --ink-soft:#FFFFFF; --paper:#FFFFFF; --paper-line:#D5DAE5;
    --text-on-ink:#16213E; --text-on-ink-dim:#4A5573; --text:#16213E; --text-soft:#4A5573; --dim:#4A5573;
    --trait-rgb:22,33,62; --trait:rgba(22,33,62,0.16);
    /* --gold colore des textes (le rouge, lisible sur fond clair) ;
       --gold-rgb ne sert qu'aux fonds et contours légers : l'or. */
    --gold:#C21F35; --gold-rgb:231,178,58; --accent-clair:#A81B2E;
    --rust:#C21F35; --alerte:#C21F35; --succes:#1F7A55; --succes-fond:#E3F2EA;
    --da-panneau:#FFFFFF; --da-piste:#E3E7F0; --da-gris:#C9D0DE; --da-bord:#D5DAE5;
    --da-ombre:0 2px 0 #D5DAE5; --da-gagne:#FFF4D6; --da-ech:#16213E;
    --da-remplissage:#16213E; --da-icone:#7C869E;
  }
  ${D}[data-contraste="oui"]{--text-on-ink-dim:#E1E6F2;--text-soft:#E1E6F2}
  ${D}[data-contraste="oui"][data-theme="clair"]{
    --text-on-ink:#0B1328; --text-on-ink-dim:#2B3552; --text-soft:#2B3552; --dim:#2B3552;
    --gold:#A81B2E; --gold-rgb:176,128,20; --accent-clair:#8E1626; --da-icone:#4A5573;
  }

  /* Polices : Saira pour les titres et les chiffres, Source Sans 3 pour le
     texte courant. */
  ${D} body{font-family:'Source Sans 3',system-ui,sans-serif;background:var(--ink);color:var(--text-on-ink)}
  ${D} :is(h1,h2,h3,h4,.brand,.glyph,.danger-zone h2,.compte-actuel .pseudo,.swap-icon,.step .num,
           .sous-titre,.pied-marque .nom,.livre-tete .titre,.fenetre-communaute h2,.ext-tete h3,
           .dossier-tete h2,.confirmation h2,.compteur b,.chiffre b,.boite-partage h2,.bloc-profil h2,
           .anecdote.du-jour .texte-anecdote){font-family:'Saira',system-ui,sans-serif;font-style:normal}
  ${D} :is(h1,h2){font-weight:800;letter-spacing:-0.2px}
  ${D} h3{font-weight:700}

  /* La barre du haut : marine sur toute la largeur, filet rouge dessous.
     Elle reste dans la colonne de la page ; le fond déborde de chaque côté
     sans élargir la page (un débordement de dessin ne fait pas défiler). */
  ${D} nav:has(.navlinks){
    --text-on-ink:#FFFFFF; --text-on-ink-dim:#B9C2D8; --ink-soft:#22305A;
    --gold:#E7B23A; --gold-rgb:231,178,58; --accent-clair:#F6D77A; --trait-rgb:185,194,216;
    color:#FFFFFF; padding:14px 0; margin-bottom:6px; border-bottom:0;
    flex-wrap:wrap; column-gap:20px; row-gap:8px;
    border-image:linear-gradient(var(--da-marine) calc(100% - 4px),var(--da-rouge) 0) fill 0 / / 0 100vmax;
  }
  ${D} nav .brand:not(.compte-lien){display:inline-flex;align-items:center;color:#FFFFFF;
    font-weight:800;font-size:21px;letter-spacing:.3px;text-decoration:none}
  ${D} nav .brand:not(.compte-lien) span{color:inherit}
  ${D} nav .brand:not(.compte-lien)::before{content:'';flex:none;width:26px;height:26px;margin-right:10px;
    background:radial-gradient(circle,var(--da-marine) 0 5px,var(--da-or) 5.5px);
    clip-path:${FORMES[0]}}
  /* Les liens restent dans la police du texte : en Saira, plus large, la
     barre ne tenait plus sur une ligne à côté du logo et du bouton. */
  ${D} .navlinks{font-family:'Source Sans 3',sans-serif;font-weight:400;font-size:15.5px;color:#C5CDE0;gap:18px}
  /* Sur grand écran, une seule ligne quoi qu'il arrive : si un long pseudo
     mange la place, les liens défilent de côté plutôt que de renvoyer le
     bouton du compte seul sur une deuxième ligne. */
  @media(min-width:1241px){
    ${D} nav:has(.navlinks){flex-wrap:nowrap}
    ${D} .navlinks{flex:1 1 auto;min-width:0;justify-content:center;justify-content:safe center;
      overflow-x:auto;scrollbar-width:none}
    ${D} .navlinks::-webkit-scrollbar{display:none}
  }
  ${D} .navlinks a{color:#C5CDE0;padding:6px 0;border-bottom:3px solid transparent}
  ${D} .navlinks a:hover{color:#FFFFFF}
  ${D} .navlinks a.active{color:#FFFFFF;border-bottom-color:var(--da-or)}
  ${D} nav .compte-lien{background:var(--da-rouge);color:#FFFFFF !important;border-radius:10px;
    padding:8px 14px !important;font-weight:700;line-height:1.2;white-space:nowrap}
  ${D} nav .compte-lien:hover{background:var(--da-rouge-fonce)}
  /* Le logo, plus grand, et le bouton rouge prennent de la place : les
     liens passent sur leur propre ligne plus tôt que sur le site
     d'origine, dès qu'ils ne tiennent plus à côté. */
  @media(min-width:721px) and (max-width:1240px){
    ${D} nav:has(.navlinks){row-gap:4px}
    ${D} .navlinks{order:3;width:100%;justify-content:space-between;gap:10px !important}
  }
  @media(max-width:720px){
    ${D} .navlinks a{padding:11px 6px}
    ${D} nav .brand:not(.compte-lien){font-size:20px}
    ${D} nav .brand:not(.compte-lien)::before{width:24px;height:24px}
  }

  /* La barre des deux univers prolonge la barre du haut. Les teintes
     restent celles du rail d'origine, lisibles sur marine. */
  ${D} .rail{background:var(--da-marine);border-right:0}
  ${D} .rail-item[data-cible="physique"]{--teinte:#E7B23A;--teinte-rgb:231,178,58}
  ${D} .rail-item[data-cible="pocket"]{--teinte:#6FB0EA;--teinte-rgb:111,176,234}
  ${D} .rail-item{opacity:.62}
  ${D} .rail-item.on{opacity:1}
  ${D} .rail-item + .rail-item{border-top-color:rgba(255,255,255,0.12)}
  ${D} .rail-nom{font-family:'Saira',sans-serif;font-weight:600}
  @media(max-width:720px){
    ${D} .rail{border-bottom:0}
    ${D} .rail-item + .rail-item{border-left-color:rgba(255,255,255,0.12)}
  }

  ${D} .kicker{font-family:'Saira',sans-serif;font-weight:700;font-size:13px;letter-spacing:.6px;
    text-transform:uppercase;color:var(--gold)}

  /* Panneaux : blancs, arrondis, posés sur une ombre nette plutôt qu'un
     contour. */
  ${D} :is(.set-card,.ext-card,.match-col){background:var(--da-panneau);border:0;border-radius:16px;box-shadow:var(--da-ombre)}
  ${D} :is(.set-card,.ext-card):hover{box-shadow:var(--da-ombre),0 0 0 2px var(--da-or)}
  ${D} .skeleton{border:0;border-radius:14px;background:var(--da-panneau)}
  ${D} .set-name{font-family:'Saira',sans-serif;font-weight:700;font-size:15px}
  ${D} .set-meta .tag-count{color:var(--text-on-ink-dim);font-weight:600}

  /* Boutons d'action : rouge plein. */
  ${D} :is(.cta-btn,button.principal){background:var(--da-rouge);color:#FFFFFF;border:0;border-radius:12px;
    font-family:'Saira',sans-serif;font-weight:700;letter-spacing:.2px}
  ${D} :is(.cta-btn,button.principal):hover{background:var(--da-rouge-fonce)}
  ${D} .remplissage-btn{background:var(--da-marine);color:#FFFFFF;border:0;border-radius:12px;
    font-family:'Saira',sans-serif;font-weight:700;display:inline-flex;align-items:center;gap:8px}
  ${D}[data-theme]:not([data-theme="clair"]) .remplissage-btn{background:var(--da-or);color:var(--da-marine)}
  ${D} .bouton-grisaille{border-radius:999px;border:1.5px solid var(--da-bord);background:var(--da-panneau);
    color:var(--text-on-ink);font-family:'Saira',sans-serif;font-weight:600}
  ${D} .bouton-grisaille[aria-pressed="true"]{background:var(--da-gris);border-color:var(--da-gris);color:var(--da-marine)}
  ${D}[data-theme]:not([data-theme="clair"]) :is(.bouton-grisaille[aria-pressed="true"],.filter-btn.on.manq){color:#FFFFFF}
  ${D} :is(input[type="text"],input[type="search"],input[type="email"],input[type="password"],select,textarea){border-radius:10px}

  /* Filtres : des pastilles qui prennent la couleur de leur marque. */
  ${D} .filter-btn{background:var(--da-panneau);border:1.5px solid var(--da-bord);color:var(--text-on-ink);
    border-radius:999px;font-family:'Saira',sans-serif;font-weight:600;
    display:inline-flex;align-items:center;gap:7px}
  ${D} .filter-btn.on.obt{background:var(--da-or);border-color:var(--da-or);color:var(--da-marine)}
  ${D} .filter-btn.on.rech{background:var(--da-rouge);border-color:var(--da-rouge);color:#FFFFFF}
  ${D} .filter-btn.on.ech{background:var(--da-ech);border-color:var(--da-ech);color:#FFFFFF}
  ${D} .filter-btn.on.manq{background:var(--da-gris);border-color:var(--da-gris);color:var(--da-marine)}
  ${D} .ico-da{flex:none;width:17px;height:17px;background:currentColor;
    -webkit-mask:var(--ico) center/contain no-repeat;mask:var(--ico) center/contain no-repeat}
  ${D} .ico-obt{--ico:${ICONES.obt}}
  ${D} .ico-rech{--ico:${ICONES.rech}}
  ${D} .ico-ech{--ico:${ICONES.ech}}
  ${D} .ico-manq{--ico:${ICONES.manq}}
  ${D} .ico-eclair{--ico:${ICONES.eclair}}

  /* Vignettes de cartes : un liseré or autour de celles qu'on possède.
     Seulement sur les pages qui savent ce qu'on possède (elles posent
     data-griser) : ailleurs, toutes auraient paru obtenues. */
  ${D} .card-img-wrap{border:0;border-radius:8px;background:var(--da-panneau);box-shadow:0 0 0 1.5px var(--da-bord)}
  ${D}[data-griser] .card-img-wrap:not(:has(img.non-obtenue)){box-shadow:0 0 0 3px var(--da-or)}
  ${D} .card-name{font-family:'Saira',sans-serif;font-weight:600}

  /* Les trois boutons sous chaque carte : pictogramme au trait, et la
     couleur de la marque quand elle est posée. L'émoji d'origine reste
     dans le bouton, invisible ; le nom du bouton (aria-label) ne change
     pas. */
  ${D} .tag-row{gap:6px}
  ${D} .tag-toggle{font-size:0;line-height:0;min-height:34px;padding:0;display:flex;align-items:center;justify-content:center;
    border-radius:10px;border:1.5px solid var(--da-bord);background:var(--da-panneau);color:var(--da-icone)}
  ${D} .tag-toggle::before{content:'';width:18px;height:18px;background:currentColor;
    -webkit-mask:var(--ico) center/contain no-repeat;mask:var(--ico) center/contain no-repeat}
  ${D} .tag-toggle.obt{--ico:${ICONES.obt}}
  ${D} .tag-toggle.rech{--ico:${ICONES.rech}}
  ${D} .tag-toggle.ech{--ico:${ICONES.ech}}
  ${D} .tag-toggle:not(.active){filter:none;opacity:1}
  ${D} .tag-toggle:hover{border-color:var(--text-on-ink-dim);color:var(--text-on-ink)}
  ${D} .tag-toggle.obt.active{background:var(--da-or);border-color:var(--da-or);color:var(--da-marine)}
  ${D} .tag-toggle.rech.active{background:var(--da-rouge);border-color:var(--da-rouge);color:#FFFFFF}
  ${D} .tag-toggle.ech.active{background:var(--da-ech);border-color:var(--da-ech);color:#FFFFFF}
  ${D} .tag-toggle.bloque,${D} .tag-toggle.bloque:hover{opacity:.45;filter:none;border-style:dashed;
    background:transparent;color:var(--da-icone)}
  @media(max-width:720px){
    ${D} .tag-toggle{min-height:42px}
    ${D} .tag-toggle::before{width:20px;height:20px}
  }

  /* Barres de progression : piste claire, remplissage marine, or une fois
     l'extension complète. */
  ${D} .progression .piste{background:var(--da-piste);height:6px}
  ${D} .progression .part{background:var(--da-remplissage)}
  ${D} .progression.complete .part{background:var(--da-or)}
  ${D} .progression .chiffres b{color:var(--text-on-ink)}
  ${D} .progression-large .piste{height:9px}
  ${D} .set-card .progression .piste{display:none}
  ${D} .ext-card .fill{background:var(--da-remplissage)}

  /* Le badge dans son anneau. */
  ${D} .anneau-arene{--t:52px;flex:none;position:relative;width:var(--t);height:var(--t);border-radius:50%;
    display:inline-flex;align-items:center;justify-content:center;
    background:radial-gradient(closest-side,var(--fond-anneau) calc(100% - 6px),transparent calc(100% - 5px)),
               conic-gradient(var(--teinte) var(--p),var(--da-piste) 0)}
  ${D} .anneau-arene[data-gagne="oui"]{background:var(--da-gagne);box-shadow:inset 0 0 0 3px var(--da-or)}
  ${D} .badge-arene{position:relative;display:block;width:58%;height:58%;background:var(--da-gris);clip-path:var(--forme)}
  ${D} [data-gagne="oui"] > .badge-arene{background:var(--teinte)}
  ${D} .badge-arene i{display:none;position:absolute;left:22%;top:18%;width:30%;height:13%;
    border-radius:999px;background:rgba(255,255,255,0.55)}
  ${D} [data-gagne="oui"] > .badge-arene i{display:block}
  ${D} .etiquette-arene{align-self:flex-start;font-family:'Saira',sans-serif;font-weight:700;font-size:12.5px;line-height:1.5;
    padding:1px 10px;border-radius:999px;background:var(--da-or);color:var(--da-marine);white-space:nowrap}
  ${D} .etiquette-arene.en-cours{background:var(--da-panneau);color:var(--text-on-ink-dim);box-shadow:var(--da-ombre)}

  /* Sur le catalogue : le badge prend la place du petit symbole. */
  ${D} .set-card .set-logo{height:54px}
  ${D} .set-card .set-logo .symbol{display:none}
  ${D} .set-card .set-logo .anneau-arene{--t:52px}
  /* Sur l'accueil : le badge à droite de la vignette. */
  ${D} .ext-card{position:relative;padding-right:80px}
  ${D} .ext-card .anneau-arene{position:absolute;right:16px;top:50%;transform:translateY(-50%);--t:50px}
  /* En tête d'une extension : le badge en grand, avec son état. */
  ${D} .tete-badge{margin-left:auto;display:flex;flex-direction:column;align-items:center;gap:8px;--fond-anneau:var(--ink)}
  ${D} .tete-badge .anneau-arene{--t:84px}
  ${D} .tete-badge .etiquette-arene{align-self:center}
  @media(max-width:720px){
    ${D} .tete-badge{order:-1;margin-left:0;flex-direction:row}
    ${D} .tete-badge .anneau-arene{--t:60px}
  }

  /* La carte de dresseur, sur l'accueil, à la place de l'illustration. */
  ${D} .hero.avec-carte-dresseur .binder{display:none}
  ${D} .carte-dresseur{--fond-anneau:var(--da-marine-2);background:var(--da-marine);color:#FFFFFF;
    border:3px solid var(--da-or);border-radius:22px;padding:24px;display:flex;flex-direction:column;gap:18px;min-width:0}
  ${D} .carte-dresseur-tete{display:flex;align-items:center;gap:14px}
  ${D} .carte-dresseur .avatar{flex:none;width:58px;height:58px;border-radius:50%;background:var(--da-marine-2);
    border:3px solid var(--da-or);display:flex;align-items:center;justify-content:center}
  ${D} .carte-dresseur .avatar svg{width:28px;height:28px}
  ${D} .carte-dresseur .titre{display:flex;flex-direction:column;min-width:0}
  ${D} .carte-dresseur .titre small{font-family:'Saira',sans-serif;font-weight:600;font-size:13px;color:#B9C2D8}
  ${D} .carte-dresseur .titre strong{font-family:'Saira',sans-serif;font-weight:800;font-size:26px;line-height:1.1;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  ${D} .carte-dresseur .total{margin-left:auto;font-family:'Saira',sans-serif;font-weight:700;font-size:15px;
    color:var(--da-or-clair);text-align:right;line-height:1.25}
  ${D} .carte-dresseur .total b{display:block;font-size:30px;font-weight:800;color:#FFFFFF}
  ${D} .etui-badges{background:#0F1830;border-radius:14px;padding:16px;display:grid;
    grid-template-columns:repeat(auto-fill,minmax(42px,1fr));gap:12px 8px;justify-items:center}
  ${D} .etui-badges a{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:50%}
  ${D} .etui-badges a:focus-visible{outline:2px solid var(--da-or);outline-offset:3px}
  ${D} .etui-badges .vide{border:2px dashed #3C4C78}
  ${D} .etui-badges .badge-arene{width:100%;height:100%;background:#3C4C78}
  ${D} .etui-badges .vide .badge-arene{display:none}
  ${D} .etui-badges [data-gagne="oui"] > .badge-arene{background:var(--teinte)}
  ${D} .prochain-badge{display:flex;align-items:center;gap:14px;color:#FFFFFF;text-decoration:none;
    background:var(--da-marine-2);border-radius:14px;padding:10px 16px 10px 10px}
  ${D} .prochain-badge:hover{box-shadow:0 0 0 2px var(--da-or)}
  ${D} .prochain-badge .anneau-arene{--t:50px}
  ${D} .prochain-badge .texte{display:flex;flex-direction:column;min-width:0;flex:1}
  ${D} .prochain-badge small{font-size:13px;color:#B9C2D8}
  ${D} .prochain-badge strong{font-family:'Saira',sans-serif;font-weight:700;font-size:17px;line-height:1.2;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  ${D} .prochain-badge b{font-family:'Saira',sans-serif;font-weight:800;font-size:20px;color:var(--da-or-clair)}
  @media(max-width:720px){
    ${D} .carte-dresseur{padding:16px;gap:14px;border-radius:18px}
    ${D} .carte-dresseur .avatar{width:48px;height:48px}
    ${D} .carte-dresseur .titre strong{font-size:22px}
    ${D} .carte-dresseur .total b{font-size:24px}
    ${D} .etui-badges{padding:12px;grid-template-columns:repeat(auto-fill,minmax(38px,1fr))}
    ${D} .etui-badges a{width:34px;height:34px}
  }

  /* Le bandeau de l'essai, tout en haut. */
  ${D} .bandeau-essai{display:flex;align-items:center;justify-content:center;gap:6px 14px;flex-wrap:wrap;
    padding:7px 44px 7px 16px;position:relative;background:var(--da-or);color:var(--da-marine);
    font-family:'Saira',sans-serif;font-weight:600;font-size:13.5px;line-height:1.35;text-align:center}
  ${D} .bandeau-essai a{color:inherit;font-weight:800;text-decoration:underline;text-underline-offset:3px;padding:4px 0}
  ${D} .bandeau-essai button{position:absolute;right:6px;top:50%;transform:translateY(-50%);
    width:36px;height:36px;background:none;border:0;font:inherit;font-size:20px;line-height:1;color:inherit;cursor:pointer}
  `;

  const style = document.createElement('style');
  style.id = 'style-habillage';
  style.textContent = STYLE_DA;
  document.head.appendChild(style);

  // ------------------------------------------------------- décorations ---

  // Les boutons de filtre et le bouton du remplissage portent leur émoji
  // dans leur texte : on le remplace par le pictogramme correspondant.
  function pictogrammesDesBoutons(){
    document.querySelectorAll('.filter-btn:not([data-da]), .remplissage-btn:not([data-da])').forEach(b => {
      const type = b.classList.contains('remplissage-btn')
        ? 'eclair'
        : ['obt', 'manq', 'rech', 'ech'].find(t => b.classList.contains(t));
      b.dataset.da = '1';
      if(!type) return;
      b.textContent = b.textContent.replace(/^[^\p{L}\p{N}]+/u, '');
      b.insertAdjacentHTML('afterbegin', `<span class="ico-da ico-${type}" aria-hidden="true"></span>`);
    });
  }

  // Les vignettes d'extension, au catalogue et sur l'accueil. Au catalogue,
  // la page a déjà calculé la progression (sa barre la porte) ; sur
  // l'accueil, on la calcule depuis le nombre de cartes affiché.
  function badgesDesVignettes(){
    let tags = null;
    document.querySelectorAll('a.set-card[href*="set="], a.ext-card[href*="set="]').forEach(lien => {
      const id = new URL(lien.getAttribute('href'), location.href).searchParams.get('set');
      if(!id) return;
      let part, gagne;
      const barre = lien.querySelector('.progression');
      if(barre){
        part = Number(barre.getAttribute('aria-valuenow')) || 0;
        gagne = barre.classList.contains('complete');
      }else{
        const total = parseInt(lien.querySelector('.count')?.textContent ?? '', 10);
        if(!Number.isFinite(total) || total <= 0) return;
        tags ??= marquages();
        const n = obtenuesDe(id, tags);
        part = partDe(n, total);
        gagne = n >= total;
        const remplissage = lien.querySelector('.fill');
        if(remplissage) remplissage.style.width = part + '%';
      }
      const cle = `${id}|${part}|${gagne}`;
      if(lien.dataset.badge === cle) return;
      lien.dataset.badge = cle;
      lien.querySelectorAll('.anneau-arene, .etiquette-arene').forEach(e => e.remove());
      const html = anneau(id, part, gagne);
      if(lien.classList.contains('set-card')){
        lien.querySelector('.set-logo')?.insertAdjacentHTML('beforeend', html);
        if(gagne) lien.querySelector('.set-name')?.insertAdjacentHTML('afterend', '<span class="etiquette-arene">Badge gagné</span>');
      }else{
        lien.insertAdjacentHTML('beforeend', html);
      }
    });
  }

  // L'en-tête d'une extension : son badge en grand. La progression est
  // relue sur la barre de l'en-tête, que la page tient à jour à chaque
  // carte cochée.
  function badgeDeLExtension(){
    const tete = document.getElementById('page-head');
    const barre = document.querySelector('#progression-extension .progression');
    const id = new URLSearchParams(location.search).get('set');
    if(!tete || !barre || !id) return;
    const part = Number(barre.getAttribute('aria-valuenow')) || 0;
    const gagne = barre.classList.contains('complete');
    const cle = `${id}|${part}|${gagne}`;
    let boite = tete.querySelector('.tete-badge');
    if(boite?.dataset.badge === cle) return;
    if(!boite){
      boite = document.createElement('div');
      boite.className = 'tete-badge';
      tete.appendChild(boite);
    }
    boite.dataset.badge = cle;
    const nom = tete.dataset.nom || 'cette extension';
    boite.innerHTML = anneau(id, part, gagne, { libelle: `Badge de ${nom} : ${gagne ? 'gagné' : part + ' %'}` })
      + `<span class="etiquette-arene${gagne ? '' : ' en-cours'}" aria-hidden="true">${gagne ? 'Badge gagné' : part + ' %'}</span>`;
  }

  // La carte de dresseur de l'accueil : un badge par extension de l'univers
  // affiché, en couleur une fois gagné, et le prochain à portée de main.
  const AVATAR = '<svg viewBox="0 0 24 24" fill="none" stroke="#F6D77A" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';

  function pseudoDuMembre(){
    try{ return typeof profil !== 'undefined' && profil?.pseudo ? profil.pseudo : null; }
    catch{ return null; }
  }

  async function carteDeDresseur(){
    const illustration = document.querySelector('.hero .binder');
    if(!illustration || typeof listerExtensions !== 'function') return;
    let extensions;
    try{ extensions = await listerExtensions(); }
    catch(err){ console.warn('Carte de dresseur : extensions indisponibles', err); return; }

    const tags = marquages();
    const etats = extensions
      .filter(s => typeof appartientAUnivers !== 'function' || appartientAUnivers(s.id))
      .map(s => ({ s, total: totalDe(s) }))
      .filter(e => e.total)
      .map(e => {
        const n = obtenuesDe(e.s.id, tags);
        return { ...e, n, part: partDe(n, e.total), gagne: n >= e.total };
      });
    if(etats.length === 0) return;

    const gagnes = etats.filter(e => e.gagne).length;
    const prochain = etats.filter(e => !e.gagne && e.n > 0).sort((a, b) => b.part - a.part)[0];

    const etui = etats.map(e => {
      const { forme, teinte } = identiteDuBadge(e.s.id);
      const etat = e.gagne ? 'badge gagné' : e.n > 0 ? `${e.part} %` : 'pas encore commencée';
      const classe = e.gagne ? 'gagne' : e.n > 0 ? 'en-cours' : 'vide';
      return `<a class="${classe}" href="extension.html?set=${encodeURIComponent(e.s.id)}" data-gagne="${e.gagne ? 'oui' : 'non'}"
                 style="--teinte:${teinte}" title="${echapper(e.s.name)} · ${etat}" aria-label="${echapper(e.s.name)} : ${etat}">`
           + `<span class="badge-arene" style="--forme:${forme}"><i></i></span></a>`;
    }).join('');

    const suite = prochain
      ? `<a class="prochain-badge" href="extension.html?set=${encodeURIComponent(prochain.s.id)}">
           ${anneau(prochain.s.id, prochain.part, false)}
           <span class="texte"><small>Prochain badge</small><strong>${echapper(prochain.s.name)}</strong></span>
           <b>${prochain.part} %</b></a>`
      : `<a class="prochain-badge" href="series.html">
           <span class="texte"><small>Aucun badge en cours</small><strong>Choisis ta première extension</strong></span>
           <b aria-hidden="true">→</b></a>`;

    const carte = document.createElement('div');
    carte.className = 'carte-dresseur';
    carte.innerHTML = `
      <div class="carte-dresseur-tete">
        <span class="avatar">${AVATAR}</span>
        <span class="titre"><small>Carte de dresseur</small><strong class="nom-dresseur">${echapper(pseudoDuMembre() ?? 'Dresseur')}</strong></span>
        <span class="total"><b>${gagnes}</b>badge${gagnes > 1 ? 's' : ''} sur ${etats.length}</span>
      </div>
      <div class="etui-badges">${etui}</div>
      ${suite}`;
    illustration.after(carte);
    illustration.closest('.hero')?.classList.add('avec-carte-dresseur');
    if(typeof propagerUnivers === 'function') propagerUnivers();

    // Le pseudo arrive avec la session, un instant après l'affichage.
    for(const delai of [800, 2500, 6000]){
      setTimeout(() => {
        const pseudo = pseudoDuMembre();
        const nom = carte.querySelector('.nom-dresseur');
        if(pseudo && nom && nom.textContent !== pseudo) nom.textContent = pseudo;
      }, delai);
    }
  }

  // Le bandeau qui rappelle l'essai. Masquable pour la visite en cours.
  function bandeauDeLEssai(){
    try{ if(sessionStorage.getItem(CLE_BANDEAU) === 'masque') return; }catch{}
    const retour = new URL(location.href);
    retour.searchParams.set('da', 'classique');
    const bandeau = document.createElement('div');
    bandeau.className = 'bandeau-essai';
    bandeau.setAttribute('role', 'note');
    bandeau.innerHTML = `<span>Habillage d'essai « Badges d'arène »</span>
      <a href="${echapper(retour.pathname + retour.search + retour.hash)}">Revenir au site actuel</a>
      <button type="button" aria-label="Masquer ce bandeau">×</button>`;
    bandeau.querySelector('button').addEventListener('click', () => {
      try{ sessionStorage.setItem(CLE_BANDEAU, 'masque'); }catch{}
      bandeau.remove();
    });
    document.body.prepend(bandeau);
  }

  // Les pages dessinent leurs vignettes après coup, et les redessinent à
  // chaque filtre : on repasse derrière elles, une fois par image affichée
  // au plus. Chaque décoration vérifie d'abord qu'elle n'est pas déjà
  // posée, si bien que ses propres ajouts ne relancent rien.
  let prevu = false;
  function decorer(){
    prevu = false;
    pictogrammesDesBoutons();
    badgesDesVignettes();
    badgeDeLExtension();
  }
  function prevoir(){
    if(prevu) return;
    prevu = true;
    requestAnimationFrame(decorer);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bandeauDeLEssai();
    decorer();
    new MutationObserver(prevoir).observe(document.body, { childList: true, subtree: true });
    carteDeDresseur();
  });
})();
