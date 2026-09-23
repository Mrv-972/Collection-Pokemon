// L'écran des classeurs : ce qu'on voit et ce qu'on manipule.
//
// La logique — formats, pages, déplacements — vit dans classeurs.js et ne
// touche jamais au document. Ce fichier-ci ne fait que l'afficher et
// enregistrer ce qui change.

let classeurs = [];
let idActif = null;
let pageActive = 0;
let cartesDuTiroir = [];
let extensionsPhysiques = [];

const contenu = () => document.getElementById('contenu');
const actif = () => classeurs.find(c => c.id === idActif) ?? null;

function echapper(t){
  return String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

// Toute modification passe par ici : on change, on enregistre, on redessine.
// Un seul chemin, donc aucun moyen d'oublier l'enregistrement.
function modifier(transformation){
  const avant = actif();
  if(!avant) return;
  const apres = transformation(avant);
  classeurs = classeurs.map(c => (c.id === apres.id ? apres : c));
  if(!enregistrerLesClasseurs(classeurs)){
    messageFugace("Enregistrement impossible : la mémoire du navigateur est pleine ou refusée.");
  }
  dessiner();
}

// ------------------------------------------------------------ le rendu ---

function barreDesClasseurs(){
  return `
    <div class="barre-classeurs">
      ${classeurs.map(c => `
        <button class="puce-classeur" data-ouvrir="${c.id}" aria-selected="${c.id === idActif}">
          <span class="dos" style="background:${teinteDe(c.couleur)}"></span>
          <span>${echapper(c.nom)}</span>
          <span class="compte">${compterLesCartes(c)}</span>
        </button>`).join('')}
      <button class="bouton-neuf" id="nouveau-classeur">+ Nouveau classeur</button>
    </div>`;
}

function reglagesDuClasseur(c){
  return `
    <div class="entete-classeur">
      <input type="text" id="nom-classeur" value="${echapper(c.nom)}"
             aria-label="Nom du classeur" maxlength="60">
      <button class="danger-leger" id="supprimer-classeur">Supprimer</button>
    </div>

    <div class="reglages">
      <label for="format-classeur">Format des pages</label>
      <select id="format-classeur">
        ${Object.entries(FORMATS).map(([cle, f]) =>
          `<option value="${cle}" ${cle === c.format ? 'selected' : ''}>${f.nom}</option>`).join('')}
      </select>

      <span>Couverture</span>
      <span class="couleurs">
        ${COULEURS.map(col => `
          <button data-couleur="${col.cle}" aria-pressed="${col.cle === c.couleur}"
                  style="background:${col.teinte}" title="${col.nom}"
                  aria-label="Couverture ${col.nom}"></button>`).join('')}
      </span>
    </div>`;
}

function pageDuClasseur(c){
  const f = FORMATS[c.format];
  const page = c.pages[pageActive] ?? [];
  const cases = page.map((carteId, index) => {
    const carte = carteId ? carteConnue(carteId) : null;
    return `
      <div class="case ${carteId ? 'pleine' : ''}" data-case="${index}"
           ${carteId ? 'draggable="true"' : ''}
           role="button" tabindex="0"
           aria-label="${carte ? echapper(carte.name) : 'Case vide'}">
        ${carte
          ? `<img src="${echapper(carte.image ?? `images/cards/${carteId}.png`)}"
                  alt="${echapper(carte.name)}" loading="lazy"
                  data-secours="${echapper(carte.imageSecours ?? '')}"
                  onerror="visuelDeSecours(this)"
                  class="${typeof estObtenue === 'function' && !estObtenue(carteId) ? CLASSE_NON_OBTENUE : ''}">
             <button class="retirer" data-retirer="${index}" aria-label="Retirer cette carte">×</button>`
          : '+'}
      </div>`;
  }).join('');

  return `
    <div class="navigation-pages">
      <button id="page-avant" ${pageActive === 0 ? 'disabled' : ''} aria-label="Page précédente">‹</button>
      <span>Page ${pageActive + 1} sur ${c.pages.length}</span>
      <button id="page-apres" ${pageActive >= c.pages.length - 1 ? 'disabled' : ''} aria-label="Page suivante">›</button>
      <button class="ajouter" id="ajouter-page">+ une page</button>
      ${c.pages.length > 1 ? '<button class="ajouter" id="retirer-page">Retirer cette page</button>' : ''}
    </div>
    <div class="page-classeur" style="grid-template-columns:repeat(${f.colonnes},minmax(0,1fr))">
      ${cases}
    </div>`;
}

function tiroirDesCartes(){
  return `
    <div class="tiroir">
      <h2>Ajouter des cartes</h2>
      <p class="vide" style="padding:0;font-size:13.5px">Clique une carte pour la poser
         dans la première case libre, puis fais-la glisser où tu veux.</p>
      <div class="choix">
        <select id="choix-extension">
          <option value="">Choisis une extension…</option>
          ${extensionsPhysiques.map(e =>
            `<option value="${echapper(e.id)}">${echapper(e.name)}</option>`).join('')}
        </select>
        <input type="text" id="filtre-carte" placeholder="Filtrer par nom ou numéro…">
        <label class="filtre"><input type="checkbox" id="seulement-obtenues"> Seulement mes cartes obtenues</label>
      </div>
      <div id="grille-choix"></div>
    </div>`;
}

function dessiner(){
  const c = actif();
  if(!classeurs.length){
    contenu().innerHTML = barreDesClasseurs() + `
      <p class="vide">Aucun classeur pour l'instant. Crée le premier : tu pourras
         y disposer tes cartes, changer le format des pages, et déplacer chaque
         carte à la main jusqu'à ce que l'ensemble te plaise.</p>`;
  }else if(!c){
    contenu().innerHTML = barreDesClasseurs() +
      '<p class="vide">Choisis un classeur ci-dessus.</p>';
  }else{
    contenu().innerHTML = barreDesClasseurs() + reglagesDuClasseur(c)
      + pageDuClasseur(c) + tiroirDesCartes();
  }
  brancherLesGestes();
  if(actif()) dessinerLeTiroir();
}

// Un visuel qui ne vient pas laisserait une case d'apparence vide, alors
// qu'une carte s'y trouve. On tente l'adresse de secours, puis on écrit le
// nom : mieux vaut un nom qu'un trou.
//
// L'image est masquée, jamais retirée. Remplacer le nœud en cours de
// glisser-déposer annulait le déplacement : le navigateur abandonne un
// glisser dont la source a changé sous lui. Le nom s'affiche donc par le
// style, sur la case, sans toucher à l'arbre du document.
function visuelDeSecours(img){
  const secours = img.dataset.secours;
  if(secours){
    img.removeAttribute('data-secours');
    img.src = secours;
    return;
  }
  img.classList.add('visuel-absent');
  const boite = img.closest('.case, [data-poser]');
  if(boite) boite.dataset.nom = img.alt;
}

// ----------------------------------------------------------- les gestes ---

function brancherLesGestes(){
  const zone = contenu();

  zone.querySelector('#nouveau-classeur')?.addEventListener('click', () => {
    const neuf = classeurNeuf(`Classeur ${classeurs.length + 1}`);
    classeurs = [...classeurs, neuf];
    enregistrerLesClasseurs(classeurs);
    idActif = neuf.id;
    pageActive = 0;
    dessiner();
    document.getElementById('nom-classeur')?.select();
  });

  zone.querySelectorAll('[data-ouvrir]').forEach(b => b.addEventListener('click', () => {
    idActif = b.dataset.ouvrir;
    pageActive = 0;
    dessiner();
  }));

  // Le nom se retient à chaque frappe, sans bouton « Enregistrer » : c'est un
  // champ de texte, pas un formulaire. Redessiner à chaque lettre ferait
  // perdre le curseur, donc on met à jour la donnée sans redessiner.
  zone.querySelector('#nom-classeur')?.addEventListener('input', e => {
    const c = actif();
    if(!c) return;
    c.nom = e.target.value;
    enregistrerLesClasseurs(classeurs);
    const puce = zone.querySelector(`[data-ouvrir="${c.id}"] span:nth-child(2)`);
    if(puce) puce.textContent = c.nom;
  });

  zone.querySelector('#format-classeur')?.addEventListener('change', e => {
    modifier(c => changerLeFormat(c, e.target.value));
    pageActive = 0;
    dessiner();
  });

  zone.querySelectorAll('[data-couleur]').forEach(b => b.addEventListener('click', () => {
    modifier(c => ({ ...c, couleur: b.dataset.couleur }));
  }));

  zone.querySelector('#supprimer-classeur')?.addEventListener('click', supprimerLeClasseur);

  // Une carte prise reste prise d'une page à l'autre : c'est justement
  // ainsi qu'on la déplace vers une autre page.
  zone.querySelector('#page-avant')?.addEventListener('click', () => { pageActive--; dessiner(); });
  zone.querySelector('#page-apres')?.addEventListener('click', () => { pageActive++; dessiner(); });

  zone.querySelector('#ajouter-page')?.addEventListener('click', () => {
    modifier(c => ({ ...c, pages: [...c.pages, pageVide(c.format)] }));
    pageActive = actif().pages.length - 1;
    dessiner();
  });

  zone.querySelector('#retirer-page')?.addEventListener('click', retirerLaPage);

  zone.querySelectorAll('[data-retirer]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const index = Number(b.dataset.retirer);
    modifier(c => {
      const pages = c.pages.map(p => [...p]);
      pages[pageActive][index] = null;
      return { ...c, pages };
    });
  }));

  brancherLeGlisser(zone);
  brancherLeTiroir(zone);
}

