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
      <button class="ajouter voir" id="voir-le-livre">Visualiser mon classeur</button>
    </div>
    <div class="page-classeur" style="grid-template-columns:repeat(${f.colonnes},minmax(0,1fr))">
      ${cases}
    </div>`;
}

function tiroirDesCartes(){
  return `
    <div class="tiroir">
      <h2>Ajouter des cartes</h2>
      <p class="vide" style="padding:0;font-size:13.5px" id="mot-du-tiroir">Clique une carte
         pour la poser dans la première case libre — ou clique d'abord une case vide
         du classeur pour choisir où elle ira.</p>
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
  zone.querySelector('#page-avant')?.addEventListener('click', () => allerALaPage(pageActive - 1, -1));
  zone.querySelector('#page-apres')?.addEventListener('click', () => allerALaPage(pageActive + 1, 1));
  zone.querySelector('#voir-le-livre')?.addEventListener('click', ouvrirLeLivre);

  const page = zone.querySelector('.page-classeur');
  if(page){
    brancherLeBalayage(page,
      () => allerALaPage(pageActive - 1, -1),
      () => allerALaPage(pageActive + 1, 1));
  }

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

  // La case visée est redessinée comme les autres : on lui remet sa marque.
  if(caseVisee && caseVisee.page === pageActive){
    zone.querySelector(`.case[data-case="${caseVisee.case}"]`)?.classList.add('visee');
  }

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

// La case vide qu'on vient de désigner : la prochaine carte choisie dans le
// tiroir s'y posera. Sans cela, il fallait poser la carte à la suite puis la
// déplacer — deux gestes pour un.
let caseVisee = null;

