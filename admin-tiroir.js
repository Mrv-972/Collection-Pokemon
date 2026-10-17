// Le tiroir d'administration : corrections, comptes, photos, signalements.
// ========================================================================
//
// Ces fonctions n'ont pas de place « en naviguant » : elles ne portent sur
// aucune carte qu'on aurait sous les yeux. Elles vivaient dans l'ancienne
// page d'administration ; elles s'ouvrent désormais dans un tiroir, depuis
// la barre d'administration, sur n'importe quelle page.
//
// Ce fichier n'est chargé que pour l'administrateur, à la première
// ouverture du tiroir. Il ne protège rien pour autant : chaque fonction de
// la base qu'il appelle vérifie elle-même que l'appelant est administrateur.
//
// Le code est déménagé, pas réécrit : les garde-fous restent : le pseudo à
// recopier avant de supprimer un compte, le motif écrit exigé avant de lire
// une discussion, et la trace au journal que l'administrateur ne peut pas
// effacer.
//
// Une chose a changé en route, et c'est une correction de sécurité :
// l'ancienne page insérait tels quels le pseudo, l'e-mail et la ville des
// membres. Un membre ayant choisi un pseudo contenant du code l'aurait fait
// exécuter dans la session de l'administrateur à l'ouverture de la liste :
// c'est-à-dire là où ce code aurait eu le plus de pouvoir. Toute valeur
// venue d'un membre passe désormais par echapper().

(() => {

const VERSION = (document.currentScript?.src.match(/[?&]v=([^&]+)/) ?? [])[1] ?? '';

const echapper = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let tiroir = null;
let ongletActif = 'corrections';

// La confirmation (supprimer un compte, motif de lecture) vit dans
// confirmation.js, que toutes les pages ne chargent pas.
let confirmationPrete = null;
function preparerConfirmation(){
  if(typeof demanderConfirmation === 'function') return Promise.resolve();
  return confirmationPrete ??= new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'confirmation.js' + (VERSION ? `?v=${VERSION}` : '');
    s.onload = ok;
    s.onerror = () => { confirmationPrete = null; ko(new Error('confirmation.js introuvable')); };
    document.head.appendChild(s);
  });
}

function message(texte, type){
  const m = tiroir?.querySelector('#tiroir-message');
  if(!m) return;
  m.hidden = false;
  m.className = `msg ${type}`;
  m.textContent = texte;
}

// --------------------------------------------------------- le tiroir ----

window.ouvrirTiroirAdmin = function(onglet = 'corrections'){
  poserStyle();
  ongletActif = onglet;
  if(!tiroir){
    tiroir = document.createElement('dialog');
    tiroir.id = 'admin-tiroir';
    tiroir.setAttribute('aria-label', 'Administration');
    document.body.appendChild(tiroir);
    tiroir.addEventListener('cancel', e => { e.preventDefault(); tiroir.close(); });
    // Un clic sur le voile, hors du panneau, referme le tiroir.
    tiroir.addEventListener('click', e => { if(e.target === tiroir) tiroir.close(); });
  }
  dessiner();
  if(!tiroir.open) tiroir.showModal();
};

function dessiner(){
  tiroir.innerHTML = `
    <div class="tiroir-tete">
      <div class="tiroir-onglets" role="tablist">
        <button type="button" role="tab" data-onglet="corrections"
                aria-selected="${ongletActif === 'corrections'}">Corrections en cours</button>
        <button type="button" role="tab" data-onglet="comptes"
                aria-selected="${ongletActif === 'comptes'}">Comptes</button>
        <button type="button" role="tab" data-onglet="photos"
                aria-selected="${ongletActif === 'photos'}">Photos à valider</button>
        <button type="button" role="tab" data-onglet="signalements"
                aria-selected="${ongletActif === 'signalements'}">Signalements</button>
      </div>
      <button type="button" class="tiroir-fermer" aria-label="Fermer">×</button>
    </div>
    <p class="msg" id="tiroir-message" role="status" hidden></p>
    ${ongletActif === 'comptes'
      ? `<input id="filtre-comptes" type="search" placeholder="Filtrer par pseudo, e-mail ou ville…"
                aria-label="Filtrer les comptes">
         <div id="zone-comptes"><p class="intro">Chargement…</p></div>`
      : ongletActif === 'photos'
      ? `<div id="zone-photos"><p class="intro">Chargement…</p></div>`
      : ongletActif === 'signalements'
      ? `<div id="zone-signalements"><p class="intro">Chargement…</p></div>`
      : `<div id="zone-liste"><p class="intro">Chargement…</p></div>`}`;

  tiroir.querySelector('.tiroir-fermer').onclick = () => tiroir.close();
  tiroir.querySelectorAll('[data-onglet]').forEach(b => b.onclick = () => {
    ongletActif = b.dataset.onglet;
    dessiner();
  });
  if(ongletActif === 'comptes') afficherComptes();
  else if(ongletActif === 'photos') afficherPhotos();
  else if(ongletActif === 'signalements') afficherSignalements();
  else afficherListe();
}