// Déplacer une carte, par trois chemins qui mènent au même échange :
//   — le glisser-déposer, à la souris ;
//   — un clic sur la case de départ, puis sur celle d'arrivée ;
//   — la touche Entrée, deux fois, pour qui navigue au clavier.
//
// Le deuxième n'est pas un doublon du premier : le glisser-déposer du web
// n'existe pas sur un écran tactile. Sans lui, ranger son classeur depuis un
// téléphone serait impossible.
let caseChoisie = null;

function choisirOuEchanger(index, el){
  const c = actif();
  if(caseChoisie === null){
    // Rien à déplacer depuis une case vide.
    if(!c.pages[pageActive][index]) return;
    caseChoisie = { page: pageActive, case: index };
    el.classList.add('survolee');
    messageFugace('Carte prise. Touche la case où la poser.');
    return;
  }
  if(caseChoisie.page === pageActive && caseChoisie.case === index){
    caseChoisie = null;
    el.classList.remove('survolee');
    messageFugace('Déplacement annulé.');
    return;
  }
  const depart = caseChoisie;
  caseChoisie = null;
  modifier(x => echangerDeuxCases(x, depart, { page: pageActive, case: index }));
}

function brancherLeGlisser(zone){
  zone.querySelectorAll('.case').forEach(el => {
    const index = Number(el.dataset.case);

    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ page: pageActive, case: index }));
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('survolee'); });
    el.addEventListener('dragleave', () => el.classList.remove('survolee'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('survolee');
      try{
        const depart = JSON.parse(e.dataTransfer.getData('text/plain'));
        modifier(c => echangerDeuxCases(c, depart, { page: pageActive, case: index }));
      }catch(err){ /* déposé depuis ailleurs : on ignore */ }
    });

    // Au clic — donc aussi au doigt — et à la touche Entrée.
    el.addEventListener('click', () => choisirOuEchanger(index, el));
    el.addEventListener('keydown', e => {
      if(e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      choisirOuEchanger(index, el);
    });
  });
}

