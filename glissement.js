function ecranTactile(){
  try{ return matchMedia('(hover: none) and (pointer: coarse)').matches; }catch(err){ return false; }
}

function brancherGlissement({ zone, image, peutAller, changer, ignorer = '.fleche' }){
  const SEUIL = 60;
  const VITESSE = 0.35;
  let geste = null;
  let glisse = false;
  const doigts = new Set();

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
      placer(-sortie * 0.6, false);
      void image.offsetWidth;
      placer(0, true);
    }, 170);
  };

  zone.addEventListener('pointerdown', (e) => {
    doigts.add(e.pointerId);
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
      if(geste.horizontal) try{ zone.setPointerCapture(e.pointerId); }catch(err){}
    }
    if(!geste.horizontal) return;
    e.preventDefault();
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