// ------------------------------------------------ les photos de profil ---
//
// Une photo proposée attend dans un dépôt privé. La valider, c'est la
// recopier dans le dépôt public, sous le dossier du membre, puis la
// déclarer sienne : la base vérifie que l'adresse est bien celle de ce
// dossier. La refuser, c'est la retirer, avec un motif que le membre lira.

async function afficherPhotos(){
  const zone = tiroir.querySelector('#zone-photos');
  try{
    const db = await clientSupabase();
    const { data, error } = await db.rpc('photos_en_attente');
    if(error) throw error;
    if(!data?.length){
      zone.innerHTML = '<p class="intro">Aucune photo en attente de validation.</p>';
      return;
    }
    const liens = await Promise.all(data.map(async p => {
      const { data: l } = await db.storage.from('avatars-attente').createSignedUrl(p.photo_en_attente, 600);
      return l?.signedUrl ?? '';
    }));
    zone.innerHTML = `
      <p class="aide">À refuser : nudité ou tenue suggestive, contenu choquant ou violent,
        photo visiblement d'une autre personne (célébrité, enfant…), coordonnées ou texte
        insultant. Dans le doute, refuse : le membre peut toujours choisir un Pokémon.</p>
      ${data.map((p, i) => `
        <div class="photo-a-valider" data-index="${i}">
          <img src="${echapper(liens[i])}" alt="Photo proposée par ${echapper(p.pseudo)}">
          <div>
            <b>${echapper(p.pseudo)}</b>
            <div class="detail">${p.photo_url ? 'Remplacerait sa photo actuelle' : 'Première photo'}</div>
            <div class="actions-photo">
              <button type="button" class="valider-photo">Valider</button>
              <button type="button" class="discret-admin refuser-photo">Refuser…</button>
            </div>
          </div>
        </div>`).join('')}`;
    zone.querySelectorAll('.photo-a-valider').forEach(bloc => {
      const p = data[Number(bloc.dataset.index)];
      bloc.querySelector('.valider-photo').onclick = () => traiterPhoto(bloc, () => validerPhoto(p), `Photo de ${p.pseudo} validée.`);
      bloc.querySelector('.refuser-photo').onclick = async () => {
        const motif = await demanderMotif({
          titre: `Refuser la photo de ${p.pseudo} ?`,
          texte: 'Le membre verra ce motif sur sa page de profil. Reste factuel et bref.',
          libelle: 'Motif du refus',
          exemple: 'Photo inappropriée',
          action: 'Refuser la photo',
          minimum: 3,
        });
        if(motif) traiterPhoto(bloc, () => refuserPhoto(p, motif), `Photo de ${p.pseudo} refusée.`);
      };
    });
  }catch(err){
    zone.innerHTML = `<p class="msg ko">Lecture impossible : ${echapper(err.message)}</p>
      <p class="aide">Si le message parle d'une fonction introuvable, le fichier
         <b>supabase/profil-photo-parametres.sql</b> n'a pas encore été exécuté.</p>`;
  }
}

async function traiterPhoto(bloc, action, reussite){
  bloc.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try{
    await action();
    message(reussite, 'ok');
    afficherPhotos();
  }catch(err){
    message(`Échec : ${err.message}`, 'ko');
    bloc.querySelectorAll('button').forEach(b => { b.disabled = false; });
  }
}

async function validerPhoto(p){
  const db = await clientSupabase();
  const { data: fichier, error: e1 } = await db.storage.from('avatars-attente').download(p.photo_en_attente);
  if(e1) throw e1;
  const chemin = `${p.id}/${p.photo_en_attente.split('/').pop()}`;
  const { error: e2 } = await db.storage.from('avatars').upload(chemin, fichier, { contentType: 'image/webp', upsert: false });
  if(e2) throw e2;
  const { data: publique } = db.storage.from('avatars').getPublicUrl(chemin);
  const { error: e3 } = await db.rpc('valider_photo', { membre: p.id, adresse: publique.publicUrl });
  if(e3) throw e3;
  // L'attente et l'éventuelle photo précédente n'ont plus d'objet.
  await db.storage.from('avatars-attente').remove([p.photo_en_attente]).catch(() => {});
  const ancienne = /\/avatars\/([^?]+)/.exec(p.photo_url ?? '');
  if(ancienne && decodeURIComponent(ancienne[1]) !== chemin)
    await db.storage.from('avatars').remove([decodeURIComponent(ancienne[1])]).catch(() => {});
}

