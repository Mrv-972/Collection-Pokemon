// Passer d'une carte agrandie à l'autre en la faisant glisser du doigt.
//
// Sur un téléphone, on feuillette comme dans une galerie de photos : la
// carte suit le doigt ; lâchée assez loin (ou d'un geste vif), elle part et
// la suivante arrive du côté opposé ; sinon, elle revient en place. Au bout
// de la série, elle résiste et revient : rien ne suit. Un geste vertical ou
// un pincement à deux doigts (pour zoomer) ne change pas de carte. Le geste
// marche aussi à la souris.
//
// Partagé par la vue agrandie des grilles de cartes (cards.js) et celle de
// la page des missions : le même geste doit se comporter de la même façon
// partout.

// Un écran qu'on touche du doigt, sans souris pour survoler : l'aide d'une
// vue agrandie y parle de glisser plutôt que de touches du clavier.
function ecranTactile(){
  try{ return matchMedia('(hover: none) and (pointer: coarse)').matches; }catch(err){ return false; }
}

// zone      : l'élément qui reçoit le geste (le voile de la vue agrandie)
// image     : la carte, qui suit le doigt
// peutAller : pas (+1 ou -1) → la carte voisine existe-t-elle ?
// changer   : pas → afficher la carte voisine
// Renvoie { vientDeGlisser() } : vrai une fois, juste après un glissement,
// pour que le clic qui le suit ne referme pas la vue.
function brancherGlissement({ zone, image, peutAller, changer, ignorer = '.fleche' }){
  const SEUIL = 60;                // pixels parcourus pour changer de carte
  const VITESSE = 0.35;            // ou pixels par milliseconde, pour un geste vif
  let geste = null;                // { id, x, y, dx, horizontal, traces }
  let glisse = false;
  const doigts = new Set();

  // Un glissement horizontal est pour nous ; le navigateur garde le
  // pincement pour zoomer.
  zone.style.touchAction = 'pan-y pinch-zoom';
  image.draggable = false;
  image.style.userSelect = 'none';
  image.style.webkitUserSelect = 'none';
  image.style.webkitTouchCallout = 'none';

  const placer = (dx, anime) => {
    image.style.transition = anime ? 'transform .2s ease-out, opacity .2s ease-out' : 'none';
    image.style.transform = dx ? `translateX(${dx}px)` : '';
    image.style.opacity = dx ? String(Math.max(0.35, 1 - Math.abs(dx) / (innerWidth * 1.2))) : '';
  };

  const changerEnGlissant = pas => {
    const sortie = -pas * Math.min(innerWidth, 640);
    placer(sortie, true);
    setTimeout(() => {
      changer(pas);
      // La nouvelle carte entre du côté opposé.
      placer(-sortie * 0.6, false);
      void image.offsetWidth;
      placer(0, true);
    }, 170);
  };

  zone.addEventListener('pointerdown', (e) => {
    doigts.add(e.pointerId);
    // Deux doigts : c'est un pincement pour zoomer, pas un glissement.
    if(doigts.size > 1){ if(geste){ placer(0, true); geste = null; } return; }
    if(e.button > 0 || (ignorer && e.target.closest(ignorer))) return;
    geste = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, horizontal: null,
      traces: [{ x: e.clientX, t: performance.now() }] };
  });

  zone.addEventListener('pointermove', (e) => {
    if(!geste || e.pointerId !== geste.id) return;
    const dx = e.clientX - geste.x, dy = e.clientY - geste.y;
    if(geste.horizontal === null && Math.hypot(dx, dy) > 10){
      geste.horizontal = Math.abs(dx) > Math.abs(dy);
      // Le geste est à nous : le doigt peut sortir de l'image sans le perdre.
      if(geste.horizontal) try{ zone.setPointerCapture(e.pointerId); }catch(err){}
    }
    if(!geste.horizontal) return;
    e.preventDefault();
    // Les derniers instants du geste disent s'il était vif.
    const maintenant = performance.now();
    geste.traces.push({ x: e.clientX, t: maintenant });
    while(geste.traces.length > 2 && maintenant - geste.traces[0].t > 120) geste.traces.shift();
    geste.dx = dx;
    const auBout = !peutAller(dx < 0 ? 1 : -1);
    placer(auBout ? dx * 0.25 : dx, false);
  });

  const finDuGeste = (e) => {
    doigts.delete(e.pointerId);
    if(!geste || e.pointerId !== geste.id) return;
    const { dx, horizontal, traces } = geste;
    geste = null;
    if(!horizontal){ placer(0, true); return; }
    glisse = true;
    setTimeout(() => { glisse = false; }, 400);
    const debut = traces[0], fin = traces[traces.length - 1];
    const vitesse = Math.abs(fin.x - debut.x) / Math.max(16, fin.t - debut.t);
    const vif = vitesse > VITESSE && Math.abs(dx) > 25 && Math.sign(fin.x - debut.x) === Math.sign(dx);
    const pas = dx < 0 ? 1 : -1;
    if(e.type === 'pointerup' && (Math.abs(dx) > SEUIL || vif) && peutAller(pas)) changerEnGlissant(pas);
    else placer(0, true);
  };
  zone.addEventListener('pointerup', finDuGeste);
  zone.addEventListener('pointercancel', finDuGeste);

  return {
    vientDeGlisser(){
      if(!glisse) return false;
      glisse = false;
      return true;
    },
  };
}
