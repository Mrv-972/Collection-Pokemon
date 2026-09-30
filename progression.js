// Progression de collection : combien de cartes d'une extension sont déjà
// marquées « Obtenue », et la barre qui le montre d'un coup d'œil.
//
// Partagé par le catalogue des extensions (series.html) et la page d'une
// extension (extension.html), pour que les deux comptent pareil.

const CLE_TAGS_PROGRESSION = 'pokeclasseur_tags';

// Les pages qui chargent tags.js tiennent déjà les marquages en mémoire, et
// à jour : on les relit chez elles plutôt que dans le stockage, qui pourrait
// avoir une case de retard. Les autres pages — le catalogue, qui ne marque
// rien — lisent directement le navigateur.
function marquages(){
  if(typeof tagState === 'object' && tagState) return tagState;
  try{ return JSON.parse(localStorage.getItem(CLE_TAGS_PROGRESSION)) || {}; }
  catch{ return {}; }
}

// Le nombre de cartes annoncé par la source. « official » exclut les cartes
// secrètes, « total » les compte ; on prend le premier disponible, comme le
// reste du site. Une extension dont personne n'annonce le compte n'aura pas
// de barre : mieux vaut rien qu'une fraction sur un dénominateur inventé.
function totalDeLExtension(ext){
  const n = ext?.cardCount?.official ?? ext?.cardCount?.total ?? null;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Un identifiant de carte s'écrit « <extension>-<numéro> » : « swsh8-123 »,
// « A1-045 ». Compter par préfixe suffirait presque, mais « 30th » est le
// préfixe de « 30th-c » : les cartes de la seconde tomberaient dans la
// première. On attribue donc chaque carte à l'extension dont le nom est le
// plus long parmi celles qui collent — la seule qui puisse être la bonne.
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

// Quand la page tient la vraie liste des cartes, on compte dessus : c'est
// exact, sans avoir à deviner à quelle extension appartient un identifiant.
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
                      background:rgba(237,234,224,0.10);}
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

// « large » pour l'en-tête d'une extension, où la barre porte la page ;
// discrète sur une vignette du catalogue, où elle en accompagne vingt.
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

// ------------------------------------------- cartes obtenues ou non ------
//
// Une carte qu'on n'a pas encore s'affiche en noir et blanc. Le classeur se
// lit alors d'un coup d'œil : ce qui reste en couleur est ce qu'on possède.

function estObtenue(idCarte){
  return Boolean(marquages()[idCarte]?.obt);
}

const CLASSE_NON_OBTENUE = 'non-obtenue';

// Griser ou non, c'est au lecteur de choisir : certains veulent voir d'un
// coup d'œil ce qui leur manque, d'autres veulent regarder les cartes.
// Le choix est retenu sur l'appareil et vaut pour tout le site.
const CLE_GRISAILLE = 'pokeclasseur-griser-manquantes';

function grisailleActive(){
  try{ return localStorage.getItem(CLE_GRISAILLE) !== 'non'; }
  catch{ return true; }   // mémoire refusée : on garde le comportement d'origine
}

// La règle est portée par un attribut du document plutôt que par chaque
// image : basculer ne demande alors aucun redessin, la page change de
// couleur d'un coup.
//
// La transition évite le clignotement quand on coche : la couleur revient en
// fondu plutôt que d'un coup.
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

// L'interrupteur, posé dans la barre d'outils des pages qui montrent des
// cartes. Une seule écriture pour les trois pages concernées : sans cela,
// le libellé et la mémoire auraient divergé au premier remaniement.
const STYLE_INTERRUPTEUR = `
  .bouton-grisaille{font-family:inherit;font-size:13px;padding:7px 13px;border-radius:5px;
    cursor:pointer;color:var(--text-on-ink-dim);background:transparent;
    border:1px solid rgba(237,234,224,0.14);white-space:nowrap}
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
    catch{ /* mémoire refusée : le choix ne durera pas, mais la page suit */ }
    appliquerLaGrisaille();
    rafraichir();
  });

  rafraichir();
  conteneur.appendChild(bouton);
}
