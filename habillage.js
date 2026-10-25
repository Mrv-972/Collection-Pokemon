(function(){
  document.documentElement.dataset.da = 'badges';

  const police = document.createElement('link');
  police.rel = 'stylesheet';
  police.href = 'https://fonts.googleapis.com/css2?family=Saira:wght@500;600;700;800&family=Source+Sans+3:wght@400;600;700&display=swap';
  document.head.appendChild(police);

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

  function anneau(idExtension, part, gagne, { libelle = null, taille = null } = {}){
    const { forme, teinte } = identiteDuBadge(idExtension);
    const accessibilite = libelle
      ? `role="img" aria-label="${echapper(libelle)}"`
      : 'aria-hidden="true"';
    return `<span class="anneau-arene" data-gagne="${gagne ? 'oui' : 'non'}" style="--p:${part}%;--teinte:${teinte}${taille ? `;--t:${taille}px` : ''}" ${accessibilite}>`
         + `<span class="badge-arene" style="--forme:${forme}"><i></i></span></span>`;
  }

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

  const TRACES = {
    obt: "<path d='M5 12.5l4.5 4.5L19 7.5' stroke-width='2.6'/>",
    rech: "<path d='M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'/>",
    ech: "<path d='M6 8h12l-3.5-3.5M18 16H6l3.5 3.5'/>",
    manq: "<rect x='5' y='5' width='14' height='14' rx='3' stroke-dasharray='3.2 3'/>",
    eclair: "<path d='M13 3L5 13.5h6L10 21l8-10.5h-6z'/>",
    pile: "<rect x='4' y='7' width='12' height='14' rx='2'/><path d='M8 3h10a2 2 0 0 1 2 2v12'/>",
    video: "<rect x='3' y='6' width='13' height='12' rx='2'/><path d='M16 10l5-3v10l-5-3z'/>",
    loupe: "<circle cx='11' cy='11' r='6.5'/><path d='M16 16l4.5 4.5'/>",
    tout: "<path d='M2.5 12.5l4 4L15 8'/><path d='M11.5 15.5l1 1L21 8'/>",
    maison: "<path d='M4 11l8-7 8 7'/><path d='M6 9.5V20h12V9.5'/>",
    question: "<circle cx='12' cy='12' r='9'/><path d='M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .9-1 1.6v.4'/><path d='M12 17.2v.1'/>",
    ampoule: "<path d='M9 18h6M10 21h4'/><path d='M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z'/>",
    bulle: "<path d='M4 5h16v11H9l-5 4z'/>",
    etincelle: "<path d='M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'/>",
    lettres: "<path d='M3 18L7.5 6 12 18M4.8 14h5.4'/><circle cx='17.5' cy='15' r='3'/><path d='M20.5 12v6'/>",
    journal: "<rect x='3' y='4' width='18' height='16' rx='2'/><path d='M7 8.5h10M7 12h10M7 15.5h6'/>",
    epingle: "<path d='M9 3h6l-1 6 3 3H7l3-3z'/><path d='M12 15v6'/>",
    cadenas: "<rect x='5' y='10' width='14' height='10' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/>",
    cloche: "<path d='M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z'/><path d='M10 21h4'/>",
    de: "<rect x='4' y='4' width='16' height='16' rx='3'/><path d='M8.5 8.5v.1M15.5 15.5v.1M15.5 8.5v.1M8.5 15.5v.1M12 12v.1' stroke-width='2.6'/>",
    pouce: "<path d='M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 3 2l-1 4h5.5a2 2 0 0 1 2 2.4l-1.3 6a2 2 0 0 1-2 1.6H7'/>",
    'pouce-bas': "<path d='M17 13V4h3v9zM17 13l-4 7a2 2 0 0 1-3-2l1-4H5.5a2 2 0 0 1-2-2.4l1.3-6a2 2 0 0 1 2-1.6H17'/>",
    plus: "<path d='M12 5v14M5 12h14'/>",
    personne: "<circle cx='12' cy='8' r='4'/><path d='M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'/>",
    reglages: "<path d='M4 7h9M17 7h3M4 17h3M11 17h9'/><circle cx='15' cy='7' r='2'/><circle cx='9' cy='17' r='2'/>",
    sortie: "<path d='M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4'/><path d='M10 8l-4 4 4 4M6 12h10'/>",
    image: "<rect x='3' y='5' width='18' height='14' rx='2'/><circle cx='9' cy='10' r='1.8'/><path d='M21 16l-5-5-8 8'/>",
    crayon: "<path d='M4 20l1-4L16 5l3 3L8 19z'/><path d='M14 7l3 3'/>",
    telephone: "<rect x='7' y='2.5' width='10' height='19' rx='2.5'/><path d='M11 18.5h2'/>",
    trophee: "<path d='M8 4h8v5a4 4 0 0 1-8 0z'/><path d='M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4'/>",
    manette: "<path d='M7 9h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.8A3 3 0 0 1 3 14v-1a4 4 0 0 1 4-4z'/><path d='M8 11.5v3M6.5 13h3'/><path d='M16 12v.1M17.5 14v.1' stroke-width='2.4'/>",
    carte: "<rect x='6' y='3' width='12' height='18' rx='2'/><path d='M9 7h6'/>",
    etoile: "<path d='M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z'/>",
  };
  const pictogramme = nom => `<svg class="picto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TRACES[nom] ?? ''}</svg>`;
  const pictogrammeEnImage = (nom, couleur = 'black') => `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${couleur}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>${TRACES[nom] ?? ''}</svg>`)}")`;
  const badgeArene = (cle, gagne, { taille = 44, libelle = null } = {}) =>
    anneau(cle, gagne ? 100 : 0, gagne, { libelle, taille });
  Object.assign(window, { pictogramme, pictogrammeEnImage, badgeArene });

  const D = ':root[data-da="badges"]';
  const STYLE_DA = `
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
    --da-ombre:0 2px 0 #0A1124; --da-gagne:#3A3218;
    --marque-obt:#2E9E5B; --marque-rech:#D2263C; --marque-ech:#E7B23A;
    --marque-obt-texte:#FFFFFF; --marque-rech-texte:#FFFFFF; --marque-ech-texte:#16213E;
    --da-remplissage:#F6D77A; --da-icone:#8C98B8; --fond-anneau:var(--da-panneau);
  }
  ${D}[data-theme="clair"]{
    --ink:#EEF1F7; --ink-soft:#FFFFFF; --paper:#FFFFFF; --paper-line:#D5DAE5;
    --text-on-ink:#16213E; --text-on-ink-dim:#4A5573; --text:#16213E; --text-soft:#4A5573; --dim:#4A5573;
    --trait-rgb:22,33,62; --trait:rgba(22,33,62,0.16);
    --gold:#C21F35; --gold-rgb:231,178,58; --accent-clair:#A81B2E;
    --rust:#C21F35; --alerte:#C21F35; --succes:#1F7A55; --succes-fond:#E3F2EA;
    --da-panneau:#FFFFFF; --da-piste:#E3E7F0; --da-gris:#C9D0DE; --da-bord:#D5DAE5;
    --da-ombre:0 2px 0 #D5DAE5; --da-gagne:#FFF4D6; --marque-obt:#23874F;
    --da-remplissage:#16213E; --da-icone:#7C869E;
  }
  ${D}[data-contraste="oui"]{--text-on-ink-dim:#E1E6F2;--text-soft:#E1E6F2}
  ${D}[data-contraste="oui"][data-theme="clair"]{
    --text-on-ink:#0B1328; --text-on-ink-dim:#2B3552; --text-soft:#2B3552; --dim:#2B3552;
    --gold:#A81B2E; --gold-rgb:176,128,20; --accent-clair:#8E1626; --da-icone:#4A5573;
  }

  ${D} body{font-family:'Source Sans 3',system-ui,sans-serif;background:var(--ink);color:var(--text-on-ink)}
  ${D} :is(h1,h2,h3,h4,.brand,.glyph,.danger-zone h2,.compte-actuel .pseudo,.swap-icon,.step .num,
           .sous-titre,.pied-marque .nom,.livre-tete .titre,.fenetre-communaute h2,.ext-tete h3,
           .dossier-tete h2,.confirmation h2,.compteur b,.chiffre b,.boite-partage h2,.bloc-profil h2,
           .anecdote.du-jour .texte-anecdote){font-family:'Saira',system-ui,sans-serif;font-style:normal}
  ${D} :is(h1,h2){font-weight:800;letter-spacing:-0.2px}
  ${D} h3{font-weight:700}

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
  ${D} .navlinks{font-family:'Source Sans 3',sans-serif;font-weight:400;font-size:15.5px;color:#C5CDE0;gap:18px}
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
  @media(min-width:721px) and (max-width:1240px){
    ${D} nav:has(.navlinks){row-gap:4px}
    ${D} .navlinks{order:3;width:100%;justify-content:space-between;gap:10px !important}
  }
  @media(max-width:720px){
    ${D} .navlinks a{padding:11px 6px}
    ${D} nav .brand:not(.compte-lien){font-size:20px}
    ${D} nav .brand:not(.compte-lien)::before{width:24px;height:24px}
  }

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

  ${D} .kicker{display:none}

  ${D} :is(.set-card,.ext-card,.match-col){background:var(--da-panneau);border:0;border-radius:16px;box-shadow:var(--da-ombre)}
  ${D} :is(.set-card,.ext-card):hover{box-shadow:var(--da-ombre),0 0 0 2px var(--da-or)}
  ${D} .skeleton{border:0;border-radius:14px;background:var(--da-panneau)}
  ${D} .set-name{font-family:'Saira',sans-serif;font-weight:700;font-size:15px}
  ${D} .set-meta .tag-count{color:var(--text-on-ink-dim);font-weight:600}

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

  ${D} .filter-btn{background:var(--da-panneau);border:1.5px solid var(--da-bord);color:var(--text-on-ink);
    border-radius:999px;font-family:'Saira',sans-serif;font-weight:600;
    display:inline-flex;align-items:center;gap:7px}
  ${D} .filter-btn.on.obt{background:var(--marque-obt);border-color:var(--marque-obt);color:var(--marque-obt-texte)}
  ${D} .filter-btn.on.rech{background:var(--marque-rech);border-color:var(--marque-rech);color:var(--marque-rech-texte)}
  ${D} .filter-btn.on.ech{background:var(--marque-ech);border-color:var(--marque-ech);color:var(--marque-ech-texte)}
  ${D} .filter-btn.on.manq{background:var(--da-gris);border-color:var(--da-gris);color:var(--da-marine)}
  ${D} .ico-da{flex:none;width:17px;height:17px;background:currentColor;
    -webkit-mask:var(--ico) center/contain no-repeat;mask:var(--ico) center/contain no-repeat}
${Object.keys(TRACES).map(nom => `  ${D} .ico-${nom}{--ico:${pictogrammeEnImage(nom)}}`).join('\n')}
  ${D} .picto{display:inline-block;flex:none;width:1.15em;height:1.15em;vertical-align:-.2em}
  ${D} :is(.choix-tag,.tout-tag,.lot-tag,.marquer-tag){display:inline-flex;align-items:center;gap:6px;border-radius:999px}
  ${D} :is(.choix-tag,.tout-tag).on[data-tag="obt"]{background:var(--marque-obt);border-color:var(--marque-obt);color:var(--marque-obt-texte)}
  ${D} :is(.choix-tag,.tout-tag).on[data-tag="rech"]{background:var(--marque-rech);border-color:var(--marque-rech);color:var(--marque-rech-texte)}
  ${D} :is(.choix-tag,.tout-tag).on[data-tag="ech"]{background:var(--marque-ech);border-color:var(--marque-ech);color:var(--marque-ech-texte)}

  ${D} .card-img-wrap{border:0;border-radius:8px;background:var(--da-panneau);box-shadow:0 0 0 1.5px var(--da-bord)}
  ${D}[data-griser] .card-img-wrap:not(:has(img.non-obtenue)){box-shadow:0 0 0 3px var(--marque-obt)}
  ${D} .card-name{font-family:'Saira',sans-serif;font-weight:600}

  ${D} .tag-row{gap:6px}
  ${D} .tag-toggle{min-height:34px;padding:0;display:flex;align-items:center;justify-content:center;
    border-radius:10px;border:1.5px solid var(--da-bord);background:var(--da-panneau);color:var(--da-icone)}
  ${D} .tag-toggle .picto{width:18px;height:18px}
  ${D} .tag-toggle:not(.active){filter:none;opacity:1}
  ${D} .tag-toggle:hover{border-color:var(--text-on-ink-dim);color:var(--text-on-ink)}
  ${D} .tag-toggle.obt.active{background:var(--marque-obt);border-color:var(--marque-obt);color:var(--marque-obt-texte)}
  ${D} .tag-toggle.rech.active{background:var(--marque-rech);border-color:var(--marque-rech);color:var(--marque-rech-texte)}
  ${D} .tag-toggle.ech.active{background:var(--marque-ech);border-color:var(--marque-ech);color:var(--marque-ech-texte)}
  ${D} .tag-toggle.bloque,${D} .tag-toggle.bloque:hover{opacity:.45;filter:none;border-style:dashed;
    background:transparent;color:var(--da-icone)}
  @media(max-width:720px){
    ${D} .tag-toggle{min-height:42px}
    ${D} .tag-toggle .picto{width:20px;height:20px}
  }

  ${D} .progression .piste{background:var(--da-piste);height:6px}
  ${D} .progression .part{background:var(--da-remplissage)}
  ${D} .progression.complete .part{background:var(--da-or)}
  ${D} .progression .chiffres b{color:var(--text-on-ink)}
  ${D} .progression-large .piste{height:9px}
  ${D} .set-card .progression .piste{display:none}
  ${D} .ext-card .fill{background:var(--da-remplissage)}

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

  ${D} .set-card .set-logo{height:54px}
  ${D} .set-card .set-logo .symbol{display:none}
  ${D} .set-card .set-logo .anneau-arene{--t:52px}
  ${D} .ext-card{position:relative;padding-right:80px}
  ${D} .ext-card .anneau-arene{position:absolute;right:16px;top:50%;transform:translateY(-50%);--t:50px}
  ${D} .tete-badge{margin-left:auto;display:flex;flex-direction:column;align-items:center;gap:8px;--fond-anneau:var(--ink)}
  ${D} .tete-badge .anneau-arene{--t:84px}
  ${D} .tete-badge .etiquette-arene{align-self:center}
  @media(max-width:720px){
    ${D} .tete-badge{order:-1;margin-left:0;flex-direction:row}
    ${D} .tete-badge .anneau-arene{--t:60px}
  }

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

  `;

  const style = document.createElement('style');
  style.id = 'style-habillage';
  style.textContent = STYLE_DA;
  document.head.appendChild(style);

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
        <span class="avatar" style="color:#F6D77A">${pictogramme('personne')}</span>
        <span class="titre"><small>Carte de dresseur</small><strong class="nom-dresseur">${echapper(pseudoDuMembre() ?? 'Dresseur')}</strong></span>
        <span class="total"><b>${gagnes}</b>badge${gagnes > 1 ? 's' : ''} sur ${etats.length}</span>
      </div>
      <div class="etui-badges">${etui}</div>
      ${suite}`;
    illustration.after(carte);
    illustration.closest('.hero')?.classList.add('avec-carte-dresseur');
    if(typeof propagerUnivers === 'function') propagerUnivers();

    for(const delai of [800, 2500, 6000]){
      setTimeout(() => {
        const pseudo = pseudoDuMembre();
        const nom = carte.querySelector('.nom-dresseur');
        if(pseudo && nom && nom.textContent !== pseudo) nom.textContent = pseudo;
      }, delai);
    }
  }

  let prevu = false;
  function decorer(){
    prevu = false;
    badgesDesVignettes();
    badgeDeLExtension();
  }
  function prevoir(){
    if(prevu) return;
    prevu = true;
    requestAnimationFrame(decorer);
  }

  document.addEventListener('DOMContentLoaded', () => {
    decorer();
    new MutationObserver(prevoir).observe(document.body, { childList: true, subtree: true });
    carteDeDresseur();
  });
})();
