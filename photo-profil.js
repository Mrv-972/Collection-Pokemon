// La photo de profil, sur la page « Mon profil ».
// ===============================================
//
// Deux façons d'avoir une image :
//   — un Pokémon de la galerie : immédiat, visible de tous ;
//   — une photo à soi : recadrée, réduite, contrôlée par un filtre
//     automatique dans le navigateur, puis mise en attente. Elle ne sera
//     visible des autres qu'une fois validée par l'administrateur.
//
// Le filtre (NSFWJS, vendor/nsfwjs) écarte l'essentiel des images
// pornographiques ou suggestives avant même l'envoi. Il tourne chez le
// visiteur et pourrait donc être contourné : c'est la validation qui fait
// foi, et la base l'impose (supabase/profil-photo-parametres.sql).

const COTE_PHOTO = 256;   // le profil s'affiche au plus en 96 px : 256 suffit, même sur écran dense

// Seuils du filtre, volontairement sévères : le site accueille des membres
// dès 15 ans. Une photo de plage refusée à tort a une solution simple —
// en choisir une autre, ou un Pokémon ; une image pornographique acceptée
// n'en a pas.
const SEUIL_EXPLICITE = 0.2;    // « Porn » + « Hentai »
const SEUIL_SUGGESTIVE = 0.45;  // « Sexy »

let filtrePret = null;
function chargerScript(src){
  return new Promise((ok, ko) => {
    const s = Object.assign(document.createElement('script'), { src, async: false });
    s.onload = ok;
    s.onerror = () => ko(new Error(`Chargement impossible : ${src}`));
    document.head.appendChild(s);
  });
}

// Le filtre pèse 6 Mo : chargé une fois, au premier besoin seulement.
function chargerFiltre(){
  filtrePret ??= (async () => {
    await chargerScript('vendor/nsfwjs/model.min.js');
    await chargerScript('vendor/nsfwjs/group1-shard1of1.min.js');
    await chargerScript('vendor/nsfwjs/nsfwjs.min.js');
    return window.nsfwjs.load('MobileNetV2');
  })();
  filtrePret.catch(() => { filtrePret = null; });
  return filtrePret;
}

// Recadre au centre, réduit à 256 × 256 et réencode en WebP. Le
// réencodage a un second mérite : il efface les métadonnées de la photo
// d'origine — dont, souvent, la position GPS de l'endroit où elle a été
// prise.
async function preparerPhoto(fichier){
  if(!/^image\//.test(fichier.type)) throw new Error("Ce fichier n'est pas une image.");
  if(fichier.size > 15 * 1024 * 1024) throw new Error('Cette image est trop lourde (15 Mo au plus).');
  let image;
  try{ image = await createImageBitmap(fichier); }
  catch{ throw new Error("Cette image n'a pas pu être lue. Essaie un fichier JPEG ou PNG."); }
  if(Math.min(image.width, image.height) < 96) throw new Error('Cette image est trop petite (96 pixels de côté au moins).');
  const cote = Math.min(image.width, image.height);
  const toile = Object.assign(document.createElement('canvas'), { width: COTE_PHOTO, height: COTE_PHOTO });
  const ctx = toile.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, (image.width - cote) / 2, (image.height - cote) / 2, cote, cote, 0, 0, COTE_PHOTO, COTE_PHOTO);
  const blob = await new Promise(ok => toile.toBlob(ok, 'image/webp', 0.86));
  if(!blob) throw new Error("La photo n'a pas pu être préparée par ce navigateur.");
  return { toile, blob };
}

async function verifierPhoto(toile){
  const modele = await chargerFiltre();
  const predictions = await modele.classify(toile);
  const p = Object.fromEntries(predictions.map(x => [x.className, x.probability]));
  const explicite = (p.Porn ?? 0) + (p.Hentai ?? 0);
  return { acceptable: explicite < SEUIL_EXPLICITE && (p.Sexy ?? 0) < SEUIL_SUGGESTIVE, scores: p };
}