async function supprimerLeClasseur(){
  const c = actif();
  if(!c) return;
  const accord = await demanderConfirmation({
    titre: 'Supprimer ce classeur ?',
    message: `<b>${echapper(c.nom)}</b> et son rangement — ${compterLesCartes(c)} carte(s)
              sur ${c.pages.length} page(s) — seront effacés. Tes marquages de cartes,
              eux, ne bougent pas : un classeur n'est qu'une mise en page.`,
    action: 'Supprimer',
    danger: true,
  });
  if(!accord) return;
  classeurs = classeurs.filter(x => x.id !== c.id);
  enregistrerLesClasseurs(classeurs);
  idActif = classeurs[0]?.id ?? null;
  pageActive = 0;
  dessiner();
}

async function retirerLaPage(){
  const c = actif();
  const cartes = (c.pages[pageActive] ?? []).filter(Boolean).length;
  if(cartes > 0){
    const accord = await demanderConfirmation({
      titre: 'Retirer cette page ?',
      message: `Cette page contient <b>${cartes} carte(s)</b>. Elles seront retirées
                du classeur — les pages suivantes remontent d'un rang.`,
      action: 'Retirer la page',
      danger: true,
    });
    if(!accord) return;
  }
  modifier(x => ({ ...x, pages: x.pages.filter((_, i) => i !== pageActive) }));
  pageActive = Math.max(0, Math.min(pageActive, actif().pages.length - 1));
  dessiner();
}