function choisirOuEchanger(index, el){
  const c = actif();
  if(caseChoisie === null){
    // Une case vide ne se déplace pas : elle se désigne, pour y poser une
    // carte ensuite.
    if(!c.pages[pageActive][index]){
      viserLaCase(index, el);
      return;
    }
    caseVisee = null;
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

// Désigner une case vide, puis choisir sa carte dans le tiroir. Recliquer
// dessus annule.
function viserLaCase(index, el){
  const dejaVisee = caseVisee && caseVisee.page === pageActive && caseVisee.case === index;
  contenu().querySelectorAll('.case.visee').forEach(x => x.classList.remove('visee'));
  if(dejaVisee){
    caseVisee = null;
    messageFugace('Case libérée.');
    return;
  }
  caseVisee = { page: pageActive, case: index };
  el.classList.add('visee');
  messageFugace('Case choisie. Prends une carte ci-dessous pour l\'y poser.');
  // Le tiroir est plus bas : on l'amène sous les yeux plutôt que de laisser
  // chercher où cliquer ensuite.
  document.getElementById('choix-extension')?.scrollIntoView({
    behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'center' });
}

// Poser une carte : dans la case visée si l'on en a désigné une, à la suite
// sinon.
function poserLaCarte(carteId){
  const cible = caseVisee;
  caseVisee = null;
  if(!cible){
    modifier(c => poserALaSuite(c, carteId));
    messageFugace('Carte ajoutée à la première case libre.');
    return;
  }
  modifier(c => {
    const pages = c.pages.map(p => [...p]);
    // La page visée a pu disparaître entre-temps : on retombe alors sur le
    // comportement ordinaire plutôt que d'écrire à côté.
    if(!pages[cible.page]) return poserALaSuite(c, carteId);
    pages[cible.page][cible.case] = carteId;
    return { ...c, pages };
  });
  messageFugace(`Carte posée en case ${cible.case + 1} de la page ${cible.page + 1}.`);
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
    poserLaCarte(b.dataset.poser);
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

// ------------------------------------------------- feuilleter les pages ---
//
// Un classeur se feuillette : on ne va pas chercher un bouton à chaque page.
// Trois gestes mènent à la page suivante — la flèche du clavier, le doigt
// qui balaie, et les boutons, qui restent pour qui préfère viser.

function allerALaPage(numero, sens){
  const c = actif();
  if(!c) return false;
  const voulu = Math.max(0, Math.min(numero, c.pages.length - 1));
  if(voulu === pageActive) return false;
  pageActive = voulu;
  dessiner();
  // Le mouvement dit dans quel sens on a tourné, comme une page qui bascule.
  const page = contenu().querySelector('.page-classeur');
  if(page && !mouvementReduit()){
    page.animate(
      [{ opacity: 0, transform: `translateX(${sens > 0 ? 26 : -26}px)` },
       { opacity: 1, transform: 'none' }],
      { duration: 190, easing: 'ease-out' });
  }
  return true;
}

const mouvementReduit = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Le balayage au doigt. On exige un mouvement franc et surtout plus
// horizontal que vertical : sans cela, un simple défilement de la page
// tournerait un feuillet au passage.
function brancherLeBalayage(element, surGauche, surDroite){
  let depart = null;
  element.addEventListener('touchstart', e => {
    depart = e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  element.addEventListener('touchend', e => {
    if(!depart) return;
    const fin = e.changedTouches[0];
    const dx = fin.clientX - depart.x;
    const dy = fin.clientY - depart.y;
    depart = null;
    if(Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    (dx < 0 ? surDroite : surGauche)();
  }, { passive: true });
}

// Les flèches du clavier ne doivent pas tourner la page pendant qu'on écrit
// le nom du classeur ou qu'on filtre les cartes.
function saisieEnCours(){
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
}

document.addEventListener('keydown', e => {
  if(livreOuvert()) return;                       // la vue livre a ses propres touches
  if(saisieEnCours() || !actif()) return;
  if(e.key === 'ArrowLeft')  allerALaPage(pageActive - 1, -1);
  if(e.key === 'ArrowRight') allerALaPage(pageActive + 1, 1);
});

// ------------------------------------------------------- la vue « livre » ---
//
// Le classeur ouvert à plat : deux pages en vis-à-vis, comme on le regarde
// vraiment. C'est là qu'on juge un rangement — une page seule ne dit pas ce
// que donne la double page, et c'est pourtant ce qu'on a sous les yeux quand
// on ouvre le classeur.
//
// On y regarde, on n'y touche pas : les cases n'y sont ni déplaçables ni
// supprimables. La vue sert à décider, l'édition à faire.

// Le numéro de la page montrée à droite. Dans un classeur, tout se passe à
// droite : la première feuille s'ouvre de ce côté, et la page de gauche ne
// montre que le dos des cartes de la feuille précédente, puisqu'une pochette
// ne se remplit que d'un côté. On avance donc d'une page à la fois, en vue
// double comme sur un écran étroit.
let pageLivre = 0;

const livreOuvert = () => Boolean(document.getElementById('livre'));
const livreEnDouble = () => window.matchMedia?.('(min-width: 821px)').matches ?? true;

// Retourner une feuille inverse la gauche et la droite : la carte qui était
// au bord extérieur se retrouve près de la pliure. Les dos se lisent donc en
// miroir, ligne par ligne — c'est ce qu'on voit vraiment en tournant la page.
function enMiroir(page, colonnes){
  const miroir = [];
  for(let i = 0; i < page.length; i += colonnes){
    miroir.push(...page.slice(i, i + colonnes).reverse());
  }
  return miroir;
}

function caseDeLecture(c, carteId){
  const carte = carteId ? carteConnue(carteId) : null;
  return `<div class="case ${carteId ? 'pleine' : ''}">
    ${carte
      ? `<img src="${echapper(carte.image ?? `images/cards/${carteId}.png`)}"
              alt="${echapper(carte.name)}" loading="lazy"
              data-secours="${echapper(carte.imageSecours ?? '')}"
              onerror="visuelDeSecours(this)"
              class="${typeof estObtenue === 'function' && !estObtenue(carteId) ? CLASSE_NON_OBTENUE : ''}">`
      : ''}
  </div>`;
}

function grilleDePage(c, page, numero, { dos = false } = {}){
  const f = FORMATS[c.format];
  // Une page de C colonnes sur L lignes de cartes 2,5 × 3,5 a ce rapport-là.
  // Posé sur la page elle-même, il lui donne sa forme quelle que soit la
  // place disponible, et les deux pages restent identiques.
  const rapport = (f.colonnes * 2.5) / (f.lignes * 3.5);
  const cases = dos
    ? enMiroir(page, f.colonnes).map(carteId => carteId
        ? `<div class="case pleine dos">
             <img src="images/cartes/dos.webp" alt="Dos d'une carte" loading="lazy">
           </div>`
        : '<div class="case"></div>').join('')
    : page.map(carteId => caseDeLecture(c, carteId)).join('');

  return `
    <div class="page-livre${dos ? ' verso' : ''}"
         style="--rapport:${rapport.toFixed(4)};--lignes:${f.lignes}">
      <div class="page-classeur" style="grid-template-columns:repeat(${f.colonnes},minmax(0,1fr))">
        ${cases}
      </div>
      <div class="numero-page">${dos ? `dos de la page ${numero}` : numero}</div>
    </div>`;
}

// La page de gauche du tout premier feuillet : l'intérieur de la couverture,
// où il n'y a jamais rien.
const couvertureInterieure = () =>
  '<div class="page-livre couverture" aria-hidden="true"></div>';

function dessinerLeLivre(){
  const c = actif();
  const livre = document.getElementById('livre');
  if(!c || !livre) return;

  const double = livreEnDouble();
  const gauche = double
    ? (pageLivre > 0
        ? grilleDePage(c, c.pages[pageLivre - 1], pageLivre, { dos: true })
        : couvertureInterieure())
    : '';

  livre.querySelector('.double-page').innerHTML =
    gauche + grilleDePage(c, c.pages[pageLivre], pageLivre + 1);

  livre.querySelector('.compteur').textContent =
    `Page ${pageLivre + 1} sur ${c.pages.length}`;
  livre.querySelector('.feuillet.avant').disabled = pageLivre === 0;
  livre.querySelector('.feuillet.apres').disabled = pageLivre >= c.pages.length - 1;

  if(!mouvementReduit()){
    livre.querySelector('.double-page').animate(
      [{ opacity: 0.35 }, { opacity: 1 }], { duration: 170, easing: 'ease-out' });
  }
}

function tournerLeFeuillet(sens){
  const c = actif();
  if(!c) return;
  const voulu = Math.max(0, Math.min(pageLivre + sens, c.pages.length - 1));
  if(voulu === pageLivre) return;
  pageLivre = voulu;
  dessinerLeLivre();
}

function ouvrirLeLivre(){
  const c = actif();
  if(!c) return;
  pageLivre = pageActive;

  const livre = document.createElement('div');
  livre.id = 'livre';
  livre.className = 'livre';
  livre.setAttribute('role', 'dialog');
  livre.setAttribute('aria-modal', 'true');
  livre.setAttribute('aria-label', `Classeur ${c.nom}`);
  livre.innerHTML = `
    <div class="livre-tete">
      <span class="titre">${echapper(c.nom)}</span>
      <button class="fermer" aria-label="Fermer la vue">Fermer</button>
    </div>
    <button class="feuillet avant" aria-label="Feuillet précédent">‹</button>
    <div class="double-page"></div>
    <button class="feuillet apres" aria-label="Feuillet suivant">›</button>
    <div class="livre-pied">
      <span class="compteur"></span>
      <span class="aide">Flèches ← → ou balayage pour feuilleter · Échap pour fermer</span>
    </div>`;

  document.body.appendChild(livre);
  document.body.style.overflow = 'hidden';
  dessinerLeLivre();

  livre.querySelector('.fermer').addEventListener('click', fermerLeLivre);
  livre.querySelector('.feuillet.avant').addEventListener('click', () => tournerLeFeuillet(-1));
  livre.querySelector('.feuillet.apres').addEventListener('click', () => tournerLeFeuillet(1));
  brancherLeBalayage(livre, () => tournerLeFeuillet(-1), () => tournerLeFeuillet(1));
  // Pivoter son téléphone change le nombre de pages qui tiennent : la vue
  // s'y refait, plutôt que de rester dans l'état de l'orientation d'avant.
  window.addEventListener('resize', dessinerLeLivre);
  document.addEventListener('keydown', auClavierDuLivre);
  livre.querySelector('.fermer').focus();
}

function auClavierDuLivre(e){
  if(!livreOuvert()) return;
  if(e.key === 'Escape')     { e.preventDefault(); fermerLeLivre(); }
  if(e.key === 'ArrowLeft')  { e.preventDefault(); tournerLeFeuillet(-1); }
  if(e.key === 'ArrowRight') { e.preventDefault(); tournerLeFeuillet(1); }
}

function fermerLeLivre(){
  document.removeEventListener('keydown', auClavierDuLivre);
  window.removeEventListener('resize', dessinerLeLivre);
  document.getElementById('livre')?.remove();
  document.body.style.overflow = '';
  // On repart de la page qu'on regardait : fermer la vue ne doit pas faire
  // perdre l'endroit où l'on en était.
  pageActive = Math.min(pageLivre, (actif()?.pages.length ?? 1) - 1);
  dessiner();
}