async function refuserPhoto(p, motif){
  const db = await clientSupabase();
  const { error } = await db.rpc('refuser_photo', { membre: p.id, motif });
  if(error) throw error;
  await db.storage.from('avatars-attente').remove([p.photo_en_attente]).catch(() => {});
}

// ------------------------------------------------------ signalements ---
//
// Ce que les membres signalent : un comportement, une photo, un pseudo, un
// avis, un message. Classer un signalement le retire de la liste ; il reste
// en base, consultable depuis le tableau de bord Supabase.

const OBJETS_SIGNALES = {
  profil: 'Comportement', membre: 'Comportement', message: 'Message',
  photo: 'Photo de profil', pseudo: 'Pseudo', avis: 'Avis',
  sujet: 'Sujet de la communauté', reponse: 'Réponse dans la communauté',
};

async function afficherSignalements(){
  const zone = tiroir.querySelector('#zone-signalements');
  try{
    const db = await clientSupabase();
    const { data, error } = await db.rpc('signalements_a_traiter');
    if(error) throw error;
    if(!data?.length){
      zone.innerHTML = '<p class="intro">Aucun signalement en attente.</p>';
      return;
    }
    const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
    zone.innerHTML = `
      <p class="aide">Pour une discussion entière, passe par l'onglet Comptes : sa lecture
        demande un motif, inscrit au journal.</p>
      ${data.map((s, i) => `
        <div class="signalement" data-index="${i}">
          ${s.objet === 'photo' && s.signale_photo
            ? `<img src="${echapper(s.signale_photo)}" alt="Photo de ${echapper(s.signale)}">` : ''}
          <div class="quoi">
            <div><span class="etiquette attente">${echapper(OBJETS_SIGNALES[s.objet] ?? s.objet)}</span>
              <b>${echapper(s.signaleur ?? 'Un membre')}</b> signale
              <b>${echapper(s.signale ?? 'un compte supprimé')}</b>
              <span class="detail">· ${echapper(date.format(new Date(s.cree_le)))}</span></div>
            <p class="motif">${echapper(s.motif)}</p>
            ${s.contenu_titre ? `<div class="detail">Dans « ${echapper(s.contenu_titre)} »</div>` : ''}
            ${s.message_texte ? `<blockquote class="message-signale">${echapper(s.message_texte)}</blockquote>` : ''}
            <div class="actions-photo">
              ${s.sujet_id ? `<a class="discret-admin" href="communaute.html?sujet=${encodeURIComponent(s.sujet_id)}" target="_blank" rel="noopener">Voir le sujet</a>` : ''}
              ${s.sujet_id ? `<button type="button" class="discret-admin supprimer-contenu">Supprimer ${s.reponse_id ? 'la réponse' : 'le sujet'}…</button>` : ''}
              ${s.signale ? `<a class="discret-admin" href="profil.html?membre=${encodeURIComponent(s.signale_id)}" target="_blank" rel="noopener">Voir son profil</a>` : ''}
              ${s.signale_photo ? '<button type="button" class="discret-admin retirer-sa-photo">Retirer sa photo…</button>' : ''}
              <button type="button" class="valider-photo classer">Classer</button>
            </div>
          </div>
        </div>`).join('')}`;
    zone.querySelectorAll('.signalement').forEach(bloc => {
      const s = data[Number(bloc.dataset.index)];
      bloc.querySelector('.classer').onclick = () => traiterSignalement(bloc, async () => {
        const { error } = await db.rpc('traiter_signalement', { signalement: s.id });
        if(error) throw error;
      }, 'Signalement classé.');
      // Supprimer le contenu signalé emporte le signalement avec lui (la base
      // l'efface en cascade).
      const supprimer = bloc.querySelector('.supprimer-contenu');
      if(supprimer) supprimer.onclick = async () => {
        await preparerConfirmation();
        const ok = await demanderConfirmation({
          titre: s.reponse_id ? 'Supprimer cette réponse ?' : 'Supprimer ce sujet et ses réponses ?',
          message: 'Le contenu disparaît de la communauté, définitivement.',
          action: 'Supprimer', danger: true,
        });
        if(!ok) return;
        traiterSignalement(bloc, async () => {
          const { error } = s.reponse_id
            ? await db.from('reponses').delete().eq('id', s.reponse_id)
            : await db.from('sujets').delete().eq('id', s.sujet_id);
          if(error) throw error;
        }, 'Contenu supprimé.');
      };
      const retirer = bloc.querySelector('.retirer-sa-photo');
      if(retirer) retirer.onclick = async () => {
        const motif = await demanderMotif({
          titre: `Retirer la photo de ${s.signale} ?`,
          texte: 'La photo disparaît de son profil, et le membre lit ce motif sur sa page. Le signalement est classé dans la foulée.',
          libelle: 'Motif du retrait',
          exemple: 'Photo inappropriée',
          action: 'Retirer la photo',
          minimum: 3,
        });
        if(!motif) return;
        traiterSignalement(bloc, async () => {
          const { error } = await db.rpc('retirer_photo_de', { membre: s.signale_id, motif });
          if(error) throw error;
          const fichier = /\/avatars\/([^?]+)/.exec(s.signale_photo ?? '');
          if(fichier) await db.storage.from('avatars').remove([decodeURIComponent(fichier[1])]).catch(() => {});
          const { error: e2 } = await db.rpc('traiter_signalement', { signalement: s.id });
          if(e2) throw e2;
        }, `Photo de ${s.signale} retirée.`);
      };
    });
  }catch(err){
    zone.innerHTML = `<p class="msg ko">Lecture impossible : ${echapper(err.message)}</p>
      <p class="aide">Si le message parle d'une fonction introuvable, le fichier
         <b>supabase/communaute.sql</b> n'a pas encore été exécuté.</p>`;
  }
}

