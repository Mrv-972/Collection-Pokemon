// Partager une page de classeur sur les réseaux sociaux.
//
// Un classeur ne vit que dans le navigateur de son propriétaire : il n'y a
// pas de page publique vers laquelle envoyer un lien. Ce qu'on partage est
// donc une IMAGE, fabriquée ici même, que le membre publie ensuite où il
// veut. C'est aussi ce qu'attendent les réseaux : une image se voit dans le
// fil, un lien ne s'ouvre presque jamais.
//
// L'image est peinte sur une toile (canvas) plutôt que capturée à l'écran :
// on maîtrise ainsi ses dimensions, sa netteté et ce qui y figure, sans
// dépendre de la taille de la fenêtre ni embarquer de bibliothèque.

const PARTAGE = {
  // Un carré : c'est le format que tous les réseaux acceptent sans recadrer.
  cote: 1200,
  marge: 54,
  piedHauteur: 92,
};

// Une image venue d'un autre domaine « salit » la toile : le navigateur
// refuse alors d'en extraire un fichier. Le réclamer en mode anonyme lève
// l'interdiction quand le serveur l'autorise. Si le chargement échoue — pas
// d'autorisation, visuel absent, hors ligne —, on rend « null » et la case
// sera dessinée sans son image plutôt que de faire échouer tout le partage.
function chargerPourLaToile(source){
  return new Promise(resoudre => {
    if(!source) return resoudre(null);
    const img = new Image();
    // Une image du site lui-même n'a rien à demander.
    if(!source.startsWith('data:') && /^https?:/.test(source)){
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resoudre(img);
    img.onerror = () => resoudre(null);
    img.src = source;
  });
}

// Le coin arrondi d'une pochette, tracé à la main : les vieux navigateurs
// n'ont pas « roundRect », et cette page doit marcher partout.
function cheminArrondi(ctx, x, y, l, h, r){
  const rayon = Math.min(r, l / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rayon, y);
  ctx.arcTo(x + l, y, x + l, y + h, rayon);
  ctx.arcTo(x + l, y + h, x, y + h, rayon);
  ctx.arcTo(x, y + h, x, y, rayon);
  ctx.arcTo(x, y, x + l, y, rayon);
  ctx.closePath();
}

// Dessiner une image dans une case sans la déformer : on garde ses
// proportions et on rogne ce qui dépasse, comme le plastique d'une pochette
// avec une photo trop grande.
function peindreEnRemplissant(ctx, img, x, y, l, h){
  const rapport = Math.max(l / img.width, h / img.height);
  const li = img.width * rapport;
  const hi = img.height * rapport;
  ctx.drawImage(img, x + (l - li) / 2, y + (h - hi) / 2, li, hi);
}

// Une carte garde ses proportions entières : on la pose au milieu de la
// case, quitte à laisser un peu de vide autour.
function peindreEnEntier(ctx, img, x, y, l, h){
  const rapport = Math.min(l / img.width, h / img.height);
  const li = img.width * rapport;
  const hi = img.height * rapport;
  ctx.drawImage(img, x + (l - li) / 2, y + (h - hi) / 2, li, hi);
}

// Le contenu d'une page, prêt à peindre : ce que « contenuDeLaCase » dit,
// plus l'image effectivement chargée.
async function visuelsDeLaPage(classeur, cases){
  return Promise.all(cases.map(async valeur => {
    const dedans = contenuDeLaCase(classeur, valeur);
    if(!dedans || dedans.genre === 'papier') return { dedans, img: null };
    let img = await chargerPourLaToile(dedans.source);
    if(!img && dedans.secours) img = await chargerPourLaToile(dedans.secours);
    return { dedans, img };
  }));
}

// L'image d'une page de classeur, rendue comme un Blob PNG.
async function imageDeLaPage(classeur, indexPage, { face = 'recto' } = {}){
  const format = FORMATS[classeur.format];
  const cases = face === 'verso'
    ? versoDeLaPage(classeur, indexPage)
    : (classeur.pages[indexPage] ?? []);
  const contenus = await visuelsDeLaPage(classeur, cases);

  const toile = document.createElement('canvas');
  toile.width = PARTAGE.cote;
  toile.height = PARTAGE.cote;
  const ctx = toile.getContext('2d');

  // Le fond : la couleur des pages du classeur, celle qu'on voit à l'écran.
  const teinte = couleurDesPages(classeur).page;
  ctx.fillStyle = teinte;
  ctx.fillRect(0, 0, PARTAGE.cote, PARTAGE.cote);

  // La grille occupe tout sauf la marge et le bandeau du bas.
  const zoneL = PARTAGE.cote - PARTAGE.marge * 2;
  const zoneH = PARTAGE.cote - PARTAGE.marge * 2 - PARTAGE.piedHauteur;
  const espace = Math.round(PARTAGE.cote * 0.014);
  const caseL = (zoneL - espace * (format.colonnes - 1)) / format.colonnes;
  const caseH = (zoneH - espace * (format.lignes - 1)) / format.lignes;
  // Une pochette a les proportions d'une carte : on prend la plus petite des
  // deux dimensions possibles pour que la grille tienne dans la zone.
  const parHauteur = Math.min(caseH, caseL * 3.5 / 2.5);
  const parLargeur = parHauteur * 2.5 / 3.5;
  const grilleL = parLargeur * format.colonnes + espace * (format.colonnes - 1);
  const grilleH = parHauteur * format.lignes + espace * (format.lignes - 1);
  const departX = (PARTAGE.cote - grilleL) / 2;
  const departY = PARTAGE.marge + (zoneH - grilleH) / 2;

  for(let i = 0; i < cases.length; i++){
    const colonne = i % format.colonnes;
    const ligne = Math.floor(i / format.colonnes);
    const x = departX + colonne * (parLargeur + espace);
    const y = departY + ligne * (parHauteur + espace);
    const { dedans, img } = contenus[i] ?? {};

    // La pochette vide : un rectangle à peine plus clair que la page, avec
    // son liseré, comme à l'écran.
    ctx.save();
    cheminArrondi(ctx, x, y, parLargeur, parHauteur, parLargeur * 0.05);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
    ctx.clip();
    if(img){
      if(dedans.genre === 'image') peindreEnRemplissant(ctx, img, x, y, parLargeur, parHauteur);
      else peindreEnEntier(ctx, img, x, y, parLargeur, parHauteur);
    }
    ctx.restore();

    ctx.save();
    cheminArrondi(ctx, x, y, parLargeur, parHauteur, parLargeur * 0.05);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  peindreLePied(ctx, classeur, indexPage, face);

  return new Promise(resoudre => toile.toBlob(resoudre, 'image/png'));
}

// Le bandeau du bas : le nom du classeur, la page, et d'où vient l'image.
// Sans lui, une capture qui circule ne dit plus d'où elle vient.
function peindreLePied(ctx, classeur, indexPage, face){
  const bas = PARTAGE.cote - PARTAGE.marge;
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.font = `600 34px 'IBM Plex Sans', system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(classeur.nom, PARTAGE.marge, bas - 34);

  ctx.fillStyle = 'rgba(0,0,0,0.50)';
  ctx.font = `22px 'IBM Plex Sans', system-ui, sans-serif`;
  const pages = classeur.pages.length;
  const quelle = face === 'verso'
    ? `Dos de la page ${indexPage + 1} sur ${pages}`
    : `Page ${indexPage + 1} sur ${pages}`;
  ctx.fillText(quelle, PARTAGE.marge, bas - 4);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.font = `22px 'IBM Plex Sans', system-ui, sans-serif`;
  ctx.fillText('PokéClasseur', PARTAGE.cote - PARTAGE.marge, bas - 34);
  ctx.font = `19px 'IBM Plex Sans', system-ui, sans-serif`;
  ctx.fillText(ADRESSE_DU_SITE, PARTAGE.cote - PARTAGE.marge, bas - 6);
}

const ADRESSE_DU_SITE = 'mrv-972.github.io/Collection-Pokemon';

// ------------------------------------------------------- le partage lui-même

const texteDePartage = classeur => {
  const cartes = compterLesCartes(classeur);
  return `Mon classeur « ${classeur.nom} » — ${cartes} carte${cartes > 1 ? 's' : ''} `
       + `rangée${cartes > 1 ? 's' : ''} sur PokéClasseur.`;
};

const nomDuFichier = (classeur, index) =>
  `pokeclasseur-${classeur.nom.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'classeur'}-page-${index + 1}.png`;

// Les réseaux qui savent ouvrir une fenêtre de publication avec un texte
// prérempli. Aucun n'accepte qu'on y joigne une image depuis un site : c'est
// au membre de la déposer, d'où le mot qui le dit dans la fenêtre.
const RESEAUX = [
  { cle: 'x', nom: 'X', adresse: (t, u) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { cle: 'facebook', nom: 'Facebook', adresse: (t, u) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { cle: 'bluesky', nom: 'Bluesky', adresse: (t, u) =>
      `https://bsky.app/intent/compose?text=${encodeURIComponent(t + ' ' + u)}` },
  { cle: 'whatsapp', nom: 'WhatsApp', adresse: (t, u) =>
      `https://api.whatsapp.com/send?text=${encodeURIComponent(t + ' ' + u)}` },
];

function telecharger(blob, nom){
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  // Laisser le temps au navigateur d'enregistrer avant de rendre la mémoire.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Sur téléphone, le navigateur sait ouvrir le sélecteur d'applications du
// système : Instagram, WhatsApp, Messages… avec l'image déjà jointe. C'est
// de loin le chemin le plus court, quand il existe.
function peutPartagerUnFichier(fichier){
  return Boolean(navigator.canShare?.({ files: [fichier] }) && navigator.share);
}

async function partagerLaPage(classeur, indexPage, face){
  const blob = await imageDeLaPage(classeur, indexPage, { face });
  if(!blob) throw new Error("L'image n'a pas pu être fabriquée.");
  const fichier = new File([blob], nomDuFichier(classeur, indexPage), { type: 'image/png' });
  const texte = texteDePartage(classeur);

  if(peutPartagerUnFichier(fichier)){
    try{
      await navigator.share({ files: [fichier], text: texte, title: classeur.nom });
      return { chemin: 'systeme' };
    }catch(err){
      // Fermer le sélecteur n'est pas une erreur : on n'insiste pas.
      if(err?.name === 'AbortError') return { chemin: 'annule' };
    }
  }
  return { chemin: 'fenetre', blob, fichier, texte };
}

// ------------------------------------------------------------- la fenêtre

const STYLE_PARTAGE = `
  .voile-partage{position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:120;
    display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto}
  .boite-partage{background:var(--ink-soft,#20232A);border:1px solid rgba(237,234,224,0.14);
    border-radius:10px;max-width:520px;width:100%;padding:24px;
    color:var(--text-on-ink,#EDEAE0);font-family:inherit}
  .boite-partage h2{font-family:'Newsreader',serif;font-weight:500;font-size:21px;margin:0 0 6px}
  .boite-partage .mot{font-size:13.5px;color:var(--text-on-ink-dim,#9B9E9C);margin:0 0 16px;line-height:1.6}
  .boite-partage .apercu{display:block;width:100%;max-width:300px;margin:0 auto 18px;
    border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.45)}
  .boite-partage .reseaux{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
  .boite-partage .reseaux a{font-size:13px;padding:9px 14px;border-radius:5px;
    border:1px solid rgba(237,234,224,0.16);color:var(--text-on-ink,#EDEAE0);text-decoration:none}
  .boite-partage .reseaux a:hover{border-color:rgba(var(--gold-rgb,201,162,39),0.5)}
  .boite-partage .boutons{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
  .boite-partage button{font-family:inherit;font-size:13.5px;padding:10px 16px;border-radius:5px;
    cursor:pointer;border:1px solid rgba(237,234,224,0.16);background:transparent;
    color:var(--text-on-ink,#EDEAE0)}
  .boite-partage button.principal{border-color:rgba(var(--gold-rgb,201,162,39),0.55);
    background:rgba(var(--gold-rgb,201,162,39),0.14)}
  .boite-partage button:hover{border-color:rgba(var(--gold-rgb,201,162,39),0.6)}
  @media(max-width:520px){ .boite-partage .apercu{max-width:220px} }
`;

function poserStylePartage(){
  if(document.getElementById('style-partage')) return;
  const style = document.createElement('style');
  style.id = 'style-partage';
  style.textContent = STYLE_PARTAGE;
  document.head.appendChild(style);
}

function ouvrirLaFenetreDePartage({ blob, texte, nom }){
  poserStylePartage();
  const url = URL.createObjectURL(blob);
  const adresse = typeof SITE === 'object' ? SITE.adresseWeb : `https://${ADRESSE_DU_SITE}/`;

  const voile = document.createElement('div');
  voile.className = 'voile-partage';
  voile.setAttribute('role', 'dialog');
  voile.setAttribute('aria-modal', 'true');
  voile.setAttribute('aria-label', 'Partager cette page de classeur');
  voile.innerHTML = `
    <div class="boite-partage">
      <h2>Partager cette page</h2>
      <p class="mot">Enregistre l'image, puis dépose-la dans ta publication.
         Les réseaux ne permettent pas à un site de joindre une image à ta
         place : le bouton ouvre la fenêtre de publication avec le texte
         déjà écrit, l'image reste à glisser.</p>
      <img class="apercu" src="${url}" alt="Aperçu de l'image à partager">
      <div class="boutons">
        <button class="principal" data-enregistrer>Enregistrer l'image</button>
        <button data-copier>Copier le texte</button>
      </div>
      <p class="mot" style="margin:16px 0 8px">Ouvrir une publication :</p>
      <div class="reseaux">
        ${RESEAUX.map(r => `<a href="${r.adresse(texte, adresse)}" target="_blank"
             rel="noopener noreferrer">${r.nom}</a>`).join('')}
      </div>
      <div class="boutons" style="justify-content:flex-end">
        <button data-fermer>Fermer</button>
      </div>
    </div>`;

  const fermer = () => {
    document.removeEventListener('keydown', auClavier);
    URL.revokeObjectURL(url);
    voile.remove();
  };
  function auClavier(e){ if(e.key === 'Escape') fermer(); }

  voile.querySelector('[data-enregistrer]').addEventListener('click',
    () => telecharger(blob, nom));
  voile.querySelector('[data-copier]').addEventListener('click', async e => {
    try{
      await navigator.clipboard.writeText(`${texte} ${adresse}`);
      e.target.textContent = 'Texte copié ✓';
    }catch{
      e.target.textContent = 'Copie refusée par le navigateur';
    }
  });
  voile.querySelector('[data-fermer]').addEventListener('click', fermer);
  voile.addEventListener('click', e => { if(e.target === voile) fermer(); });
  document.addEventListener('keydown', auClavier);

  document.body.appendChild(voile);
  voile.querySelector('[data-enregistrer]').focus();
}