// ------------------------------------------------------------ le tiroir ---
//
// Les cartes déjà posées dans un classeur doivent pouvoir s'afficher même
// quand leur extension n'est pas ouverte dans le tiroir : on retient donc
// ce qu'on a lu, extension par extension.

const cartesLues = new Map();          // id d'extension → cartes
const carteParId = new Map();          // id de carte    → carte

const carteConnue = id => carteParId.get(id) ?? null;

function retenirLesCartes(cartes){
  cartes.forEach(c => carteParId.set(c.id, c));
}

// Une carte posée dans un classeur appartient forcément à une extension :
// son identifiant commence par celui de l'extension. On lit celles dont on a
// besoin, et elles seules.
async function chargerLesExtensionsUtiles(){
  const c = actif();
  if(!c) return;
  const ids = [...new Set(c.pages.flat().filter(Boolean)
    .map(carteId => extensionDeLaCarte(carteId)).filter(Boolean))];
  for(const id of ids){
    if(cartesLues.has(id)) continue;
    try{
      const cartes = await cartesDeLExtension(id);
      cartesLues.set(id, cartes);
      retenirLesCartes(cartes);
    }catch(err){
      console.warn(`Cartes de ${id} indisponibles`, err);
      cartesLues.set(id, []);
    }
  }
}

// « 30th-c-001 » appartient à « 30th-c », pas à « 30th » : on prend le nom
// d'extension le plus long qui colle, comme ailleurs sur le site.
function extensionDeLaCarte(carteId){
  const connus = extensionsPhysiques.map(e => e.id).sort((a, b) => b.length - a.length);
  return connus.find(id => String(carteId).startsWith(id + '-')) ?? null;
}

function brancherLeTiroir(zone){
  const choix = zone.querySelector('#choix-extension');
  const filtre = zone.querySelector('#filtre-carte');
  const seulement = zone.querySelector('#seulement-obtenues');
  if(!choix) return;

  choix.addEventListener('change', async () => {
    const id = choix.value;
    if(!id){ cartesDuTiroir = []; dessinerLeTiroir(); return; }
    const grille = document.getElementById('grille-choix');
    grille.innerHTML = '<p class="vide" style="padding:14px 0">Chargement…</p>';
    try{
      if(!cartesLues.has(id)){
        const cartes = await cartesDeLExtension(id);
        cartesLues.set(id, cartes);
        retenirLesCartes(cartes);
      }
      cartesDuTiroir = cartesLues.get(id);
    }catch(err){
      grille.innerHTML = `<p class="vide" style="padding:14px 0">Cartes indisponibles : ${echapper(err.message)}</p>`;
      return;
    }
    dessinerLeTiroir();
  });

  filtre?.addEventListener('input', dessinerLeTiroir);
  seulement?.addEventListener('change', dessinerLeTiroir);
}