async function traiterSignalement(bloc, action, reussite){
  bloc.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try{
    await action();
    message(reussite, 'ok');
    afficherSignalements();
  }catch(err){
    message(`Échec : ${err.message}`, 'ko');
    bloc.querySelectorAll('button').forEach(b => { b.disabled = false; });
  }
}

// -------------------------------------------- les corrections en cours ---

async function afficherListe(){
  const zone = tiroir.querySelector('#zone-liste');
  try{
    const lignes = await listerCorrections();
    if(!lignes.length){
      zone.innerHTML = '<p class="intro">Aucune correction en cours. Tout ce que tu as saisi a été absorbé par le site.</p>';
      return;
    }
    const etats = await Promise.all(lignes.map(correctionAbsorbee));
    zone.innerHTML = `<ul class="liste-corrections">` + lignes.map((c, i) => `
      <li>
        ${c.image_chemin ? `<img class="apercu" src="${SUPABASE_URL}/storage/v1/object/public/corrections/${encodeURI(c.image_chemin)}" alt="">` : ''}
        <span class="quoi">
          <span class="cible">${echapper(c.cible)}</span>
          <span class="detail"> · ${({ visuel: 'visuel de carte', carte: 'carte',
              extension: 'extension', 'logo-extension': "logo d'extension",
              'logo-serie': 'logo de série' })[c.genre] ?? echapper(c.genre)}
            · ${echapper(c.univers)} · ${new Date(c.cree_le).toLocaleDateString('fr-FR')}</span>
        </span>
        <span class="etiquette ${etats[i] ? 'absorbee' : 'attente'}">${etats[i] ? 'absorbée par le site' : 'en attente'}</span>
        <button class="retour" data-id="${Number(c.id)}">Supprimer</button>
      </li>`).join('') + '</ul>' +
      `<p class="aide">« Absorbée » signifie que la construction nocturne a inscrit la correction dans les fichiers du site : tu peux la supprimer ici sans rien perdre. « En attente » signifie que le site ne l'affiche que grâce à cette ligne : ne la supprime pas encore.</p>`;

    zone.querySelectorAll('button[data-id]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try{
        await supprimerCorrection(Number(b.dataset.id));
        try{ sessionStorage.removeItem('pokeclasseur-corrections'); }catch(err){}
        afficherListe();
      }catch(err){
        b.disabled = false;
        message(`Suppression impossible : ${err.message}`, 'ko');
      }
    });
  }catch(err){
    zone.innerHTML = `<p class="msg ko">Lecture impossible : ${echapper(err.message)}</p>`;
  }
}

// --------------------------------------------------------- les comptes ---
//
// La liste vient de la base, par une fonction qui vérifie elle-même que
// l'appelant est administrateur : masquer le tiroir ne protégerait rien.

let comptesCharges = [];

const jamais = '-';
const dateCourte = d => d ? new Date(d).toLocaleDateString('fr-FR') : jamais;

function ligneCompte(c){
  // Pseudo, e-mail et ville sont choisis par le membre : echapper() partout.
  return `
    <tr data-id="${echapper(c.id)}">
      <td data-colonne="Pseudo">
        <b>${c.pseudo ? echapper(c.pseudo) : '<i>profil non terminé</i>'}</b>
        ${c.est_admin ? '<span class="etiquette-admin">admin</span>' : ''}
      </td>
      <td data-colonne="E-mail">${c.email ? echapper(c.email) : jamais}
        ${c.email_confirme ? '' : '<span class="detail"> · non confirmé</span>'}</td>
      <td data-colonne="Ville">${c.ville ? echapper(c.ville) : jamais}</td>
      <td data-colonne="Inscrit le">${dateCourte(c.inscrit_le)}</td>
      <td data-colonne="Dernière visite">${dateCourte(c.derniere_visite)}</td>
      <td data-colonne="Cartes">${Number(c.nb_cartes ?? 0)}</td>
      <td data-colonne="Conditions">${c.cgu_acceptees_le
          ? dateCourte(c.cgu_acceptees_le) + (c.cgu_version ? ` <span class="detail">(v. ${echapper(c.cgu_version)})</span>` : '')
          : '<span class="detail">avant la case</span>'}</td>
      <td data-colonne="">
        <button class="discret-admin" data-discussions="${echapper(c.id)}">Discussions</button>
        ${c.est_admin ? '' : `<button class="retour" data-supprimer="${echapper(c.id)}">Supprimer</button>`}
      </td>
    </tr>`;
}