const STYLE_PHOTO_PROFIL = `
  .photo-profil{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;margin:26px 0 8px;
    padding:20px;border-radius:12px;background:rgba(var(--trait-rgb),0.04);border:1px solid rgba(var(--trait-rgb),0.10)}
  .photo-profil .apercu{position:relative}
  .photo-profil .etat{font-size:13px;line-height:1.55;color:var(--text-on-ink-dim);margin:6px 0 12px}
  .photo-profil .etat b{color:var(--text-on-ink)}
  .photo-profil .etat.attente b{color:var(--accent-clair)}
  .photo-profil .etat.refus b{color:var(--alerte)}
  .photo-profil .actions{display:flex;flex-wrap:wrap;gap:8px}
  /* La page du compte habille tous ses boutons (pleine largeur, marges) :
     ceux de la photo reprennent leur taille de pastille. */
  .photo-profil .actions button,.photo-profil .actions label{font:inherit;font-size:13px;line-height:1.3;padding:8px 13px;border-radius:999px;cursor:pointer;
    border:1px solid rgba(var(--trait-rgb),0.18);background:transparent;color:var(--text-on-ink);
    width:auto;margin:0;min-height:0;white-space:nowrap}
  .photo-profil .actions button:hover,.photo-profil .actions label:hover{background:rgba(var(--trait-rgb),0.07)}
  .photo-profil .actions .principal-photo{background:var(--teal);border-color:var(--teal);color:#EDF5F3}
  .photo-profil .actions .principal-photo:hover{background:var(--teal-deep)}
  .photo-profil .actions input{display:none}
  .photo-profil .note{grid-column:1 / -1;font-size:12px;line-height:1.6;color:var(--text-on-ink-dim);margin:0}
  .photo-profil .travail{grid-column:1 / -1;font-size:13px;color:var(--text-on-ink-dim);margin:0}
  .photo-profil .travail.err{color:var(--alerte)}
  .galerie-avatars{grid-column:1 / -1;display:grid;grid-template-columns:repeat(auto-fill,minmax(68px,1fr));gap:8px;margin-top:4px}
  .galerie-avatars button{width:auto;margin:0;min-height:0;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px 6px;border-radius:10px;cursor:pointer;
    border:1px solid rgba(var(--trait-rgb),0.10);background:rgba(var(--trait-rgb),0.03);color:var(--text-on-ink-dim);font:inherit;font-size:10.5px}
  .galerie-avatars button:hover{border-color:rgba(var(--gold-rgb),0.5)}
  .galerie-avatars button[aria-pressed="true"]{border-color:var(--gold);background:rgba(var(--gold-rgb),0.12);color:var(--text-on-ink)}
  .galerie-avatars img{width:44px;height:44px;object-fit:contain}
  @media(max-width:520px){ .photo-profil{grid-template-columns:1fr;justify-items:start} }
`;

function poserStylePhotoProfil(){
  if(document.getElementById('style-photo-profil')) return;
  document.head.appendChild(Object.assign(document.createElement('style'),
    { id: 'style-photo-profil', textContent: STYLE_PHOTO_PROFIL }));
}

