// Saisie accélérée : remplir son classeur sans passer carte par carte.
//
// Ajouter toute sa collection fait peur au nouvel arrivant : des centaines
// de cartes, trois petits boutons sous chacune. Trois raccourcis :
//   · « Saisie rapide » : un toucher sur l'image d'une carte la coche (ou la
//     décoche), au lieu de l'agrandir. On choisit ce que le toucher marque :
//     obtenue, recherchée ou échangeable ;
//   · « J'ai toute l'extension, sauf… » : tout est coché d'un coup, il ne
//     reste qu'à toucher les cartes qui manquent ;
//   · un champ de numéros (« 1-50, 52, 60 ») pour cocher une liste d'un coup.
//
// Les deux derniers se rattrapent par « Annuler », le temps d'un bandeau.
//
// La page fournit ses cartes et sa façon de se redessiner :
//   installerSaisieRapide({ toutes, rafraichir })

const MEMOIRE_SAISIE = 'pokeclasseur-saisie-rapide';

let saisieActive = false;
let saisieTag = 'obt';
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

// --- les numéros -----------------------------------------------------------
// Un numéro de carte est fait d'un préfixe éventuel et d'un nombre : « 52 »,
// « TG05 », « SWSH001 ». Deux numéros se comparent par leur préfixe, puis par
// la valeur du nombre : « 7 », « 07 » et « 007 » désignent la même carte.
function decouperNumero(texte){
  const m = String(texte).trim().match(/^([A-Za-z]*)0*(\d+)$/);
  return m ? { prefixe: m[1].toUpperCase(), nombre: Number(m[2]) } : null;
}

// « 1-50, 52 ; 60 70 » ou « 1 à 50 » : les virgules, points-virgules et
// espaces séparent, le tiret (ou « à ») relie deux bornes.
function lireListeNumeros(texte){
  const morceaux = String(texte)
    .replace(/\s*(?:-|–|à)\s*/g, '-')
    .split(/[,;\s]+/)
    .filter(Boolean);
  return morceaux.map(m => {
    const [debut, fin, ...reste] = m.split('-');
    if(fin === undefined) return { texte: m, seul: debut };
    const a = decouperNumero(debut), b = decouperNumero(fin);
    if(reste.length || !a || !b || a.prefixe !== b.prefixe) return { texte: m, invalide: true };
    return { texte: m, prefixe: a.prefixe, de: Math.min(a.nombre, b.nombre), a: Math.max(a.nombre, b.nombre) };
  });
}