function dessinerComptes(liste){
  const zone = tiroir.querySelector('#zone-comptes');
  if(!zone) return;
  if(!liste.length){
    zone.innerHTML = '<p class="intro">Aucun compte ne correspond.</p>';
    return;
  }
  zone.innerHTML = `
    <p class="aide">${liste.length} compte${liste.length > 1 ? 's' : ''} sur ${comptesCharges.length}.</p>
    <table class="table-comptes">
      <thead><tr>
        <th>Pseudo</th><th>E-mail</th><th>Ville</th><th>Inscrit le</th>
        <th>Dernière visite</th><th>Cartes</th><th>Conditions</th><th></th>
      </tr></thead>
      <tbody>${liste.map(ligneCompte).join('')}</tbody>
    </table>`;

  zone.querySelectorAll('[data-supprimer]').forEach(b => {
    b.onclick = () => supprimerLeCompte(b.dataset.supprimer, b);
  });
  zone.querySelectorAll('[data-discussions]').forEach(b => {
    b.onclick = () => ouvrirLesDiscussions(b.dataset.discussions);
  });
}

async function afficherComptes(){
  const zone = tiroir.querySelector('#zone-comptes');
  try{
    const db = await clientSupabase();
    const { data, error } = await db.rpc('admin_liste_comptes');
    if(error) throw error;
    comptesCharges = data ?? [];
    dessinerComptes(comptesCharges);
  }catch(err){
    zone.innerHTML = `<p class="msg ko">Lecture impossible : ${echapper(err.message)}</p>
      <p class="aide">Si le message parle d'une fonction introuvable, le fichier
         <b>supabase/administration-comptes.sql</b> n'a pas encore été exécuté.</p>`;
    return;
  }

  const filtre = tiroir.querySelector('#filtre-comptes');
  filtre.oninput = () => {
    const q = filtre.value.trim().toLowerCase();
    dessinerComptes(!q ? comptesCharges : comptesCharges.filter(c =>
      [c.pseudo, c.email, c.ville].some(x => (x ?? '').toLowerCase().includes(q))));
  };
}

// Supprimer le compte de quelqu'un d'autre ne se défait pas, et ne prévient
// pas l'intéressé. On annonce donc ce qui disparaît, et on demande de
// recopier le pseudo : de quoi rendre impossible la suppression du voisin
// de ligne par un clic mal visé.
async function supprimerLeCompte(id, bouton){
  const c = comptesCharges.find(x => x.id === id);
  if(!c) return;
  const nom = c.pseudo || c.email || 'ce compte';
  await preparerConfirmation();

  const accord = await demanderConfirmation({
    titre: 'Supprimer ce compte ?',
    message: `Le compte de <b>${echapper(nom)}</b>, sa collection de ${Number(c.nb_cartes ?? 0)} carte(s),
              ses échanges et toutes ses discussions vont être effacés.
              <b>Cette action est définitive</b>, et le membre n'en sera pas averti.
              La suppression sera inscrite au journal d'administration.`,
    action: 'Supprimer ce compte',
    saisieAttendue: c.pseudo || undefined,
    danger: true,
  });
  if(!accord) return;

  bouton.disabled = true;
  bouton.textContent = 'Suppression…';
  try{
    const db = await clientSupabase();
    const { error } = await db.rpc('admin_supprimer_compte', { cible: id, motif: null });
    if(error) throw error;
    comptesCharges = comptesCharges.filter(x => x.id !== id);
    dessinerComptes(comptesCharges);
    message(`Le compte de ${nom} a été supprimé.`, 'ok');
  }catch(err){
    bouton.disabled = false;
    bouton.textContent = 'Supprimer';
    message(`Suppression impossible : ${err.message}`, 'ko');
  }
}

// ------------------------------------------------- les discussions ------
//
// Les discussions appartiennent à leurs deux participants. Cet accès existe
// pour répondre à un signalement, à une plainte ou à une réquisition :
// pas pour lire par-dessus l'épaule des membres.
//
// Il est donc payant : un motif écrit est exigé, et chaque ouverture laisse
// au journal une trace que l'administrateur ne peut pas effacer. La
// politique de confidentialité annonce exactement cela.

