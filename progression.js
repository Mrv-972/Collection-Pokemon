const CLE_TAGS_PROGRESSION = 'pokeclasseur_tags';

function marquages(){
  if(typeof tagState === 'object' && tagState) return tagState;
  try{ return JSON.parse(localStorage.getItem(CLE_TAGS_PROGRESSION)) || {}; }
  catch{ return {}; }
}

function totalDeLExtension(ext){
  const n = ext?.cardCount?.official ?? ext?.cardCount?.total ?? null;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function compterObtenuesParExtension(identifiants){
  const connus = [...identifiants].sort((a, b) => b.length - a.length);
  const compte = new Map(connus.map(id => [id, 0]));
  for(const [idCarte, tags] of Object.entries(marquages())){
    if(!tags?.obt) continue;
    const ext = connus.find(id => idCarte.startsWith(id + '-'));
    if(ext) compte.set(ext, compte.get(ext) + 1);
  }
  return compte;
}

function progressionDesCartes(cartes){
  const tags = marquages();
  const obtenues = cartes.filter(c => tags[c.id]?.obt).length;
  return { obtenues, total: cartes.length };
}

const pourcentage = ({ obtenues, total }) =>
  total ? Math.min(100, Math.round((obtenues / total) * 100)) : 0;

const STYLE_PROGRESSION = `
  .progression{margin-top:10px}
  .progression .piste{height:5px;border-radius:999px;overflow:hidden;
                      background:rgba(var(--trait-rgb,237,234,224),0.10);}
  .progression .part{height:100%;border-radius:999px;
                     background:var(--gold,#C9A227);
                     transition:width .35s ease;}
  .progression.complete .part{background:var(--accent-clair,#E3C766)}
  .progression .chiffres{display:flex;justify-content:space-between;gap:8px;
                         margin-top:5px;font-size:11.5px;
                         color:var(--text-on-ink-dim,#9B9E9C);}
  .progression .chiffres b{font-weight:600;color:var(--accent-clair,#E3C766)}
  .progression.complete .chiffres b::after{content:' ✓'}
  .progression-large .piste{height:8px}
  .progression-large .chiffres{font-size:13px;margin-top:7px}
  @media(prefers-reduced-motion:reduce){
    .progression .part{transition:none}
  }
`;

function poserStyleProgression(){
  if(document.getElementById('style-progression')) return;
  const style = document.createElement('style');
  style.id = 'style-progression';
  style.textContent = STYLE_PROGRESSION;
  document.head.appendChild(style);
}

function barreProgression({ obtenues, total }, { large = false } = {}){
  if(!total) return '';
  poserStyleProgression();
  const part = pourcentage({ obtenues, total });
  const complete = obtenues >= total;
  return `
    <div class="progression${complete ? ' complete' : ''}${large ? ' progression-large' : ''}"
         role="progressbar" aria-valuenow="${part}" aria-valuemin="0" aria-valuemax="100"
         aria-label="${obtenues} carte${obtenues > 1 ? 's' : ''} obtenue${obtenues > 1 ? 's' : ''} sur ${total}">
      <div class="piste"><div class="part" style="width:${part}%"></div></div>
      <div class="chiffres"><span><b>${obtenues}</b> / ${total}</span><span>${part} %</span></div>
    </div>`;
}

function estObtenue(idCarte){
  return Boolean(marquages()[idCarte]?.obt);
}

const CLASSE_NON_OBTENUE = 'non-obtenue';

const CLE_GRISAILLE = 'pokeclasseur-griser-manquantes';

function grisailleActive(){
  try{ return localStorage.getItem(CLE_GRISAILLE) !== 'non'; }
  catch{ return true; }
}

const STYLE_NON_OBTENUE = `
  img.${CLASSE_NON_OBTENUE}{transition:filter .2s,opacity .2s}
  html[data-griser="oui"] img.${CLASSE_NON_OBTENUE}{filter:grayscale(1);opacity:.78}
  @media(prefers-reduced-motion:reduce){
    img.${CLASSE_NON_OBTENUE}{transition:none}
  }
`;

function appliquerLaGrisaille(){
  document.documentElement.dataset.griser = grisailleActive() ? 'oui' : 'non';
}

function poserStyleNonObtenue(){
  appliquerLaGrisaille();
  if(document.getElementById('style-non-obtenue')) return;
  const style = document.createElement('style');
  style.id = 'style-non-obtenue';
  style.textContent = STYLE_NON_OBTENUE;
  document.head.appendChild(style);
}

const STYLE_INTERRUPTEUR = `
  .bouton-grisaille{font-family:inherit;font-size:13px;padding:7px 13px;border-radius:5px;
    cursor:pointer;color:var(--text-on-ink-dim);background:transparent;
    border:1px solid rgba(var(--trait-rgb,237,234,224),0.14);white-space:nowrap}
  .bouton-grisaille:hover{color:var(--text-on-ink)}
  .bouton-grisaille[aria-pressed="true"]{color:var(--text-on-ink);
    border-color:rgba(var(--gold-rgb),0.45);background:rgba(var(--gold-rgb),0.10)}
`;

function poserInterrupteurGrisaille(conteneur){
  if(!conteneur || conteneur.querySelector('.bouton-grisaille')) return;
  poserStyleNonObtenue();

  if(!document.getElementById('style-interrupteur-grisaille')){
    const style = document.createElement('style');
    style.id = 'style-interrupteur-grisaille';
    style.textContent = STYLE_INTERRUPTEUR;
    document.head.appendChild(style);
  }

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'bouton-grisaille';
  bouton.id = 'bouton-grisaille';

  const rafraichir = () => {
    const actif = grisailleActive();
    bouton.setAttribute('aria-pressed', String(actif));
    bouton.textContent = actif ? '◐ Manquantes en gris' : '◐ Manquantes en couleur';
    bouton.title = actif
      ? 'Les cartes que tu n\'as pas encore sont en noir et blanc. Clique pour les voir en couleur.'
      : 'Toutes les cartes sont en couleur. Clique pour griser celles qui te manquent.';
  };

  bouton.addEventListener('click', () => {
    try{ localStorage.setItem(CLE_GRISAILLE, grisailleActive() ? 'non' : 'oui'); }
    catch{ }
    appliquerLaGrisaille();
    rafraichir();
    if(typeof enregistrerAffichage === 'function')
      enregistrerAffichage({ pref_griser: grisailleActive() }).catch(() => {});
  });
  document.addEventListener('pokeclasseur:grisaille', () => { appliquerLaGrisaille(); rafraichir(); });

  rafraichir();
  conteneur.appendChild(bouton);
}