const echapperTexteProfil = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Dessine la section dans « conteneur ». « apresChangement » est appelé
// quand l'image du membre a changé : la page redessine alors l'en-tête.
async function afficherPhotoProfil(conteneur, apresChangement = () => {}){
  if(!conteneur) return;
  poserStylePhotoProfil();

  if(!profilAPhoto()){
    conteneur.innerHTML = `<section class="photo-profil"><div class="apercu">${avatarHtml(profil, 84)}</div>
      <p class="etat">La photo de profil s'activera dès que la base de données du site aura été mise à jour.</p></section>`;
    return;
  }

  const statut = profil.photo_statut;
  let etat = '';
  if(statut === 'en_attente') etat = `<p class="etat attente"><b>Photo en attente de validation.</b> Elle sera visible des autres membres dès qu'elle aura été vérifiée. En attendant, ils voient ${profil.photo_url ? 'ta photo précédente' : profil.avatar ? 'ton Pokémon' : 'ton initiale'}.</p>`;
  else if(statut === 'refusee') etat = `<p class="etat refus"><b>Ta dernière photo a été refusée</b>${profil.photo_motif ? ` : ${echapperTexteProfil(profil.photo_motif)}` : '.'} Tu peux en proposer une autre, ou choisir un Pokémon.</p>`;
  else if(statut === 'validee') etat = `<p class="etat">Ta photo est visible des autres membres.</p>`;
  else etat = `<p class="etat">${profil.avatar ? 'Ton Pokémon est visible des autres membres.' : 'Choisis un Pokémon, ou envoie une photo de toi.'}</p>`;

  conteneur.innerHTML = `
    <section class="photo-profil" aria-labelledby="titre-photo">
      <div class="apercu" id="apercu-photo">${avatarHtml(profil, 84)}</div>
      <div>
        <h2 id="titre-photo" style="font-size:20px">Photo de profil</h2>
        ${etat}
        <div class="actions">
          <button type="button" id="btn-galerie" aria-expanded="false">Choisir un Pokémon</button>
          <label class="principal-photo" for="champ-photo">Envoyer une photo<input type="file" id="champ-photo" accept="image/jpeg,image/png,image/webp"></label>
          ${profil.photo_url || profil.photo_en_attente ? '<button type="button" id="btn-retirer-photo">Retirer ma photo</button>' : ''}
          ${profil.avatar && !profil.photo_url ? '<button type="button" id="btn-retirer-avatar">Retirer le Pokémon</button>' : ''}
        </div>
      </div>
      <p class="travail" id="travail-photo" role="status" hidden></p>
      <div class="galerie-avatars" id="galerie-avatars" hidden>
        ${AVATARS.map(a => `<button type="button" data-avatar="${a.cle}" aria-pressed="${profil.avatar === a.cle}" title="${a.nom}">
          <img src="${urlAvatar(a.cle)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">${a.nom}</button>`).join('')}
      </div>
      <p class="note">Les photos sont vérifiées avant d'être montrées aux autres membres. Sont refusées : nudité,
        contenu choquant ou violent, images de quelqu'un d'autre sans son accord, coordonnées ou
        informations personnelles. La photo est recadrée en carré et ses informations cachées (lieu de
        prise de vue…) sont effacées avant l'envoi.</p>
    </section>`;

  // Ma photo en attente : je suis le seul à pouvoir la voir.
  if(statut === 'en_attente'){
    lienPhotoEnAttente().then(lien => {
      if(lien) document.getElementById('apercu-photo').innerHTML =
        avatarHtml({ ...profil, photo_url: lien }, 84);
    }).catch(() => {});
  }

  const travail = document.getElementById('travail-photo');
  const dire = (texte, erreur = false) => {
    travail.hidden = !texte;
    travail.textContent = texte ?? '';
    travail.classList.toggle('err', erreur);
  };
  const redessiner = async () => { await afficherPhotoProfil(conteneur, apresChangement); apresChangement(); };

  const galerie = document.getElementById('galerie-avatars');
  document.getElementById('btn-galerie').addEventListener('click', e => {
    galerie.hidden = !galerie.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!galerie.hidden));
  });
  galerie.addEventListener('click', async e => {
    const b = e.target.closest('[data-avatar]');
    if(!b) return;
    try{ await choisirAvatar(b.dataset.avatar); await redessiner(); }
    catch(err){ dire(`L'avatar n'a pas pu être enregistré : ${err.message}`, true); }
  });
  document.getElementById('btn-retirer-avatar')?.addEventListener('click', async () => {
    try{ await choisirAvatar(null); await redessiner(); }
    catch(err){ dire(`L'avatar n'a pas pu être retiré : ${err.message}`, true); }
  });
  document.getElementById('btn-retirer-photo')?.addEventListener('click', async () => {
    try{ await retirerPhoto(); await redessiner(); }
    catch(err){ dire(`La photo n'a pas pu être retirée : ${err.message}`, true); }
  });

  document.getElementById('champ-photo').addEventListener('change', async e => {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if(!fichier) return;
    try{
      dire('Préparation de la photo…');
      const { toile, blob } = await preparerPhoto(fichier);
      dire('Vérification automatique de la photo… (quelques secondes la première fois)');
      const { acceptable } = await verifierPhoto(toile);
      if(!acceptable){
        dire('Cette photo ne peut pas être utilisée : le contrôle automatique la juge inappropriée. ' +
             'Choisis-en une autre, ou un Pokémon de la galerie.', true);
        return;
      }
      dire('Envoi de la photo…');
      await proposerPhoto(blob);
      await redessiner();
    }catch(err){
      console.warn('Photo de profil', err);
      dire(err.message || "La photo n'a pas pu être envoyée.", true);
    }
  });
}