async function ouvrirLesDiscussions(idMembre){
  const c = comptesCharges.find(x => x.id === idMembre);
  const zone = tiroir.querySelector('#zone-comptes');
  tiroir.querySelector('#panneau-discussions')?.remove();
  zone.insertAdjacentHTML('afterbegin',
    `<div class="panneau-discussions" id="panneau-discussions">
       <div class="tete">
         <h3>Discussions de ${echapper(c?.pseudo ?? 'ce membre')}</h3>
         <button class="discret-admin" id="fermer-discussions">Fermer</button>
       </div>
       <p class="aide">Ouvrir une discussion exige un motif, et laisse une trace
          au journal. Cet accès est réservé au traitement d'un signalement, d'une
          plainte ou d'une demande de l'autorité judiciaire.</p>
       <div id="liste-discussions"><p class="intro">Chargement…</p></div>
     </div>`);
  tiroir.querySelector('#fermer-discussions').onclick = () =>
    tiroir.querySelector('#panneau-discussions').remove();

  const liste = tiroir.querySelector('#liste-discussions');
  try{
    const db = await clientSupabase();
    const { data, error } = await db.rpc('admin_discussions_du_membre', { membre: idMembre });
    if(error) throw error;
    if(!data?.length){
      liste.innerHTML = '<p class="intro">Ce membre n\'a aucune discussion.</p>';
      return;
    }
    liste.innerHTML = '<ul class="liste-discussions">' + data.map(d => `
      <li>
        <span class="quoi">
          <span class="cible">avec ${echapper(d.avec_pseudo ?? 'un membre supprimé')}</span>
          <span class="detail"> · ${Number(d.nb_messages ?? 0)} message(s)
            · dernier le ${d.dernier_le ? new Date(d.dernier_le).toLocaleDateString('fr-FR') : '-'}</span>
        </span>
        <button class="discret-admin" data-lire="${echapper(d.conversation_id)}">Lire</button>
      </li>`).join('') + '</ul>';

    liste.querySelectorAll('[data-lire]').forEach(b => {
      b.onclick = () => lireLaDiscussion(b.dataset.lire, idMembre);
    });
  }catch(err){
    liste.innerHTML = `<p class="msg ko">Lecture impossible : ${echapper(err.message)}</p>`;
  }
}

async function lireLaDiscussion(idConversation, idMembre){
  const motif = await demanderMotif();
  if(!motif) return;

  const liste = tiroir.querySelector('#liste-discussions');
  try{
    const db = await clientSupabase();
    const { data, error } = await db.rpc('admin_lire_discussion',
      { conversation: idConversation, motif });
    if(error) throw error;

    liste.innerHTML = `
      <p class="aide">Lecture inscrite au journal : « ${echapper(motif)} »</p>
      <div class="fil">` + (data ?? []).map(m => `
        <div class="bulle">
          <div class="qui">${echapper(m.auteur_pseudo ?? 'membre supprimé')}
            <span class="detail">${new Date(m.envoye_le).toLocaleString('fr-FR')}</span></div>
          <div class="texte"></div>
        </div>`).join('') + '</div>' +
      `<button class="discret-admin" id="retour-discussions">Revenir aux discussions</button>`;

    // Le texte d'un membre n'est jamais interprété comme du HTML : il se pose
    // par textContent, sans quoi un message pourrait faire tourner du code
    // dans la session d'administration, qui est la dernière où le vouloir.
    liste.querySelectorAll('.bulle .texte').forEach((el, i) => {
      el.textContent = (data ?? [])[i]?.texte ?? '';
    });

    tiroir.querySelector('#retour-discussions').onclick = () => ouvrirLesDiscussions(idMembre);
  }catch(err){
    liste.insertAdjacentHTML('afterbegin', `<p class="msg ko">${echapper(err.message)}</p>`);
  }
}

