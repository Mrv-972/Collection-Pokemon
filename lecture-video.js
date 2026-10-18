// Lecture d'une vidéo de l'écran Collection de Pokémon TCG Pocket.
//
// Le joueur filme son écran pendant qu'il fait défiler une extension, avec
// l'option « Tout afficher » du jeu : chaque carte qui lui manque y apparaît
// comme une case vide qui porte son numéro. Inutile donc de reconnaître les
// illustrations : il suffit de savoir, case par case, s'il y a une carte ou
// non, et quel numéro occupe cette case.
//
// Tout se passe dans le navigateur : la vidéo n'est envoyée nulle part.
//
//   1. Étalonnage, sur une trentaine d'images réparties dans la vidéo : la
//      fenêtre où le contenu défile (le reste de l'écran est immobile), les
//      cinq colonnes de la grille, la hauteur d'une rangée.
//
// Les images s'obtiennent en jouant la vidéo, pas en sautant d'un instant à
// l'autre : une vidéo de téléphone n'a d'image complète que toutes les
// quelques secondes, et chaque saut obligerait à tout reconstruire depuis la
// précédente. La vidéo est donc jouée deux fois, sans le son : vite pour
// l'étalonnage, puis à la vitesse que l'appareil peut suivre pour la lecture.
//   2. Ancrage : la première image montre le cadre de l'extension (son logo,
//      son compteur) ; la rangée qui le suit porte les cartes 1 à 5.
//   3. Lecture, image après image : on suit le défilement d'une image à
//      l'autre, on recale la grille sur les cartes, et chaque case reçoit une
//      mesure. Une case vide est presque unie ; une carte, même très pâle,
//      ne l'est jamais (écart-type de la luminosité : moins de 8 contre plus
//      de 26 sur la vidéo d'essai).
//   4. Contrôle de la fin : après la dernière carte vient le cadre de
//      l'extension suivante, ou rien. Une rangée de cartes à cet endroit
//      signale une vidéo qui ne montre pas cette extension.
//
// Le résultat se compare d'un coup d'œil au compteur du jeu : on renvoie
// l'image du cadre de l'extension tel que la vidéo le montre.
//
// Seul lireVideoCollection() sort de l'enveloppe.
(() => {

const LARGEUR = 360;            // largeur de travail, en pixels
const IMAGES_PAR_SECONDE = 24;   // quand il faut sauter d'instant en instant
const SEUIL_CARTE = 16;         // écart-type au-delà duquel une case porte une carte

class ErreurLecture extends Error {}

// --- les images de la vidéo ------------------------------------------------------
function attendre(cible, evenement, delai, message){
  return new Promise((resoudre, rejeter) => {
    const minuteur = setTimeout(() => { nettoyer(); rejeter(new ErreurLecture(message)); }, delai);
    const ok = () => { nettoyer(); resoudre(); };
    const ko = () => { nettoyer(); rejeter(new ErreurLecture(message)); };
    function nettoyer(){ clearTimeout(minuteur); cible.removeEventListener(evenement, ok); cible.removeEventListener('error', ko); }
    cible.addEventListener(evenement, ok, { once: true });
    cible.addEventListener('error', ko, { once: true });
  });
}

async function ouvrirVideo(fichier){
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
  const adresse = URL.createObjectURL(fichier);
  video.src = adresse;
  await attendre(video, 'loadedmetadata', 15000, 'Ce navigateur ne sait pas lire cette vidéo.');
  if(!video.videoWidth || !Number.isFinite(video.duration)) throw new ErreurLecture('Ce navigateur ne sait pas lire cette vidéo.');
  const W = LARGEUR, H = Math.round(video.videoHeight * LARGEUR / video.videoWidth);
  const toile = document.createElement('canvas');
  toile.width = W; toile.height = H;
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  // L'image affichée en ce moment, en luminosité et en « carte » (couleur
  // franche ou zone sombre : ce que n'a jamais une case vide).
  function convertir(){
    ctx.drawImage(video, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const lum = new Uint8Array(W * H), carte = new Uint8Array(W * H);
    for(let i = 0, j = 0; i < lum.length; i++, j += 4){
      const r = d[j], g = d[j + 1], b = d[j + 2];
      const l = (r + g + b) / 3;
      lum[i] = l;
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      carte[i] = (mx - mn > 45 || l < 160) ? 1 : 0;
    }
    return { lum, carte };
  }
  async function aller(t){
    if(Math.abs(video.currentTime - t) > 1e-3){
      video.currentTime = t;
      await attendre(video, 'seeked', 20000, 'La lecture de la vidéo s\'est interrompue.');
    }
  }
  function fermer(){ video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(adresse); }
  return { video, W, H, duree: video.duration, convertir, aller, toile, fermer };
}

// Parcourt la vidéo de debut à fin en appelant surImage(t, image) pour chaque
// image traitée. surImage travaille sans attendre : la vidéo continue de
// jouer pendant ce temps, et les images qu'on n'a pas eu le temps de traiter
// sont sautées. En « adaptatif », la vitesse de lecture baisse dès que les
// images traitées s'espacent trop, et remonte quand l'appareil suit.
// Sans requestVideoFrameCallback (vieux navigateurs), on saute d'instant en
// instant : plus lent, mais toujours juste.
async function parcourir(v, { debut, fin, vitesse = 1, adaptatif = false, pas = 1 / IMAGES_PAR_SECONDE, signal, surImage }){
  const { video } = v;
  if(typeof video.requestVideoFrameCallback !== 'function'){
    for(let t = debut; t <= fin + 1e-6; t += pas){
      if(signal?.aborted) throw new ErreurLecture('Lecture annulée.');
      await v.aller(t);
      if(surImage(t, v.convertir()) === false) return;
    }
    return;
  }
  await v.aller(debut);
  return new Promise((resoudre, rejeter) => {
    let fini = false, dernier = null;
    const ecartsRecents = [];
    const terminer = (erreur) => {
      if(fini) return;
      fini = true; video.pause();
      clearInterval(veille);
      erreur ? rejeter(erreur) : resoudre();
    };
    // Une vidéo bloquée (onglet en arrière-plan, décodeur saturé) ne doit
    // pas laisser la lecture tourner sans fin.
    let derniereImage = performance.now();
    const veille = setInterval(() => {
      if(signal?.aborted) terminer(new ErreurLecture('Lecture annulée.'));
      else if(performance.now() - derniereImage > 20000) terminer(new ErreurLecture('La lecture de la vidéo s\'est interrompue.'));
    }, 500);
    const etape = (maintenant, meta) => {
      if(fini) return;
      derniereImage = performance.now();
      const t = meta.mediaTime;
      try{
        if(t >= debut - 1e-3 && t <= fin + 1e-3 && (dernier === null || t > dernier)){
          if(surImage(t, v.convertir()) === false){ terminer(); return; }
          if(adaptatif && dernier !== null){
            ecartsRecents.push(t - dernier);
            if(ecartsRecents.length > 8) ecartsRecents.shift();
            const moyen = ecartsRecents.reduce((a, b) => a + b, 0) / ecartsRecents.length;
            if(moyen > 1 / 20 && video.playbackRate > 0.25) video.playbackRate = Math.max(0.25, video.playbackRate * 0.8);
            else if(moyen < 1 / 40 && video.playbackRate < vitesse) video.playbackRate = Math.min(vitesse, video.playbackRate * 1.15);
          }
          dernier = t;
        }
      }catch(err){ terminer(err); return; }
      if(t >= fin || video.ended){ terminer(); return; }
      video.requestVideoFrameCallback(etape);
    };
    video.addEventListener('ended', () => terminer(), { once: true });
    video.requestVideoFrameCallback(etape);
    // Tous les navigateurs n'acceptent pas les grandes vitesses : on se
    // replie sur ce qu'ils savent faire.
    for(const essai of [vitesse, 2, 1]){
      try{ video.playbackRate = Math.min(essai, vitesse); break; }catch(err){ /* vitesse refusée */ }
    }
    video.play().catch(() => terminer(new ErreurLecture('Ce navigateur refuse de lire la vidéo.')));
  });
}

// --- petits calculs ----------------------------------------------------------------
function ecartType(tab, W, x0, x1, y0, y1){
  let s = 0, s2 = 0, n = 0;
  for(let y = y0; y < y1; y++) for(let x = x0; x < x1; x++){ const v = tab[y * W + x]; s += v; s2 += v * v; n++; }
  if(!n) return 0;
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}
function moyenne(tab, W, x0, x1, y0, y1){
  let s = 0, n = 0;
  for(let y = y0; y < y1; y++) for(let x = x0; x < x1; x++){ s += tab[y * W + x]; n++; }
  return n ? s / n : 0;
}
const mediane = v => { const t = [...v].sort((a, b) => a - b); const m = t.length >> 1; return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2; };

// La plus longue plage d'indices où le test est vrai.
function plusLonguePlage(n, test){
  let best = [0, 0], debut = -1;
  for(let i = 0; i <= n; i++){
    if(i < n && test(i)){ if(debut < 0) debut = i; }
    else if(debut >= 0){ if(i - debut > best[1] - best[0]) best = [debut, i]; debut = -1; }
  }
  return best;
}

// --- l'analyse ------------------------------------------------------------------------
async function lireVideoCollection(fichier, { total, surProgression = () => {}, signal } = {}){
  const v = await ouvrirVideo(fichier);
  try{
    return await analyser(v, total, surProgression, signal);
  }finally{
    v.fermer();
  }
}

async function analyser(v, N, surProgression, signal){
  const { W, H, duree } = v;
  const verifierArret = () => { if(signal?.aborted) throw new ErreurLecture('Lecture annulée.'); };
  const fin = Math.max(0, duree - 1 / IMAGES_PAR_SECONDE);
  const ecran = 'Je ne reconnais pas l\'écran Collection du jeu dans cette vidéo.';

  // 1. Étalonnage, pendant une lecture rapide
  const NB_VISE = 30;
  const etalons = [];
  let prochain = 0;
  await parcourir(v, { debut: 0, fin, vitesse: 4, signal, pas: fin / (NB_VISE - 1),
    surImage: (t, im) => {
      if(t + 1e-3 >= prochain){ etalons.push(im); prochain = t + fin / NB_VISE; }
      surProgression(0.2 * Math.min(1, t / Math.max(fin, 1e-3)));
    } });
  if(etalons.length < 12) throw new ErreurLecture('La vidéo est trop courte pour être lue.');
  const NB_ETALON = etalons.length;
  const somme = new Float32Array(W * H), somme2 = new Float32Array(W * H);
  for(const im of etalons) for(let p = 0; p < im.lum.length; p++){ const l = im.lum[p]; somme[p] += l; somme2[p] += l * l; }
  const tstd = new Float32Array(W * H);
  for(let p = 0; p < tstd.length; p++){
    const m = somme[p] / NB_ETALON;
    tstd[p] = Math.sqrt(Math.max(0, somme2[p] / NB_ETALON - m * m));
  }
  // La fenêtre : les lignes où le contenu bouge d'une image à l'autre.
  const xa = Math.round(W * 0.05), xb = Math.round(W * 0.95);
  const py = new Float32Array(H);
  for(let y = 0; y < H; y++) py[y] = moyenne(tstd, W, xa, xb, y, y + 1);
  const pyMax = Math.max(...py);
  const [YH, YB] = plusLonguePlage(H, y => py[y] > 0.35 * pyMax);
  if(YB - YH < H * 0.3) throw new ErreurLecture(ecran);
  // Les colonnes : là où des cartes passent ; les interstices restent unis.
  const px = new Float32Array(W);
  for(const im of etalons) for(let x = 0; x < W; x++) px[x] += moyenne(im.carte, W, x, x + 1, YH, YB) / NB_ETALON;
  const pxMax = Math.max(...px);
  const COLS = [];
  { let debut = -1;
    for(let x = 0; x <= W; x++){
      if(x < W && px[x] > 0.25 * pxMax){ if(debut < 0) debut = x; }
      else if(debut >= 0){ if(x - debut > W * 0.08) COLS.push([debut, x]); debut = -1; }
    } }
  if(COLS.length !== 5) throw new ErreurLecture(ecran);
  const pasX = (COLS[4][0] - COLS[0][0]) / 4;
  const largeur = COLS.reduce((s, [a, b]) => s + b - a, 0) / 5;
  const fixe = new Uint8Array(W * H);
  for(let p = 0; p < fixe.length; p++) fixe[p] = tstd[p] < 6 ? 1 : 0;

  const L = YB - YH;
  function profilCarte(carte){
    const p = new Float32Array(L);
    for(let y = 0; y < L; y++){
      let s = 0;
      for(const [a, b] of COLS) s += moyenne(carte, W, a, b, YH + y, YH + y + 1);
      p[y] = s / 5;
    }
    return p;
  }
  // La hauteur d'une rangée : autocorrélation des bords horizontaux.
  const scores = new Map();
  for(const im of etalons){
    const p = profilCarte(im.carte);
    const dp = new Float32Array(L - 1);
    let m = 0;
    for(let y = 0; y < L - 1; y++){ dp[y] = Math.abs(p[y + 1] - p[y]); m += dp[y]; }
    m /= dp.length;
    for(let y = 0; y < dp.length; y++) dp[y] -= m;
    const n = dp.length - Math.ceil(1.7 * pasX);
    if(n < 20) continue;
    for(let lag = 1.2 * pasX; lag < 1.6 * pasX; lag += 0.25){
      let sxy = 0, sxx = 0, syy = 0;
      for(let i = 0; i < n; i++){
        const pos = i + lag, i0 = Math.floor(pos), f = pos - i0;
        const val = dp[i0] * (1 - f) + dp[i0 + 1] * f;
        sxy += dp[i] * val; sxx += dp[i] * dp[i]; syy += val * val;
      }
      const cle = Math.round(lag * 4);
      scores.set(cle, (scores.get(cle) ?? 0) + sxy / (Math.sqrt(sxx * syy) + 1e-9));
    }
  }
  if(!scores.size) throw new ErreurLecture(ecran);
  const P = [...scores].reduce((a, b) => (b[1] > a[1] ? b : a))[0] / 4;
  const HC = P - (pasX - largeur) * 1.35;
  etalons.length = 0;

  // Phase de la grille dans une image : où commencent les rangées.
  function phase(carte){
    const p = profilCarte(carte);
    let m = 0; for(const x of p) m += x; m /= L;
    let s2 = 0; for(const x of p) s2 += (x - m) ** 2;
    if(Math.sqrt(s2 / L) < 0.02) return null;
    const bas = -HC / (P - HC);
    const valeur = phi => {
      let val = 0;
      for(let y = 0; y < L; y++){
        const dans = ((((YH + y - phi) % P) + P) % P) < HC;
        val += (p[y] - m) * (dans ? 1 : bas);
      }
      return val;
    };
    let best = null;
    for(let phi = 0; phi < P; phi += 1.5){ const val = valeur(phi); if(!best || val > best.val) best = { phi, val }; }
    for(let phi = best.phi - 1.25; phi <= best.phi + 1.25; phi += 0.25){
      const val = valeur((phi + P) % P); if(val > best.val) best = { phi: (phi + P) % P, val };
    }
    return { phi: best.phi, force: best.val / L };
  }
  // Le cadre d'une extension : un logo au milieu, qui déborde sur les
  // interstices du centre, et des côtés presque unis.
  function estEntete(lum, y0, y1){
    y0 = Math.round(Math.max(y0, YH)); y1 = Math.round(Math.min(y1, YB));
    if(y1 - y0 < HC * 0.5) return false;
    const gaps = [1, 2].map(i => ecartType(lum, W, COLS[i][1] + 1, COLS[i + 1][0] - 1, y0, y1));
    const cotes = [COLS[0], COLS[4]].map(([a, b]) => ecartType(lum, W, a + 4, b - 4, y0, y1));
    return Math.max(...gaps) > 40 && Math.max(...cotes) < 20;
  }

  // 2 et 3. Ancrage puis lecture, au fil d'une seule lecture de la vidéo.
  function profilSuivi(lum){
    const p = new Float32Array(L * 5);
    for(let y = 0; y < L; y++) for(let c = 0; c < 5; c++){
      const [a, b] = COLS[c];
      p[y * 5 + c] = moyenne(lum, W, a, b, YH + y, YH + y + 1);
    }
    return p;
  }
  // q est p remonté de d pixels : q[y] ressemble à p[y + d]. Une ligne sur
  // deux suffit à départager les décalages.
  function ecarts(p, q, lo, hi){
    const res = new Map();
    for(let d = lo; d <= hi; d++){
      const y0 = Math.max(0, -d), y1 = Math.min(L, L - d);
      if(y1 - y0 < L * 0.4) continue;
      let s = 0, n = 0;
      for(let y = y0; y < y1; y += 2){ for(let c = 0; c < 5; c++) s += Math.abs(p[(y + d) * 5 + c] - q[y * 5 + c]); n += 5; }
      res.set(d, s / n);
    }
    return res;
  }
  const R = Math.ceil(N / 5);
  const mesures = new Map();
  const finVue = [];          // la bande qui suit la dernière rangée, quand elle est visible
  let haut1 = null, imageEnTete = null;
  let cumul = 0, vitesse = 0, delta = 0, prec = null, tPrec = null;
  const LIMITE_ANCRAGE = Math.min(1.5, fin);
  await parcourir(v, { debut: 0, fin, vitesse: 1, adaptatif: true, signal,
    surImage: (t, im) => {
      surProgression(0.2 + 0.8 * Math.min(1, t / Math.max(fin, 1e-3)));
      if(haut1 === null){
        if(t > LIMITE_ANCRAGE) return false;
        const ph = phase(im.carte);
        if(!ph) return;
        for(let haut = ph.phi + Math.ceil((YH - ph.phi) / P) * P; haut + HC <= YB; haut += P){
          if(estEntete(im.lum, haut - P, haut) && !estEntete(im.lum, haut, haut + HC)){ haut1 = haut; break; }
        }
        if(haut1 === null) return;
        // L'image du cadre, pour la comparer au résultat. Elle est prise dans
        // la vidéo elle-même, à sa pleine résolution : les chiffres du
        // compteur y sont plus nets que dans la copie réduite de l'analyse.
        const echelle = v.video.videoWidth / W;
        const yCadre = Math.max(YH, Math.round(haut1 - 1.3 * P));
        const hCadre = Math.max(1, Math.round(haut1 - 0.06 * P - yCadre));
        const sortie = Math.min(720, v.video.videoWidth);
        const enTete = document.createElement('canvas');
        enTete.width = sortie; enTete.height = Math.round(hCadre * echelle * sortie / v.video.videoWidth);
        enTete.getContext('2d').drawImage(v.video, 0, yCadre * echelle, v.video.videoWidth, hCadre * echelle, 0, 0, enTete.width, enTete.height);
        imageEnTete = enTete.toDataURL('image/jpeg', 0.88);
      }
      const pr = profilSuivi(im.lum);
      if(prec){
        const dt = Math.max(1e-3, t - tPrec);
        const prevu = vitesse * dt;
        const lo = Math.floor(Math.min(-0.2 * P, prevu - 0.6 * P)), hi = Math.ceil(Math.max(1.5 * P, prevu + 0.6 * P));
        const e = ecarts(prec, pr, Math.max(lo, -Math.floor(L * 0.6)), Math.min(hi, Math.floor(L * 0.6)));
        const minima = [...e.keys()].filter(d => e.get(d) <= (e.get(d - 1) ?? Infinity) && e.get(d) <= (e.get(d + 1) ?? Infinity));
        if(minima.length){
          const meilleur = minima.reduce((a, b) => (e.get(b) < e.get(a) ? b : a));
          // Une rangée de cases vides ressemble à la suivante : entre deux
          // décalages presque aussi bons, on garde celui qui prolonge le
          // mouvement.
          const proches = minima.filter(d => e.get(d) <= e.get(meilleur) * 1.15 + 0.3);
          const d = proches.reduce((a, b) => (Math.abs(b - prevu) < Math.abs(a - prevu) ? b : a));
          vitesse = d / dt; cumul += d;
        }
      }
      prec = pr; tPrec = t;
      const ph = phase(im.carte);
      if(ph && ph.force > 0.02){
        let brut = (((ph.phi - (haut1 - cumul)) % P) + P) % P;
        if(brut > P / 2) brut -= P;
        while(brut - delta > P / 2) brut -= P;
        while(brut - delta < -P / 2) brut += P;
        if(Math.abs(brut - delta) < 0.12 * P) delta = 0.5 * delta + 0.5 * brut;
      }
      for(let k = 1; k <= R + 1; k++){
        const haut = haut1 + (k - 1) * P - cumul + delta;
        if(haut < YH + 2 || haut + HC > YB - 2) continue;
        if(k === R + 1) finVue.push(estEntete(im.lum, haut, haut + HC));
        for(let c = 0; c < 5; c++){
          const n = (k - 1) * 5 + c + 1;
          const [a, b] = COLS[c];
          const mx = Math.floor((b - a) * 0.1), my = Math.floor(HC * 0.08);
          const y0 = Math.floor(haut) + my, y1 = Math.floor(haut + HC) - my, x0 = a + mx, x1 = b - mx;
          if(moyenne(fixe, W, x0, x1, y0, y1) > 0.05) continue;
          if(!mesures.has(n)) mesures.set(n, []);
          mesures.get(n).push(ecartType(im.lum, W, x0, x1, y0, y1));
        }
      }
    } });
  verifierArret();
  if(haut1 === null){
    throw new ErreurLecture('Le début de la vidéo doit montrer le titre de l\'extension et son compteur, juste au-dessus des premières cartes.');
  }

  // 4. Résultat et contrôle de la fin
  const possedees = [], vides = [], nonVues = [];
  for(let n = 1; n <= N; n++){
    const m = mesures.get(n);
    if(!m || m.length < 2){ nonVues.push(n); continue; }
    (mediane(m) > SEUIL_CARTE ? possedees : vides).push(n);
  }
  // Les emplacements après la dernière carte, sur sa rangée, sont du fond nu.
  let finCoherente = true;
  for(let n = N + 1; n <= R * 5; n++){
    const m = mesures.get(n);
    if(m && m.length >= 2 && mediane(m) > SEUIL_CARTE) finCoherente = false;
  }
  let fin_ = 'absente';
  if(finVue.length >= 2){
    const cadres = finVue.filter(Boolean).length;
    const suivante = [1, 2, 3, 4, 5].map(c => mesures.get(R * 5 + c)).filter(m => m && m.length >= 2);
    const rangeeDeCartes = suivante.length === 5 && suivante.filter(m => mediane(m) > SEUIL_CARTE).length >= 4;
    if(rangeeDeCartes && cadres < finVue.length / 2) finCoherente = false;
    fin_ = 'vue';
  }
  if(!finCoherente) fin_ = 'incoherente';
  return { possedees, vides, nonVues, fin: fin_, imageEnTete };
}

window.lireVideoCollection = lireVideoCollection;
})();
