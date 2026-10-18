// Remplissage accéléré : remplir son classeur sans passer carte par carte.
//
// Ajouter toute sa collection fait peur au nouvel arrivant : des centaines
// de cartes, trois petits boutons sous chacune. La page ne montre qu'un
// bouton, « Remplissage accéléré », qui ouvre une fenêtre à trois encarts :
//   · « Saisie rapide » : un toucher sur l'image d'une carte la coche (ou la
//     décoche), au lieu de l'agrandir. On choisit ce que le toucher marque :
//     obtenue, recherchée ou échangeable. Une pastille, en bas de l'écran,
//     rappelle que le mode est actif et permet d'en sortir ;
//   · « Tout marquer d'un coup, sauf… » : toute l'extension reçoit le
//     marquage choisi, puis la saisie rapide s'active pour le retirer aux
//     cartes qui font exception ;
//   · « Par Pokémon / numéro » : une liste de noms ou de numéros
//     (« Pikachu, Dracaufeu, 1-50, 52 »). Les cartes trouvées s'affichent en
//     vignettes : on touche celles à marquer.
//
// Les deux derniers se rattrapent par « Annuler ».
//
// La page fournit ses cartes et sa façon de se redessiner :
//   installerSaisieRapide({ toutes, rafraichir })

const MEMOIRE_SAISIE = 'pokeclasseur-saisie-rapide';

let saisieActive = false;
let saisieTag = 'obt';
let toutTag = 'obt';
let saisiePage = null;   // { toutes, rafraichir }

function lireMemoireSaisie(){
  try{
    const m = JSON.parse(sessionStorage.getItem(MEMOIRE_SAISIE) || 'null');
    if(m && TAGS.includes(m.tag)){ saisieActive = !!m.active; saisieTag = m.tag; }
  }catch(err){ /* mémoire indisponible : on démarre en mode normal */ }
}