// Le motif se saisit dans une petite fenêtre. Dix caractères au moins : la
// base refuse en dessous, autant le dire ici plutôt que de laisser partir
// un appel voué à l'échec.
// Par défaut, le motif d'ouverture d'une discussion ; le refus d'une photo
// réutilise la même fenêtre avec ses propres mots.
async function demanderMotif({
  titre = 'Pourquoi ouvrir cette discussion ?',
  texte = `Cet accès est réservé au traitement d'un signalement, d'une plainte ou
           d'une demande de l'autorité judiciaire. Le motif sera inscrit au
           journal, avec la date et ton pseudo, et ne pourra pas être effacé.`,
  libelle = 'Motif (dix caractères au moins)',
  exemple = 'Signalement du 22/09 pour menaces',
  action = 'Ouvrir et consigner',
  minimum = 10,
} = {}){
  await preparerConfirmation();
  return new Promise(resolve => {
    poserStyleConfirmation();
    const voile = document.createElement('div');
    voile.className = 'confirmation';
    voile.innerHTML = `
      <div class="boite">
        <h2>${echapper(titre)}</h2>
        <p>${texte}</p>
        <label class="recopie" for="motif-lecture">${echapper(libelle)}</label>
        <input id="motif-lecture" type="text" placeholder="${echapper(exemple)}">
        <div class="boutons">
          <button class="annuler" type="button">Annuler</button>
          <button class="principal" type="button" disabled>${echapper(action)}</button>
        </div>
      </div>`;

    const champ = voile.querySelector('#motif-lecture');
    const valider = voile.querySelector('.principal');
    champ.addEventListener('input', () => {
      valider.disabled = champ.value.trim().length < minimum;
    });

    function fermer(reponse){
      document.removeEventListener('keydown', auClavier, true);
      voile.remove();
      resolve(reponse);
    }
    function auClavier(e){
      // preventDefault, pas seulement stopPropagation : c'est l'action par
      // défaut d'Échap qui referme une fenêtre modale.
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); fermer(null); }
      if(e.key === 'Enter' && !valider.disabled) fermer(champ.value.trim());
    }
    voile.querySelector('.annuler').onclick = () => fermer(null);
    valider.onclick = () => { if(!valider.disabled) fermer(champ.value.trim()); };
    voile.addEventListener('click', e => { if(e.target === voile) fermer(null); });
    // En capture, pour passer avant le tiroir.
    document.addEventListener('keydown', auClavier, true);

    // Dans le tiroir, pas dans le corps de la page : un <dialog> modal rend
    // inerte tout ce qui est hors de lui, et la fenêtre du motif y serait
    // inaccessible.
    tiroir.appendChild(voile);
    requestAnimationFrame(() => { voile.classList.add('vue'); champ.focus(); });
  });
}

// ------------------------------------------------------------- style ----

