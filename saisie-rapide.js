(() => {

const MEMOIRE_SAISIE = 'pokeclasseur-saisie-rapide';

let saisieActive = false;
let saisieTag = 'obt';
let toutTag = 'obt';
let saisiePage = null;

function lireMemoireSaisie(){
  try{
    const m = JSON.parse(sessionStorage.getItem(MEMOIRE_SAISIE) || 'null');
    if(m && TAGS.includes(m.tag)){ saisieActive = !!m.active; saisieTag = m.tag; }
  }catch(err){ }
}

function ecrireMemoireSaisie(){
  try{ sessionStorage.setItem(MEMOIRE_SAISIE, JSON.stringify({ active: saisieActive, tag: saisieTag })); }
  catch(err){ }
}

const STYLE_REMPLISSAGE = `
  .saisie-row{padding-bottom:28px;}
  .remplissage-btn{font-size:14px;font-weight:500;line-height:1.2;padding:10px 18px;border-radius:5px;cursor:pointer;border:1px solid rgba(var(--gold-rgb),0.55);background:rgba(var(--gold-rgb),0.12);color:var(--accent-clair);font-family:inherit;transition:.12s;}
  .remplissage-btn:hover{background:rgba(var(--gold-rgb),0.2)}
  .remplissage-btn,.choix-tag,.tout-tag,.lot-tag,.marquer-tag,.encart-action{-webkit-tap-highlight-color:transparent}
  .remplissage{padding:0;border:1px solid rgba(var(--trait-rgb),0.14);border-radius:10px;background:var(--ink);color:var(--text-on-ink);width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);box-shadow:0 24px 60px rgba(0,0,0,0.55);}
  .remplissage::backdrop{background:rgba(10,11,13,0.72)}
  .remplissage-corps{padding:20px 22px 22px;display:flex;flex-direction:column;gap:14px;}
  .remplissage-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;}
  .remplissage-tete h2{font-size:22px;}
  .remplissage-fermer{background:none;border:none;color:var(--text-on-ink-dim);font-size:18px;cursor:pointer;padding:6px 10px;border-radius:4px;font-family:inherit;}
  .remplissage-fermer:hover{color:var(--text-on-ink);background:rgba(var(--trait-rgb),0.06)}
  .remplissage-intro{margin:-6px 0 0;font-size:13.5px;color:var(--text-on-ink-dim);}
  .encart{background:var(--ink-soft);border:1px solid rgba(var(--trait-rgb),0.1);border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;}
  .encart h3{font-family:'IBM Plex Sans',sans-serif;font-size:15px;font-weight:600;}
  .encart h3 label{cursor:inherit}
  .encart p{margin:0;font-size:13px;line-height:1.5;color:var(--text-on-ink-dim);}
  .encart-choix{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;color:var(--text-on-ink-dim);}
  .choix-tag,.tout-tag,.marquer-tag,.lot-tag{font-size:13px;line-height:1.2;padding:6px 11px;border-radius:4px;cursor:pointer;border:1px solid rgba(var(--trait-rgb),0.16);background:transparent;color:var(--text-on-ink);font-family:inherit;transition:.12s;}
  .choix-tag:hover,.tout-tag:hover,.lot-tag:hover,.marquer-tag:hover:not(:disabled){border-color:rgba(var(--trait-rgb),0.35);background:rgba(var(--trait-rgb),0.05)}
  .choix-tag.on,.tout-tag.on{color:var(--accent-clair);border-color:rgba(var(--gold-rgb),0.55);background:rgba(var(--gold-rgb),0.12)}
  .marquer-tag:disabled{opacity:.4;cursor:default}
  .encart-action{align-self:flex-start;font-size:13.5px;font-weight:600;padding:9px 16px;border-radius:5px;cursor:pointer;border:1px solid transparent;background:var(--gold);color:var(--ink);font-family:inherit;}
  .encart-action:hover{filter:brightness(1.08)}
  .encart-action.secondaire{background:transparent;color:var(--text-on-ink);border-color:rgba(var(--trait-rgb),0.2);font-weight:500}
  .encart input{width:100%;box-sizing:border-box;background:var(--ink);border:1px solid rgba(var(--trait-rgb),0.16);color:var(--text-on-ink);padding:9px 12px;border-radius:5px;font-size:14px;font-family:inherit;}
  .encart input::placeholder{color:var(--text-on-ink-dim)}
  .apercu{display:flex;flex-direction:column;gap:12px;}
  .apercu:empty{display:none}
  .groupe-tete{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--text-on-ink);margin-bottom:6px;}
  .groupe-tete span{color:var(--text-on-ink-dim)}
  .groupe-tete button{background:none;border:none;color:var(--accent-clair);font:inherit;cursor:pointer;padding:2px;text-decoration:underline;text-underline-offset:3px;}
  .groupe.rien{font-size:12.5px;color:var(--alerte);}
  .vignettes{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;max-height:300px;overflow-y:auto;padding:2px;}
  .vignette{position:relative;display:flex;flex-direction:column;gap:4px;padding:4px;border-radius:7px;border:2px solid transparent;background:none;cursor:pointer;font:inherit;color:var(--text-on-ink);text-align:center;-webkit-tap-highlight-color:transparent;}
  .vignette img{width:100%;aspect-ratio:2.5/3.5;object-fit:contain;border-radius:4px;opacity:.4;filter:grayscale(.7);transition:opacity .12s,filter .12s;}
  .vignette span{font-size:10.5px;line-height:1.25;}
  .vignette i{font-style:normal;color:var(--text-on-ink-dim);}
  .vignette.on{border-color:var(--gold);background:rgba(var(--gold-rgb),0.1);}
  .vignette.on img{opacity:1;filter:none;}
  .vignette.on::after{content:'✓';position:absolute;top:8px;right:8px;width:20px;height:20px;border-radius:50%;background:var(--gold);color:var(--ink);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;}
  .apercu .apercu-total{color:var(--accent-clair);font-weight:500;}
  .resultat{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px;color:var(--text-on-ink) !important;}
  .resultat[hidden]{display:none}
  .encart .encart-note{font-size:12px;}
  label.encart-action{display:inline-block;text-align:center;}
  .video-etat[hidden]{display:none}
  .video-etat{display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--text-on-ink);}
  .video-etat progress{width:100%;height:8px;accent-color:var(--gold);}
  .video-etat .erreur{color:var(--alerte) !important;}
  .video-comparaison{display:flex;gap:14px;align-items:center;flex-wrap:wrap;}
  .video-comparaison figure{margin:0;flex:1 1 200px;}
  .video-comparaison img{display:block;width:100%;border-radius:6px;border:1px solid rgba(var(--trait-rgb),0.16);}
  .video-comparaison figcaption{font-size:11.5px;color:var(--text-on-ink-dim);margin-top:4px;}
  .video-lu{flex:1 1 160px;font-size:12.5px;color:var(--text-on-ink-dim) !important;}
  .video-compteur{display:block;margin-top:4px;font-size:17px;font-weight:600;color:var(--accent-clair);}
  .video-etat ul{margin:0;padding-left:18px;}
  .video-boutons{display:flex;gap:10px;flex-wrap:wrap;}
  .lien-video{background:none;border:none;color:var(--accent-clair);font:inherit;cursor:pointer;padding:2px;text-decoration:underline;text-underline-offset:3px;align-self:flex-start;}
  .resultat button,.pastille-saisie button{background:none;border:none;color:var(--accent-clair);font:inherit;font-weight:600;cursor:pointer;padding:4px 2px;text-decoration:underline;text-underline-offset:3px;white-space:nowrap;}
  body.saisie-rapide #content .card-img-wrap,
  body.saisie-rapide #content .card-img-wrap img{cursor:pointer}
  body.saisie-rapide[data-saisie-tag="obt"] .card-tile:not(:has(.tag-toggle.obt.active)) .card-img-wrap img,
  body.saisie-rapide[data-saisie-tag="rech"] .card-tile:not(:has(.tag-toggle.rech.active)) .card-img-wrap img,
  body.saisie-rapide[data-saisie-tag="ech"] .card-tile:not(:has(.tag-toggle.ech.active)) .card-img-wrap img{filter:grayscale(1);opacity:.45}
  body.saisie-rapide .card-img-wrap::after{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;background:center/16px no-repeat;box-shadow:0 1px 3px rgba(0,0,0,.45);pointer-events:none}
  body.saisie-rapide[data-saisie-tag="obt"] .card-tile:has(.tag-toggle.obt.active) .card-img-wrap::after{content:'';background-color:var(--marque-obt);background-image:${pictogrammeEnImage('obt', '#FFFFFF')}}
  body.saisie-rapide[data-saisie-tag="rech"] .card-tile:has(.tag-toggle.rech.active) .card-img-wrap::after{content:'';background-color:var(--marque-rech);background-image:${pictogrammeEnImage('rech', '#FFFFFF')}}
  body.saisie-rapide[data-saisie-tag="ech"] .card-tile:has(.tag-toggle.ech.active) .card-img-wrap::after{content:'';background-color:var(--marque-ech);background-image:${pictogrammeEnImage('ech', '#16213E')}}
  .pastille-saisie{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:49;display:flex;align-items:center;gap:14px;width:max-content;max-width:calc(100vw - 32px);background:var(--ink-soft);border:1px solid rgba(var(--gold-rgb),0.55);border-radius:999px;padding:9px 12px 9px 18px;font-size:13.5px;color:var(--text-on-ink);box-shadow:0 8px 28px rgba(0,0,0,.35);}
  .pastille-saisie[hidden]{display:none}
  body.saisie-rapide .bandeau-saisie{bottom:84px}
  .bandeau-saisie{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:50;display:flex;align-items:center;gap:16px;width:max-content;max-width:calc(100vw - 32px);background:var(--ink-soft);border:1px solid rgba(var(--gold-rgb),0.45);border-radius:6px;padding:12px 18px;font-size:13.5px;color:var(--text-on-ink);box-shadow:0 8px 28px rgba(0,0,0,.35);}
  .bandeau-saisie[hidden]{display:none}
  .bandeau-saisie button{background:none;border:none;color:var(--accent-clair);font:inherit;font-weight:600;cursor:pointer;padding:4px 2px;text-decoration:underline;text-underline-offset:3px;white-space:nowrap;}
  @media(max-width:720px){
    .saisie-row{padding-bottom:22px}
    .remplissage-btn{width:100%;min-height:44px}
    .remplissage-corps{padding:16px 16px 18px}
    .choix-tag,.tout-tag,.lot-tag,.marquer-tag{min-height:40px}
    .vignettes{grid-template-columns:repeat(auto-fill,minmax(74px,1fr))}
    .encart-action{min-height:44px;align-self:stretch}
    .encart input{min-height:44px;font-size:16px}
  }
`;

function poserStyleRemplissage(){
  if(document.getElementById('style-remplissage')) return;
  const style = document.createElement('style');
  style.id = 'style-remplissage';
  style.textContent = STYLE_REMPLISSAGE;
  document.head.appendChild(style);
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const LIBELLE_POSE = { obt: 'obtenue', rech: 'recherchée', ech: 'échangeable' };

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

function cartesDeLaPlage(cartes, debut, fin){
  const a = decouperNumero(debut), b = decouperNumero(fin);
  if(!a || !b || a.prefixe !== b.prefixe) return [];
  const de = Math.min(a.nombre, b.nombre), jusqua = Math.max(a.nombre, b.nombre);
  return cartes.filter(c => {
    const n = decouperNumero(c.localId);
    return n && n.prefixe === a.prefixe && n.nombre >= de && n.nombre <= jusqua;
  });
}

function normaliserNom(texte){
  return String(texte).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[\s\-–'’.]+/g, ' ').trim();
}

function cartesDuNom(cartes, texte){
  const voulu = normaliserNom(texte);
  if(!voulu) return [];
  const entiers = cartes.filter(c => ` ${normaliserNom(c.name)} `.includes(` ${voulu} `));
  return entiers.length ? entiers : cartes.filter(c => normaliserNom(c.name).includes(voulu));
}

const MOTIF_PLAGE = /^([A-Za-z]*\d+)\s*(?:-|–|à)\s*([A-Za-z]*\d+)$/;
const MOTIF_NUMERO = /^[A-Za-z]*\d+$/;

function lireListe(cartes, texte){
  const elements = [];
  for(const brut of String(texte).split(/[,;\n]+/)){
    const element = brut.trim();
    if(!element) continue;
    const plage = element.match(MOTIF_PLAGE);
    const mots = element.split(/\s+/);
    if(plage){
      elements.push({ texte: element, precis: true, plage: true, cartes: cartesDeLaPlage(cartes, plage[1], plage[2]) });
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

function boutonsDeTag(classe, libelles){
  return TAGS.map(t => `<button type="button" class="${classe}" data-tag="${t}">${pictogramme(t)}${libelles[t]}</button>`).join('');
}

function construireSaisieRapide(zone){
  zone.innerHTML = `
    <button type="button" class="remplissage-btn" id="remplissage-ouvrir" aria-haspopup="dialog">${pictogramme('eclair')}Remplissage accéléré</button>
    <dialog class="remplissage" id="remplissage" aria-labelledby="remplissage-titre">
      <div class="remplissage-corps">
      <div class="remplissage-tete">
        <h2 id="remplissage-titre">Remplissage accéléré</h2>
        <button type="button" class="remplissage-fermer" aria-label="Fermer">✕</button>
      </div>
      <p class="remplissage-intro">${saisiePage.video ? 'Cinq' : 'Quatre'} façons de remplir ton classeur sans passer carte par carte.</p>

      <section class="encart" aria-labelledby="encart-lot">
        <h3 id="encart-lot">${pictogramme('pile')} Marquer d'un coup <span id="remplissage-lot-nombre"></span></h3>
        <p>Pose un marquage sur toutes les cartes affichées, en tenant compte de tes filtres. Si elles le portent déjà toutes, il leur est retiré.</p>
        <div class="encart-choix" role="group" aria-label="Marquer les cartes affichées">
          ${boutonsDeTag('lot-tag', { obt: 'Obtenues', rech: 'Recherchées', ech: 'Échangeables' })}
        </div>
      </section>

      ${saisiePage.video ? `
      <section class="encart" aria-labelledby="encart-video">
        <h3 id="encart-video">${pictogramme('video')} Depuis une vidéo du jeu</h3>
        <p>Dans Pokémon TCG Pocket, ouvre ta Collection, active « Tout afficher » et place-toi sur le titre de cette extension. Lance l'enregistrement de l'écran de ton téléphone, fais défiler jusqu'à la dernière carte, puis choisis la vidéo ici.</p>
        <p class="encart-note">La vidéo est lue sur ton appareil : elle n'est envoyée nulle part.</p>
        <label class="encart-action" for="remplissage-video" id="remplissage-video-bouton">Choisir la vidéo</label>
        <input type="file" id="remplissage-video" accept="video/*" hidden>
        <div class="video-etat" id="video-etat" role="status" hidden></div>
      </section>
` : ''}
      <section class="encart" aria-labelledby="encart-saisie">
        <h3 id="encart-saisie">${pictogramme('eclair')} Saisie rapide</h3>
        <p>Touche une carte pour la marquer, touche-la de nouveau pour la décocher : plus besoin des petits boutons sous chaque carte.</p>
        <div class="encart-choix" role="group" aria-label="Ce que marque un toucher">
          <span>Un toucher marque :</span>
          ${boutonsDeTag('choix-tag', { obt: 'Obtenue', rech: 'Recherchée', ech: 'Échangeable' })}
        </div>
        <button type="button" class="encart-action" id="remplissage-saisie"></button>
      </section>

      <section class="encart" aria-labelledby="encart-tout">
        <h3 id="encart-tout">${pictogramme('tout')} Tout marquer d'un coup, sauf…</h3>
        <p>Toutes les cartes ${saisiePage.ensemble} reçoivent le marquage choisi. Ensuite, tu touches celles qui font exception pour le leur retirer.</p>
        <div class="encart-choix" role="group" aria-label="Le marquage à poser partout">
          <span>Tout marquer :</span>
          ${boutonsDeTag('tout-tag', { obt: 'Obtenue', rech: 'Recherchée', ech: 'Échangeable' })}
        </div>
        <button type="button" class="encart-action" id="remplissage-tout"></button>
      </section>

      <section class="encart" aria-labelledby="encart-liste">
        <h3 id="encart-liste"><label for="remplissage-liste">${pictogramme('loupe')} Par Pokémon / numéro</label></h3>
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
  const tout = document.getElementById('remplissage-tout');
  if(tout) tout.textContent = `Tout marquer « ${LIBELLE_POSE[toutTag]} » (${pluriel(cartesDuLot(saisiePage.toutes(), toutTag).length, 'carte')})`;
  const lotNombre = document.getElementById('remplissage-lot-nombre');
  if(lotNombre){
    const n = saisiePage.affichees().length;
    lotNombre.textContent = n === saisiePage.toutes().length ? `les ${pluriel(n, 'carte')}` : `les ${pluriel(n, 'carte')} ${n > 1 ? 'affichées' : 'affichée'}`;
  }
  document.querySelectorAll('.lot-tag').forEach(b => {
    const lot = saisiePage.affichees();
    const retrait = leLotRetire(lot, b.dataset.tag);
    b.disabled = cartesDuLot(lot, b.dataset.tag).length === 0;
    b.innerHTML = `${pictogramme(b.dataset.tag)}${retrait ? 'Retirer « ' + LIBELLE_POSE[b.dataset.tag] + ' »' : { obt: 'Obtenues', rech: 'Recherchées', ech: 'Échangeables' }[b.dataset.tag]}`;
  });

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
    pastille.innerHTML = `<span>${pictogramme('eclair')} Saisie rapide · un toucher marque ${pictogramme(saisieTag)} ${TAG_META[saisieTag].label}</span>
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

function quandLaFenetreSeFerme(){
  if(lectureEnCours){ lectureEnCours.abort(); lectureEnCours = null; }
  if(document.getElementById('video-etat')){
    propositionVideo = null;
    etatVideo('');
    const bouton = document.getElementById('remplissage-video-bouton');
    bouton.hidden = false;
    bouton.textContent = 'Choisir la vidéo';
  }
}

function cartesParNumero(){
  const parNumero = new Map();
  saisiePage.toutes().forEach(c => { const n = Number(c.localId); if(Number.isInteger(n)) parNumero.set(n, c); });
  return parNumero;
}

function compteurCommeLeJeu(possedees, parNumero){
  const famille = r => !r ? null : /Diamant/i.test(r) ? 'd' : /Chromatique/i.test(r) ? 's' : 'e';
  const total = { d: 0, e: 0, s: 0 }, vus = { d: 0, e: 0, s: 0 };
  let sansRarete = false;
  parNumero.forEach(c => { const f = famille(c.rarity); if(f) total[f]++; else sansRarete = true; });
  possedees.forEach(n => { const f = famille(parNumero.get(n)?.rarity); if(f) vus[f]++; });
  if(sansRarete) return `${pluriel(possedees.length, 'carte')} sur ${parNumero.size}`;
  return `◆ ${vus.d}/${total.d} · ★ ${vus.e} · ✦ ${vus.s}`;
}

function plagesLisibles(ns){
  const out = []; let debut = null, prec = null;
  for(const n of ns){
    if(prec !== null && n === prec + 1){ prec = n; continue; }
    if(debut !== null) out.push(debut === prec ? `${debut}` : `${debut} à ${prec}`);
    debut = prec = n;
  }
  if(debut !== null) out.push(debut === prec ? `${debut}` : `${debut} à ${prec}`);
  return out.join(', ');
}

let lectureEnCours = null;
let propositionVideo = null;

function etatVideo(html){
  const etat = document.getElementById('video-etat');
  etat.innerHTML = html;
  etat.hidden = !html;
}

async function lireLaVideo(fichier){
  if(lectureEnCours) lectureEnCours.abort();
  const controle = new AbortController();
  lectureEnCours = controle;
  propositionVideo = null;
  const bouton = document.getElementById('remplissage-video-bouton');
  bouton.hidden = true;
  etatVideo(`<p>Lecture de la vidéo… <span id="video-pourcent">0 %</span></p>
    <progress id="video-progression" max="1" value="0"></progress>
    <button type="button" class="lien-video" data-video="arreter">Arrêter</button>`);
  const parNumero = cartesParNumero();
  const total = Math.max(0, ...parNumero.keys());
  try{
    const res = await window.lireVideoCollection(fichier, {
      total,
      signal: controle.signal,
      surProgression: f => {
        const barre = document.getElementById('video-progression');
        if(barre) barre.value = f;
        const pourcent = document.getElementById('video-pourcent');
        if(pourcent) pourcent.textContent = `${Math.round(f * 100)} %`;
      },
    });
    if(controle.signal.aborted) return;
    if(res.fin === 'incoherente'){
      const nom = document.getElementById('page-head')?.dataset.nom || 'cette extension';
      throw new Error(`Cette vidéo ne semble pas montrer « ${echapperAttribut(nom)} » : le nombre de cases ne correspond pas. Ouvre la page de l'extension filmée, puis recommence.`);
    }
    proposerVideo(res, parNumero);
  }catch(err){
    if(controle.signal.aborted){ etatVideo(''); }
    else{
      console.warn('Lecture de la vidéo impossible', err);
      etatVideo(`<p class="erreur">${err?.message || 'La vidéo n\'a pas pu être lue.'}</p>`);
    }
  }finally{
    if(lectureEnCours === controle) lectureEnCours = null;
    bouton.hidden = false;
    bouton.textContent = 'Choisir une autre vidéo';
    document.getElementById('remplissage-video').value = '';
  }
}

function proposerVideo(res, parNumero){
  const ajouts = [], retraits = [];
  res.possedees.forEach(n => { const c = parNumero.get(n); if(c && !tagState[c.id]?.obt) ajouts.push(c); });
  res.vides.forEach(n => { const c = parNumero.get(n); if(c && tagState[c.id]?.obt) retraits.push(c); });
  propositionVideo = { ajouts, retraits, possedees: res.possedees.length };
  const nonVues = res.nonVues.length
    ? `<p class="encart-note">Les cartes n° ${plagesLisibles(res.nonVues)} n'apparaissent pas dans la vidéo : elles ne changent pas.</p>`
    : '';
  const aJour = ajouts.length === 0 && retraits.length === 0;
  etatVideo(`
    <div class="video-comparaison">
      <figure><img src="${res.imageEnTete}" alt="Le compteur de l'extension, tel que la vidéo le montre">
        <figcaption>Ce que le jeu affiche</figcaption></figure>
      <p class="video-lu">Ce que PokéClasseur a lu
        <span class="video-compteur">${compteurCommeLeJeu(res.possedees, parNumero)}</span></p>
    </div>
    <p>Si les deux compteurs sont identiques, la lecture est juste.</p>
    ${aJour
      ? '<p>Ta collection est déjà à jour pour cette extension.</p>'
      : `<p>« Valider » va :</p>
         <ul>
           ${ajouts.length ? `<li>marquer <b>${pluriel(ajouts.length, 'carte')}</b> « obtenue »</li>` : ''}
           ${retraits.length ? `<li>retirer « obtenue » de <b>${pluriel(retraits.length, 'carte')}</b> absente${retraits.length > 1 ? 's' : ''} de ta vidéo</li>` : ''}
         </ul>`}
    ${nonVues}
    <div class="video-boutons">
      ${aJour ? '' : '<button type="button" class="encart-action" data-video="valider">Valider</button>'}
      <button type="button" class="encart-action secondaire" data-video="annuler">${aJour ? 'Fermer' : 'Annuler'}</button>
    </div>`);
}

function validerVideo(){
  if(!propositionVideo) return;
  const { ajouts, retraits, possedees } = propositionVideo;
  propositionVideo = null;
  const touchees = [...ajouts, ...retraits];
  const avant = touchees.map(c => [c.id, { ...(tagState[c.id] || emptyTagState()) }]);
  ajouts.forEach(c => { tagState[c.id] = { ...(tagState[c.id] || emptyTagState()), obt: true }; });
  retraits.forEach(c => { tagState[c.id] = { ...(tagState[c.id] || emptyTagState()), obt: false }; });
  saveTags();
  synchroniser(() => enregistrerCartes(touchees.map(c => [c.id, tagState[c.id]])));
  saisiePage.rafraichir();
  etatVideo('');
  fermerRemplissage();
  const nom = document.getElementById('page-head')?.dataset.nom || 'cette extension';
  bandeauSaisie(`Collection mise à jour : ${pluriel(possedees, 'carte')} ${possedees > 1 ? 'obtenues' : 'obtenue'} dans ${echapperAttribut(nom)}.`,
    () => restaurer(avant));
}

async function marquerLeLot(tag){
  const lot = saisiePage.affichees();
  if(!(await confirmerMarquageGroupe(lot, tag))) return;
  bulkToggleTag(lot, tag);
  saisiePage.rafraichir();
  majSaisieRapide();
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

let listeCourante = { elements: [], cartes: [] };
const selection = new Set();
const elementsConnus = new Set();

function majApercu(){
  const champ = document.getElementById('remplissage-liste');
  listeCourante = lireListe(saisiePage.toutes(), champ.value);
  const { elements, cartes } = listeCourante;
  const presents = new Set(elements.map(e => e.texte));
  [...elementsConnus].forEach(t => { if(!presents.has(t)) elementsConnus.delete(t); });
  for(const e of elements){
    if(elementsConnus.has(e.texte)) continue;
    elementsConnus.add(e.texte);
    if(e.plage || e.cartes.length === 1) e.cartes.forEach(c => selection.add(c.id));
  }
  const trouvees = new Set(cartes.map(c => c.id));
  [...selection].forEach(id => { if(!trouvees.has(id)) selection.delete(id); });
  dessinerApercu();
}

function vignetteListe(c){
  const choisie = selection.has(c.id);
  return `<button type="button" class="vignette${choisie ? ' on' : ''}" data-id="${attrCarte(c.id)}"
      aria-pressed="${choisie}" title="${attrCarte(c.name)} · ${attrCarte(saisiePage.sousTitre(c))}">
    <img src="${attrCarte(c.image || `images/cards/${c.id}.png`)}" alt="" loading="lazy"
         data-fallback="${attrCarte(c.imageSecours ?? `images/cards/${c.id}.png`)}" onerror="cardImgFallback(this)">
    <span>${echapperAttribut(c.name)} <i>${echapperAttribut(saisiePage.sousTitre(c))}</i></span>
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
  saisiePage = {
    affichees: page.toutes,
    ensemble: 'de la page',
    sousTitre: c => `#${c.localId}`,
    ...page,
  };
  saisiePage.video = Boolean(page.video && typeof window.lireVideoCollection === 'function'
    && typeof estPocket === 'function' && estPocket());
  poserStyleRemplissage();
  lireMemoireSaisie();
  construireSaisieRapide(zone);
  majSaisieRapide();
  document.addEventListener('click', toucherCarte, true);

  const fenetre = document.getElementById('remplissage');
  document.getElementById('remplissage-ouvrir').addEventListener('click', ouvrirRemplissage);
  fenetre.querySelector('.remplissage-fermer').addEventListener('click', fermerRemplissage);
  fenetre.addEventListener('click', (e) => { if(e.target === fenetre) fermerRemplissage(); });
  fenetre.addEventListener('close', quandLaFenetreSeFerme);
  document.getElementById('remplissage-video')?.addEventListener('change', (e) => {
    const fichier = e.target.files?.[0];
    if(fichier) lireLaVideo(fichier);
  });

  fenetre.addEventListener('click', (e) => {
    const actionVideo = e.target.closest('[data-video]');
    if(actionVideo){
      const quoi = actionVideo.dataset.video;
      if(quoi === 'valider') validerVideo();
      else if(quoi === 'arreter'){ lectureEnCours?.abort(); }
      else{ propositionVideo = null; etatVideo(''); }
      return;
    }
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
    const lotTag = e.target.closest('.lot-tag');
    if(lotTag){ marquerLeLot(lotTag.dataset.tag); return; }
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
  champ.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); marquerLaListe('obt'); }
  });
}

window.installerSaisieRapide = installerSaisieRapide;
})();