// Les cartes que désigne une liste, et les morceaux qui n'ont rien trouvé.
function cartesDesNumeros(cartes, texte){
  const trouvees = new Map();
  const introuvables = [];
  for(const morceau of lireListeNumeros(texte)){
    let touchees = [];
    if(morceau.seul !== undefined){
      const voulu = decouperNumero(morceau.seul);
      touchees = cartes.filter(c => {
        if(String(c.localId).toUpperCase() === morceau.seul.toUpperCase()) return true;
        const n = decouperNumero(c.localId);
        return voulu && n && n.prefixe === voulu.prefixe && n.nombre === voulu.nombre;
      });
    }else if(!morceau.invalide){
      touchees = cartes.filter(c => {
        const n = decouperNumero(c.localId);
        return n && n.prefixe === morceau.prefixe && n.nombre >= morceau.de && n.nombre <= morceau.a;
      });
    }
    if(touchees.length === 0) introuvables.push(morceau.texte);
    touchees.forEach(c => trouvees.set(c.id, c));
  }
  return { cartes: [...trouvees.values()], introuvables };
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

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const LIBELLE_POSE = { obt: 'obtenue', rech: 'recherchée', ech: 'échangeable' };

// --- l'affichage -----------------------------------------------------------
// La barre est construite une fois ; seuls l'état du bouton et la ligne
// d'aide changent ensuite. Redessiner toute la barre effacerait les numéros
// en cours de saisie.
function construireSaisieRapide(zone){
  zone.innerHTML = `
    <div class="saisie-ligne">
      <span class="saisie-titre">Saisie accélérée :</span>
      <button type="button" class="saisie-btn" id="saisie-mode" aria-pressed="false">⚡ Saisie rapide</button>
      <button type="button" class="saisie-btn" id="saisie-tout-sauf">✅ J'ai toute l'extension, sauf…</button>
      <form class="saisie-numeros" id="saisie-numeros" autocomplete="off">
        <label for="saisie-num">Numéros</label>
        <input id="saisie-num" type="text" placeholder="ex. 1-50, 52, 60" spellcheck="false" enterkeyhint="done">
        <button type="submit" class="saisie-btn" data-tag="obt" title="Marquer ces numéros comme obtenus" aria-label="Marquer ces numéros comme obtenus">✅</button>
        <button type="submit" class="saisie-btn" data-tag="rech" title="Marquer ces numéros comme recherchés" aria-label="Marquer ces numéros comme recherchés">❤️</button>
        <button type="submit" class="saisie-btn" data-tag="ech" title="Marquer ces numéros comme échangeables" aria-label="Marquer ces numéros comme échangeables">🔁</button>
      </form>
    </div>
    <div class="saisie-aide" id="saisie-aide" hidden></div>`;
}

function majSaisieRapide(){
  const bouton = document.getElementById('saisie-mode');
  if(!bouton) return;
  document.body.classList.toggle('saisie-rapide', saisieActive);
  document.body.dataset.saisieTag = saisieTag;
  bouton.classList.toggle('on', saisieActive);
  bouton.setAttribute('aria-pressed', String(saisieActive));
  bouton.textContent = saisieActive ? '⚡ Saisie rapide : activée' : '⚡ Saisie rapide';
  const aide = document.getElementById('saisie-aide');
  aide.hidden = !saisieActive;
  aide.innerHTML = saisieActive ? `
    <span>Un toucher sur une carte la marque</span>
    ${TAGS.map(t => `<button type="button" class="saisie-choix${t === saisieTag ? ' on' : ''}" data-choix="${t}"
        aria-pressed="${t === saisieTag}">${TAG_META[t].emoji} ${TAG_META[t].label}</button>`).join('')}
    <span>· un second toucher la décoche.</span>` : '';
}

function basculerSaisie(active){
  saisieActive = active;
  ecrireMemoireSaisie();
  majSaisieRapide();
}

async function toutSauf(){
  const toutes = saisiePage.toutes();
  if(toutes.length === 0) return;
  const ok = await demanderConfirmation({
    titre: 'Tout cocher, puis retirer les manquantes ?',
    message: `Les <b>${pluriel(toutes.length, 'carte')}</b> de l'extension vont être marquées « obtenue ». `
      + 'Ensuite, touche simplement les cartes qui te manquent pour les décocher.',
    action: 'Tout cocher',
  });
  if(!ok) return;
  const avant = poserTag(toutes, 'obt');
  saisieTag = 'obt';
  basculerSaisie(true);
  saisiePage.rafraichir();
  bandeauSaisie(`${pluriel(avant.length, 'carte')} de plus ${avant.length > 1 ? 'marquées' : 'marquée'} « obtenue ». `
    + 'Touche maintenant celles qui te manquent.', () => restaurer(avant));
}

function cocherNumeros(tag){
  const champ = document.getElementById('saisie-num');
  if(!champ.value.trim()){ champ.focus(); return; }
  const { cartes, introuvables } = cartesDesNumeros(saisiePage.toutes(), champ.value);
  const reserve = introuvables.length
    ? ` Introuvable${introuvables.length > 1 ? 's' : ''} dans cette extension : ${introuvables.map(echapperAttribut).join(', ')}.`
    : '';
  if(cartes.length === 0){
    bandeauSaisie(`Aucune carte ne correspond.${reserve}`);
    return;
  }
  const lot = cartesDuLot(cartes, tag);
  const ecartees = cartes.length - lot.length;
  const avant = poserTag(cartes, tag);
  saisiePage.rafraichir();
  const deja = lot.length - avant.length;
  bandeauSaisie(`${pluriel(avant.length, 'carte')} ${avant.length > 1 ? 'marquées' : 'marquée'} « ${LIBELLE_POSE[tag]} »`
    + `${deja > 0 ? ` (${deja} l'${deja > 1 ? 'étaient' : 'était'} déjà)` : ''}.`
    + `${ecartees > 0 ? ` ${pluriel(ecartees, 'carte')} non ${ecartees > 1 ? 'échangeables écartées' : 'échangeable écartée'}.` : ''}`
    + reserve,
    avant.length ? () => restaurer(avant) : null);
  champ.value = '';
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

  zone.addEventListener('click', (e) => {
    if(e.target.closest('#saisie-mode')) basculerSaisie(!saisieActive);
    else if(e.target.closest('#saisie-tout-sauf')) toutSauf();
    const choix = e.target.closest('[data-choix]');
    if(choix){
      saisieTag = choix.dataset.choix;
      ecrireMemoireSaisie();
      majSaisieRapide();
    }
  });
  zone.addEventListener('submit', (e) => {
    e.preventDefault();
    cocherNumeros(e.submitter?.dataset.tag || 'obt');
  });
}