// Retenu le temps de la visite : passer à l'extension suivante ne doit pas
// obliger à tout réactiver.
function ecrireMemoireSaisie(){
  try{ sessionStorage.setItem(MEMOIRE_SAISIE, JSON.stringify({ active: saisieActive, tag: saisieTag })); }
  catch(err){ /* sans mémoire, le mode tient jusqu'au changement de page */ }
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const LIBELLE_POSE = { obt: 'obtenue', rech: 'recherchée', ech: 'échangeable' };

// --- la liste : des noms et des numéros ----------------------------------------
// Un numéro de carte est fait d'un préfixe éventuel et d'un nombre : « 52 »,
// « TG05 », « SWSH001 ». Deux numéros se comparent par leur préfixe, puis par
// la valeur du nombre : « 7 », « 07 » et « 007 » désignent la même carte.
function decouperNumero(texte){
  const m = String(texte).trim().match(/^([A-Za-z]*)0*(\d+)$/);
  return m ? { prefixe: m[1].toUpperCase(), nombre: Number(m[2]) } : null;
}

function cartesDuNumero(cartes, texte){
  const voulu = decouperNumero(texte);
  return cartes.filter(c => {
    if(String(c.localId).toUpperCase() === texte.toUpperCase()) return true;
    const n = decouperNumero(c.localId);
    return voulu && n && n.prefixe === voulu.prefixe && n.nombre === voulu.nombre;
  });
}

// « 1-50 », « 1 à 50 », « TG01-TG10 » : les deux bornes partagent leur préfixe.
function cartesDeLaPlage(cartes, debut, fin){
  const a = decouperNumero(debut), b = decouperNumero(fin);
  if(!a || !b || a.prefixe !== b.prefixe) return [];
  const de = Math.min(a.nombre, b.nombre), jusqua = Math.max(a.nombre, b.nombre);
  return cartes.filter(c => {
    const n = decouperNumero(c.localId);
    return n && n.prefixe === a.prefixe && n.nombre >= de && n.nombre <= jusqua;
  });
}

// Majuscules, accents, tirets et points ne comptent pas : « pikachu ex »
// trouve « Pikachu-ex », « ho oh » trouve « Ho-Oh ».
function normaliserNom(texte){
  return String(texte).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[\s\-–'’.]+/g, ' ').trim();
}

// Un nom désigne les cartes où il figure comme mot entier : « Mew » trouve
// « Mew » et « Mew-ex », pas « Mewtwo » ; « Dracaufeu » trouve aussi
// « Méga-Dracaufeu Y ex ». Faute de mieux, un morceau de nom (« pika »)
// suffit.
function cartesDuNom(cartes, texte){
  const voulu = normaliserNom(texte);
  if(!voulu) return [];
  const entiers = cartes.filter(c => ` ${normaliserNom(c.name)} `.includes(` ${voulu} `));
  return entiers.length ? entiers : cartes.filter(c => normaliserNom(c.name).includes(voulu));
}

const MOTIF_PLAGE = /^([A-Za-z]*\d+)\s*(?:-|–|à)\s*([A-Za-z]*\d+)$/;
const MOTIF_NUMERO = /^[A-Za-z]*\d+$/;

// Les virgules, points-virgules et retours à la ligne séparent les éléments.
// Des numéros peuvent aussi n'être séparés que par des espaces (« 52 60 70 »).
// Ce qui ne donne rien comme numéro est cherché comme nom : « Porygon2 » a
// l'allure d'un numéro, mais aucune carte ne porte ce numéro-là.
function lireListe(cartes, texte){
  const elements = [];
  for(const brut of String(texte).split(/[,;\n]+/)){
    const element = brut.trim();
    if(!element) continue;
    const plage = element.match(MOTIF_PLAGE);
    const mots = element.split(/\s+/);
    // « precis » : un numéro ou une plage désignent exactement ce qu'on veut ;
    // un nom peut en désigner plusieurs, parmi lesquelles on choisira.
    if(plage){
      elements.push({ texte: element, precis: true, cartes: cartesDeLaPlage(cartes, plage[1], plage[2]) });
    }else if(mots.length > 1 && mots.every(m => MOTIF_NUMERO.test(m))
             && mots.every(m => cartesDuNumero(cartes, m).length)){
      mots.forEach(m => elements.push({ texte: m, precis: true, cartes: cartesDuNumero(cartes, m) }));
    }else{
      const parNumero = MOTIF_NUMERO.test(element) ? cartesDuNumero(cartes, element) : [];
      elements.push(parNumero.length
        ? { texte: element, precis: true, cartes: parNumero }
        : { texte: element, precis: false, cartes: cartesDuNom(cartes, element) });
    }
  }
  const uniques = new Map();
  elements.forEach(e => e.cartes.forEach(c => uniques.set(c.id, c)));
  return { elements, cartes: [...uniques.values()] };
}

// --- marquer un lot, et pouvoir revenir en arrière ---------------------------
// Pose (sans basculer) un tag sur un lot de cartes. Renvoie de quoi annuler :
// l'état de chaque carte avant le changement.
function poserTag(cartes, tag){
  const lot = cartesDuLot(cartes, tag).filter(c => !tagState[c.id]?.[tag]);
  const avant = lot.map(c => [c.id, { ...(tagState[c.id] || emptyTagState()) }]);
  lot.forEach(c => {
    if(!tagState[c.id]) tagState[c.id] = emptyTagState();
    tagState[c.id][tag] = true;
  });
  if(lot.length){
    saveTags();
    synchroniser(() => enregistrerCartes(lot.map(c => [c.id, tagState[c.id]])));
  }
  return avant;
}

function restaurer(avant){
  if(!avant.length) return;
  avant.forEach(([id, etat]) => { tagState[id] = etat; });
  saveTags();
  synchroniser(() => enregistrerCartes(avant.map(([id]) => [id, tagState[id]])));
  saisiePage.rafraichir();
}

let minuteurBandeauSaisie = null;
function bandeauSaisie(message, annulation){
  let bandeau = document.getElementById('bandeau-saisie');
  if(!bandeau){
    bandeau = document.createElement('div');
    bandeau.id = 'bandeau-saisie';
    bandeau.className = 'bandeau-saisie';
    bandeau.setAttribute('role', 'status');
    document.body.appendChild(bandeau);
  }
  bandeau.innerHTML = `<span>${message}</span>${annulation ? '<button type="button">Annuler</button>' : ''}`;
  bandeau.hidden = false;
  if(annulation){
    bandeau.querySelector('button').addEventListener('click', () => {
      bandeau.hidden = true;
      annulation();
    }, { once: true });
  }
  clearTimeout(minuteurBandeauSaisie);
  minuteurBandeauSaisie = setTimeout(() => { bandeau.hidden = true; }, 9000);
}

// --- le bouton et la fenêtre ---------------------------------------------------
function boutonsDeTag(classe, libelles){
  return TAGS.map(t => `<button type="button" class="${classe}" data-tag="${t}">${TAG_META[t].emoji} ${libelles[t]}</button>`).join('');
}

function construireSaisieRapide(zone){
  zone.innerHTML = `
    <button type="button" class="remplissage-btn" id="remplissage-ouvrir" aria-haspopup="dialog">⚡ Remplissage accéléré</button>
    <dialog class="remplissage" id="remplissage" aria-labelledby="remplissage-titre">
      <div class="remplissage-corps">
      <div class="remplissage-tete">
        <h2 id="remplissage-titre">Remplissage accéléré</h2>
        <button type="button" class="remplissage-fermer" aria-label="Fermer">✕</button>
      </div>
      <p class="remplissage-intro">Trois façons de remplir ton classeur sans passer carte par carte.</p>

      <section class="encart" aria-labelledby="encart-saisie">
        <h3 id="encart-saisie">⚡ Saisie rapide</h3>
        <p>Touche une carte pour la marquer, touche-la de nouveau pour la décocher : plus besoin des petits boutons sous chaque carte.</p>
        <div class="encart-choix" role="group" aria-label="Ce que marque un toucher">
          <span>Un toucher marque :</span>
          ${boutonsDeTag('choix-tag', { obt: 'Obtenue', rech: 'Recherchée', ech: 'Échangeable' })}
        </div>
        <button type="button" class="encart-action" id="remplissage-saisie"></button>
      </section>

      <section class="encart" aria-labelledby="encart-tout">
        <h3 id="encart-tout">✅ Tout marquer d'un coup, sauf…</h3>
        <p>Toutes les cartes de l'extension reçoivent le marquage choisi. Ensuite, tu touches celles qui font exception pour le leur retirer.</p>
        <div class="encart-choix" role="group" aria-label="Le marquage à poser partout">
          <span>Tout marquer :</span>
          ${boutonsDeTag('tout-tag', { obt: 'Obtenue', rech: 'Recherchée', ech: 'Échangeable' })}
        </div>
        <button type="button" class="encart-action" id="remplissage-tout"></button>
      </section>

      <section class="encart" aria-labelledby="encart-liste">
        <h3 id="encart-liste"><label for="remplissage-liste">🔎 Par Pokémon / numéro</label></h3>
        <p>Tape des noms ou des numéros, séparés par des virgules, puis touche les cartes à marquer.</p>
        <input type="text" id="remplissage-liste" placeholder="ex. Pikachu, Dracaufeu, 1-50, 52"
               autocomplete="off" spellcheck="false" enterkeyhint="done">
        <div class="apercu" id="remplissage-apercu" aria-live="polite"></div>
        <div class="encart-choix" role="group" aria-label="Marquer ces cartes">
          <span>Marquer comme :</span>
          ${boutonsDeTag('marquer-tag', { obt: 'Obtenues', rech: 'Recherchées', ech: 'Échangeables' })}
        </div>
        <p class="resultat" id="remplissage-resultat" role="status" hidden></p>
      </section>
      </div>
    </dialog>`;
}

function majSaisieRapide(){
  document.body.classList.toggle('saisie-rapide', saisieActive);
  document.body.dataset.saisieTag = saisieTag;

  document.querySelectorAll('.choix-tag').forEach(b => {
    b.classList.toggle('on', b.dataset.tag === saisieTag);
    b.setAttribute('aria-pressed', String(b.dataset.tag === saisieTag));
  });
  const action = document.getElementById('remplissage-saisie');
  if(action){
    action.textContent = saisieActive ? 'Arrêter la saisie rapide' : 'Commencer la saisie rapide';
    action.classList.toggle('secondaire', saisieActive);
  }
  document.querySelectorAll('.tout-tag').forEach(b => {
    b.classList.toggle('on', b.dataset.tag === toutTag);
    b.setAttribute('aria-pressed', String(b.dataset.tag === toutTag));
  });
  // Le décompte suit le marquage : en « échangeable », les cartes que Pocket
  // interdit d'échanger ne seront pas touchées.
  const tout = document.getElementById('remplissage-tout');
  if(tout) tout.textContent = `Tout marquer « ${LIBELLE_POSE[toutTag]} » (${pluriel(cartesDuLot(saisiePage.toutes(), toutTag).length, 'carte')})`;

  // Le bouton du haut défile hors de vue : la pastille, elle, reste en bas
  // de l'écran tant que le mode est actif, pour qu'on sache pourquoi un
  // toucher n'agrandit plus la carte, et comment en sortir.
  let pastille = document.getElementById('pastille-saisie');
  if(saisieActive && !pastille){
    pastille = document.createElement('div');
    pastille.id = 'pastille-saisie';
    pastille.className = 'pastille-saisie';
    pastille.setAttribute('role', 'status');
    document.body.appendChild(pastille);
    pastille.addEventListener('click', (e) => {
      if(e.target.closest('[data-terminer]')) basculerSaisie(false);
    });
  }
  if(pastille){
    pastille.hidden = !saisieActive;
    pastille.innerHTML = `<span>⚡ Saisie rapide : un toucher marque ${TAG_META[saisieTag].emoji} ${TAG_META[saisieTag].label}</span>
      <button type="button" data-terminer>Terminer</button>`;
  }
}

function basculerSaisie(active){
  saisieActive = active;
  ecrireMemoireSaisie();
  majSaisieRapide();
}

function ouvrirRemplissage(){
  const fenetre = document.getElementById('remplissage');
  majSaisieRapide();
  majApercu();
  document.getElementById('remplissage-resultat').hidden = true;
  fenetre.showModal();
}

function fermerRemplissage(){
  document.getElementById('remplissage').close();
}

function toutSauf(){
  const tag = toutTag;
  const avant = poserTag(saisiePage.toutes(), tag);
  saisieTag = tag;
  fermerRemplissage();
  basculerSaisie(true);
  saisiePage.rafraichir();
  bandeauSaisie(`${pluriel(avant.length, 'carte')} de plus ${avant.length > 1 ? 'marquées' : 'marquée'} « ${LIBELLE_POSE[tag]} ». `
    + 'Touche maintenant celles qui font exception.', () => restaurer(avant));
}

// Ce que la liste désigne en ce moment, et ce qu'on en retient. Un numéro ou
// une plage sont précis : leurs cartes sont retenues d'emblée. Un nom peut en
// désigner plusieurs (« Pikachu » : la carte simple et quatre Pikachu-ex) :
// rien n'est retenu d'office, sauf s'il n'en trouve qu'une, et l'on touche
// les vignettes pour choisir.
let listeCourante = { elements: [], cartes: [] };
const selection = new Set();
const elementsConnus = new Set();

function majApercu(){
  const champ = document.getElementById('remplissage-liste');
  listeCourante = lireListe(saisiePage.toutes(), champ.value);
  const { elements, cartes } = listeCourante;
  // Le choix par défaut ne s'applique qu'à un élément nouveau : continuer à
  // taper ne doit pas défaire ce qu'on vient de choisir plus haut.
  const presents = new Set(elements.map(e => e.texte));
  [...elementsConnus].forEach(t => { if(!presents.has(t)) elementsConnus.delete(t); });
  for(const e of elements){
    if(elementsConnus.has(e.texte)) continue;
    elementsConnus.add(e.texte);
    if(e.precis || e.cartes.length === 1) e.cartes.forEach(c => selection.add(c.id));
  }
  const trouvees = new Set(cartes.map(c => c.id));
  [...selection].forEach(id => { if(!trouvees.has(id)) selection.delete(id); });
  dessinerApercu();
}

function vignetteListe(c){
  const choisie = selection.has(c.id);
  return `<button type="button" class="vignette${choisie ? ' on' : ''}" data-id="${attrCarte(c.id)}"
      aria-pressed="${choisie}" title="${attrCarte(c.name)} #${attrCarte(c.localId)}">
    <img src="${attrCarte(c.image || `images/cards/${c.id}.png`)}" alt="" loading="lazy"
         data-fallback="${attrCarte(c.imageSecours ?? `images/cards/${c.id}.png`)}" onerror="cardImgFallback(this)">
    <span>${echapperAttribut(c.name)} <i>#${echapperAttribut(c.localId)}</i></span>
  </button>`;
}

function dessinerApercu(){
  const apercu = document.getElementById('remplissage-apercu');
  const { elements } = listeCourante;
  if(elements.length === 0){ apercu.innerHTML = ''; majSelection(); return; }
  apercu.innerHTML = elements.map((e, i) => e.cartes.length === 0
    ? `<div class="groupe rien"><b>${echapperAttribut(e.texte)}</b> : introuvable dans cette extension</div>`
    : `<div class="groupe">
        <div class="groupe-tete">
          <b>${echapperAttribut(e.texte)}</b> <span>${pluriel(e.cartes.length, 'carte')}</span>
          ${e.cartes.length > 1
            ? `<button type="button" data-groupe="${i}" data-tout>Toutes</button>
               <button type="button" data-groupe="${i}" data-aucune>Aucune</button>`
            : ''}
        </div>
        <div class="vignettes">${e.cartes.map(vignetteListe).join('')}</div>
      </div>`).join('')
    + '<p class="apercu-total" id="remplissage-total"></p>';
  majSelection();
}

// Une sélection qui change ne redessine pas l'aperçu : les vignettes
// gardent leur image et la liste ne saute pas sous le doigt.
function majSelection(){
  const retenues = listeCourante.cartes.filter(c => selection.has(c.id)).length;
  document.querySelectorAll('.marquer-tag').forEach(b => { b.disabled = retenues === 0; });
  document.querySelectorAll('#remplissage-apercu .vignette').forEach(v => {
    const choisie = selection.has(v.dataset.id);
    v.classList.toggle('on', choisie);
    v.setAttribute('aria-pressed', String(choisie));
  });
  const total = document.getElementById('remplissage-total');
  if(total){
    const trouvees = listeCourante.cartes.length;
    total.textContent = `${retenues} sélectionnée${retenues > 1 ? 's' : ''} sur ${pluriel(trouvees, 'carte')} `
      + `trouvée${trouvees > 1 ? 's' : ''}. Touche une carte pour la choisir ou l'écarter.`;
  }
}

function marquerLaListe(tag){
  const champ = document.getElementById('remplissage-liste');
  const cartes = listeCourante.cartes.filter(c => selection.has(c.id));
  if(cartes.length === 0){ champ.focus(); return; }
  const lot = cartesDuLot(cartes, tag);
  const ecartees = cartes.length - lot.length;
  const avant = poserTag(cartes, tag);
  const deja = lot.length - avant.length;
  saisiePage.rafraichir();

  const resultat = document.getElementById('remplissage-resultat');
  resultat.innerHTML = `<span>${pluriel(avant.length, 'carte')} ${avant.length > 1 ? 'marquées' : 'marquée'} « ${LIBELLE_POSE[tag]} »`
    + `${deja > 0 ? ` (${deja} l'${deja > 1 ? 'étaient' : 'était'} déjà)` : ''}.`
    + `${ecartees > 0 ? ` ${pluriel(ecartees, 'carte')} non ${ecartees > 1 ? 'échangeables écartées' : 'échangeable écartée'}.` : ''}</span>`
    + (avant.length ? ' <button type="button">Annuler</button>' : '');
  resultat.hidden = false;
  resultat.querySelector('button')?.addEventListener('click', () => {
    restaurer(avant);
    resultat.innerHTML = '<span>Marquage annulé.</span>';
  }, { once: true });
  champ.value = '';
  selection.clear();
  elementsConnus.clear();
  majApercu();
}

// --- le toucher sur une carte ------------------------------------------------
// Écouté en phase de capture, avant celui de cards.js qui agrandit la carte :
// en saisie rapide, le toucher coche, et l'agrandissement n'a pas lieu.
function toucherCarte(e){
  if(!saisieActive) return;
  const image = e.target.closest('#content .card-tile .card-img-wrap');
  if(!image) return;
  e.stopPropagation();
  e.preventDefault();
  const id = image.closest('.card-tile').dataset.carte;
  if(saisieTag === 'ech' && raisonsParCarte.has(id)){
    messageFugace(raisonsParCarte.get(id));
    return;
  }
  toggleTag(id, saisieTag);
  saisiePage.rafraichir();
}

function installerSaisieRapide(page){
  const zone = document.getElementById('saisie-rapide');
  if(!zone) return;
  saisiePage = page;
  lireMemoireSaisie();
  construireSaisieRapide(zone);
  majSaisieRapide();
  document.addEventListener('click', toucherCarte, true);

  const fenetre = document.getElementById('remplissage');
  document.getElementById('remplissage-ouvrir').addEventListener('click', ouvrirRemplissage);
  fenetre.querySelector('.remplissage-fermer').addEventListener('click', fermerRemplissage);
  // Un clic sur le voile, autour de la fenêtre, la referme. Le contenu vit
  // dans une enveloppe : un clic dans la fenêtre ne vise jamais la fenêtre
  // elle-même.
  fenetre.addEventListener('click', (e) => { if(e.target === fenetre) fermerRemplissage(); });

  fenetre.addEventListener('click', (e) => {
    const choix = e.target.closest('.choix-tag');
    if(choix){
      saisieTag = choix.dataset.tag;
      ecrireMemoireSaisie();
      majSaisieRapide();
      return;
    }
    if(e.target.closest('#remplissage-saisie')){
      const commencer = !saisieActive;
      basculerSaisie(commencer);
      if(commencer) fermerRemplissage();
      return;
    }
    const choixTout = e.target.closest('.tout-tag');
    if(choixTout){
      toutTag = choixTout.dataset.tag;
      majSaisieRapide();
      return;
    }
    if(e.target.closest('#remplissage-tout')){ toutSauf(); return; }
    const vignette = e.target.closest('.vignette');
    if(vignette){
      const id = vignette.dataset.id;
      selection.has(id) ? selection.delete(id) : selection.add(id);
      majSelection();
      return;
    }
    const groupe = e.target.closest('[data-groupe]');
    if(groupe){
      const cartes = listeCourante.elements[Number(groupe.dataset.groupe)]?.cartes ?? [];
      cartes.forEach(c => groupe.hasAttribute('data-tout') ? selection.add(c.id) : selection.delete(c.id));
      majSelection();
      return;
    }
    const marquer = e.target.closest('.marquer-tag');
    if(marquer) marquerLaListe(marquer.dataset.tag);
  });

  const champ = document.getElementById('remplissage-liste');
  champ.addEventListener('input', majApercu);
  // Entrée marque « obtenue » : le geste le plus courant.
  champ.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); marquerLaListe('obt'); }
  });
}