function poserStyle(){
  if(document.getElementById('admin-tiroir-style')) return;
  const s = document.createElement('style');
  s.id = 'admin-tiroir-style';
  s.textContent = `
  #admin-tiroir{margin:0 0 0 auto;height:100vh;max-height:100vh;width:min(880px,100vw);
    border:0;border-left:1px solid rgba(201,162,39,.45);padding:20px 22px 40px;
    background:#16181D;color:#EDEAE0;overflow-y:auto;box-sizing:border-box}
  #admin-tiroir::backdrop{background:rgba(0,0,0,.55)}
  #admin-tiroir .tiroir-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 18px}
  #admin-tiroir .tiroir-onglets{display:flex;gap:6px;flex-wrap:wrap}
  #admin-tiroir .tiroir-onglets button{background:none;border:1px solid rgba(255,255,255,.14);color:#9B9E9C;
    padding:8px 15px;border-radius:999px;cursor:pointer;font:inherit;font-size:14px;min-height:40px}
  #admin-tiroir .tiroir-onglets button[aria-selected="true"]{background:rgba(201,162,39,.14);
    border-color:rgba(201,162,39,.5);color:#EDEAE0}
  #admin-tiroir .tiroir-fermer{background:none;border:1px solid rgba(255,255,255,.2);color:#EDEAE0;
    width:40px;height:40px;border-radius:50%;font-size:22px;line-height:1;cursor:pointer}
  #admin-tiroir .intro{color:#B9BCB9}
  #admin-tiroir .aide{font-size:12.5px;line-height:1.65;color:#9B9E9C;margin:16px 0 0}
  #admin-tiroir .msg{margin:0 0 14px;padding:11px 13px;border-radius:8px;font-size:14px}
  #admin-tiroir .msg.ok{background:rgba(31,111,99,.22);border:1px solid rgba(31,111,99,.5)}
  #admin-tiroir .msg.ko{background:rgba(168,67,28,.2);border:1px solid rgba(168,67,28,.55)}
  #admin-tiroir .retour{background:none;border:1px solid rgba(255,255,255,.2);color:#B9BCB9;
    border-radius:8px;padding:7px 13px;font:inherit;font-size:13px;cursor:pointer;min-height:36px}
  #admin-tiroir .discret-admin{font:inherit;font-size:12.5px;padding:5px 11px;border-radius:4px;cursor:pointer;
    background:transparent;color:#9B9E9C;border:1px solid rgba(237,234,224,.16);margin-right:6px}
  #admin-tiroir .discret-admin:hover{background:rgba(237,234,224,.07);color:#EDEAE0}
  #admin-tiroir .liste-corrections{list-style:none;padding:0;margin:0}
  #admin-tiroir .liste-corrections li{display:flex;gap:14px;align-items:center;padding:12px 0;
    border-top:1px solid rgba(255,255,255,.09);flex-wrap:wrap}
  #admin-tiroir .quoi{flex:1;min-width:200px}
  #admin-tiroir .cible{font-weight:600}
  #admin-tiroir .detail{font-size:13px;color:#9B9E9C}
  #admin-tiroir .photo-a-valider{display:flex;gap:16px;align-items:center;padding:14px 0;border-bottom:1px solid rgba(237,234,224,.08)}
  #admin-tiroir .photo-a-valider img{width:112px;height:112px;border-radius:50%;object-fit:cover;background:rgba(255,255,255,.05);flex:none}
  #admin-tiroir .actions-photo{display:flex;gap:8px;margin-top:10px}
  #admin-tiroir .valider-photo{font:inherit;font-size:13px;padding:7px 14px;border-radius:6px;cursor:pointer;
    border:0;background:#1F6F63;color:#EDF5F3}
  #admin-tiroir .signalement{display:flex;gap:16px;align-items:flex-start;padding:14px 0;border-bottom:1px solid rgba(237,234,224,.08)}
  #admin-tiroir .signalement img{width:84px;height:84px;border-radius:50%;object-fit:cover;flex:none;background:rgba(255,255,255,.05)}
  #admin-tiroir .signalement .etiquette{margin-right:6px}
  #admin-tiroir .signalement .motif{margin:8px 0 0;font-size:14px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
  #admin-tiroir .message-signale{margin:8px 0 0;padding:8px 12px;border-left:3px solid rgba(201,162,39,.5);
    background:rgba(237,234,224,.04);font-size:13.5px;color:#B9BCB9;white-space:pre-wrap;overflow-wrap:anywhere}
  #admin-tiroir a.discret-admin{display:inline-flex;align-items:center;text-decoration:none}
  #admin-tiroir .etiquette{font-size:12px;padding:3px 9px;border-radius:999px;white-space:nowrap}
  #admin-tiroir .etiquette.attente{background:rgba(201,162,39,.16);color:#E8D89A}
  #admin-tiroir .etiquette.absorbee{background:rgba(31,111,99,.22);color:#9FD9CE}
  #admin-tiroir .etiquette-admin{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;
    font-size:10.5px;background:rgba(201,162,39,.16);color:#E3C766}
  #admin-tiroir .apercu{width:64px;border-radius:6px;display:block}
  #admin-tiroir #filtre-comptes{width:100%;box-sizing:border-box;margin:0 0 16px;font:inherit;font-size:14px;
    padding:11px 13px;border-radius:6px;background:rgba(237,234,224,.05);color:#EDEAE0;
    border:1px solid rgba(237,234,224,.14);min-height:44px}
  #admin-tiroir .table-comptes{width:100%;border-collapse:collapse;font-size:13px}
  #admin-tiroir .table-comptes th{text-align:left;padding:8px 9px;font-size:11.5px;text-transform:uppercase;
    letter-spacing:.3px;color:#EDEAE0;border-bottom:1px solid rgba(237,234,224,.14)}
  #admin-tiroir .table-comptes td{padding:9px;color:#9B9E9C;vertical-align:top;border-bottom:1px solid rgba(237,234,224,.07)}
  #admin-tiroir .table-comptes td b{color:#EDEAE0}
  #admin-tiroir .panneau-discussions{border:1px solid rgba(201,162,39,.3);border-radius:6px;
    padding:16px 18px;margin:0 0 20px;background:rgba(201,162,39,.04)}
  #admin-tiroir .panneau-discussions .tete{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
  #admin-tiroir .panneau-discussions h3{font-weight:500;font-size:18px;margin:0 0 6px}
  #admin-tiroir .liste-discussions{list-style:none;margin:12px 0 0;padding:0}
  #admin-tiroir .liste-discussions li{display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:9px 0;border-bottom:1px solid rgba(237,234,224,.07)}
  #admin-tiroir .fil{margin:12px 0;max-height:460px;overflow-y:auto}
  #admin-tiroir .bulle{padding:9px 12px;border-radius:6px;background:rgba(237,234,224,.05);margin-bottom:8px}
  #admin-tiroir .bulle .qui{font-size:12px;font-weight:600;color:#EDEAE0;margin-bottom:4px}
  #admin-tiroir .bulle .texte{font-size:13.5px;line-height:1.55;color:#B9BCB9;white-space:pre-wrap}
  @media(max-width:860px){
    #admin-tiroir .table-comptes,#admin-tiroir .table-comptes tbody,
    #admin-tiroir .table-comptes tr,#admin-tiroir .table-comptes td{display:block}
    #admin-tiroir .table-comptes thead{display:none}
    #admin-tiroir .table-comptes tr{border:1px solid rgba(237,234,224,.1);border-radius:6px;padding:10px 12px;margin-bottom:10px}
    #admin-tiroir .table-comptes td{border:0;padding:3px 0}
    #admin-tiroir .table-comptes td[data-colonne]:not([data-colonne=""])::before{
      content:attr(data-colonne) " : ";color:#EDEAE0;font-weight:600}
  }`;
  document.head.appendChild(s);
}

})();