function dessinerLeTiroir(){
  const grille = document.getElementById('grille-choix');
  if(!grille) return;
  const q = (document.getElementById('filtre-carte')?.value ?? '').trim().toLowerCase();
  const seulementObtenues = document.getElementById('seulement-obtenues')?.checked;

  let liste = cartesDuTiroir;
  if(q) liste = liste.filter(c => c.name.toLowerCase().includes(q) || (c.localId ?? '').includes(q));
  if(seulementObtenues && typeof estObtenue === 'function') liste = liste.filter(c => estObtenue(c.id));

  if(!cartesDuTiroir.length){
    grille.innerHTML = '<p class="vide" style="padding:14px 0">Choisis une extension pour voir ses cartes.</p>';
    return;
  }
  if(!liste.length){
    grille.innerHTML = '<p class="vide" style="padding:14px 0">Aucune carte ne correspond.</p>';
    return;
  }

  grille.innerHTML = '<div class="grille-choix">' + liste.slice(0, 240).map(c => `
    <button data-poser="${echapper(c.id)}" title="${echapper(c.name)}">
      <img src="${echapper(c.image ?? `images/cards/${c.id}.png`)}" alt="${echapper(c.name)}"
           loading="lazy" data-secours="${echapper(c.imageSecours ?? '')}"
           onerror="visuelDeSecours(this)"
           class="${typeof estObtenue === 'function' && !estObtenue(c.id) ? CLASSE_NON_OBTENUE : ''}">
      <span class="nom">${echapper(c.name)}</span>
    </button>`).join('') + '</div>'
    + (liste.length > 240
      ? '<p class="vide" style="padding:12px 0 0;font-size:12.5px">240 premières cartes affichées. Affine le filtre pour voir les suivantes.</p>'
      : '');

  grille.querySelectorAll('[data-poser]').forEach(b => b.addEventListener('click', () => {
    modifier(c => poserALaSuite(c, b.dataset.poser));
    messageFugace('Carte ajoutée à la première case libre.');
  }));
}

// Un mot qui s'affiche puis s'efface : de quoi accuser réception d'un geste
// sans immobiliser l'écran.
function messageFugace(texte){
  let boite = document.getElementById('message-fugace');
  if(!boite){
    boite = document.createElement('div');
    boite.id = 'message-fugace';
    boite.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);'
      + 'z-index:80;background:#15171B;border:1px solid rgba(237,234,224,0.18);'
      + 'border-radius:8px;padding:11px 18px;font-size:13.5px;color:#EDEAE0;'
      + "font-family:'IBM Plex Sans',sans-serif;box-shadow:0 12px 34px rgba(0,0,0,0.5);"
      + 'opacity:0;transition:opacity .15s;max-width:calc(100vw - 32px);text-align:center';
    document.body.appendChild(boite);
  }
  boite.textContent = texte;
  requestAnimationFrame(() => { boite.style.opacity = '1'; });
  clearTimeout(boite._t);
  boite._t = setTimeout(() => { boite.style.opacity = '0'; }, 2600);
}

// ---------------------------------------------------------- le démarrage ---

async function demarrer(){
  if(estPocket()){
    contenu().innerHTML = `<p class="vide">Les classeurs sont faits pour des cartes
      qu'on peut tenir dans la main. Passe du côté TCG physique par le bandeau
      de gauche pour les retrouver.</p>`;
    return;
  }

  classeurs = lireLesClasseurs();
  idActif = classeurs[0]?.id ?? null;

  try{
    const toutes = await listerExtensions();
    extensionsPhysiques = toutes.filter(e => appartientAUnivers(e.id)).reverse();
  }catch(err){
    console.warn('Catalogue indisponible', err);
  }

  await chargerLesExtensionsUtiles();
  dessiner();
}

demarrer();
initCompte().then(afficherEtatCompte);
