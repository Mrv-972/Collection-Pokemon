const FAMILLES_BADGES = [
  { cle: 'collection', nom: 'Collection et échanges' },
  { cle: 'communaute', nom: 'Communauté' },
];
const BADGES = [
  { cle: 'premiere-carte',         famille: 'collection', nom: 'Premiers pas',          texte: 'A marqué sa première carte obtenue.' },
  { cle: 'cent-cartes',            famille: 'collection', nom: 'Cent cartes',           texte: 'Possède au moins 100 cartes.' },
  { cle: 'cinq-cents-cartes',      famille: 'collection', nom: 'Cinq cents cartes',     texte: 'Possède au moins 500 cartes.' },
  { cle: 'mille-cartes',           famille: 'collection', nom: 'Mille cartes',          texte: 'Possède au moins 1 000 cartes.' },
  { cle: 'extension-complete',     famille: 'collection', nom: 'Extension complète',    texte: 'A réuni toutes les cartes d\'une extension.' },
  { cle: 'cinq-extensions',        famille: 'collection', nom: 'Cinq extensions',       texte: 'A complété cinq extensions.' },
  { cle: 'genereux',               famille: 'collection', nom: 'Généreux',              texte: 'Propose au moins 20 cartes à l\'échange.' },
  { cle: 'premier-echange',        famille: 'collection', nom: 'Premier échange',       texte: 'A reçu un premier avis positif après un échange.' },
  { cle: 'echangeur-de-confiance', famille: 'collection', nom: 'Échangeur de confiance', texte: 'Au moins 5 avis positifs, et quatre fois plus de positifs que de négatifs.' },
  { cle: 'un-an',                  famille: 'collection', nom: 'Un an parmi nous',      texte: 'Inscrit depuis plus d\'un an.' },
  { cle: 'pionnier',               famille: 'collection', nom: 'Pionnier',              texte: 'Parmi les cent premiers inscrits.' },
  { cle: 'premier-message',        famille: 'communaute', nom: 'Premier message',       texte: 'A publié son premier message dans la Communauté.' },
  { cle: 'bonne-reponse',          famille: 'communaute', nom: 'Bonne réponse',         texte: 'Une de ses réponses a été choisie comme la meilleure.' },
  { cle: 'serviable',              famille: 'communaute', nom: 'Serviable',             texte: 'A répondu aux questions de 10 membres.' },
  { cle: 'idee-populaire',         famille: 'communaute', nom: 'Idée populaire',        texte: 'Une de ses idées a été soutenue par au moins 10 membres.' },
  { cle: 'idee-retenue',           famille: 'communaute', nom: 'Idée retenue',          texte: 'Une de ses idées est prévue ou réalisée sur le site.' },
  { cle: 'expert',                 famille: 'communaute', nom: 'Expert',                texte: 'Cinq de ses réponses ont été choisies comme les meilleures.' },
  { cle: 'pilier-du-forum',        famille: 'communaute', nom: 'Pilier du forum',       texte: 'A publié au moins 50 messages dans la Communauté.' },
];

const lienProfil = id => `profil.html?membre=${encodeURIComponent(id)}`;

const echapperCommun = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fonctionAbsente = err => ['PGRST202', '42883', 'PGRST204', '42P01', 'PGRST205'].includes(err?.code);

async function appeler(fonction, args){
  const db = await clientSupabase();
  const { data, error } = await db.rpc(fonction, args);
  if(error) throw error;
  return data;
}

async function profilPublic(id){ return (await appeler('profil_public', { membre: id }))?.[0] ?? null; }
async function badgesDe(id){
  const [collection, communaute] = await Promise.all([
    appeler('badges_de', { membre: id }),
    appeler('badges_communaute', { membre: id }).catch(err => { if(fonctionAbsente(err)) return []; throw err; }),
  ]);
  return new Set([...(collection ?? []), ...(communaute ?? [])].map(l => l.badge));
}
async function avisRecus(id){ return await appeler('avis_recus', { membre: id }) ?? []; }
async function peutDonnerAvis(id){ return !!(await appeler('a_discute_avec', { autre: id })); }

async function monAvisSur(id){
  const db = await clientSupabase();
  const { data, error } = await db.from('avis').select('note, commentaire')
    .eq('auteur_id', membre.id).eq('destinataire_id', id).maybeSingle();
  if(error) throw error;
  return data;
}

async function donnerAvis(id, note, commentaire){
  const db = await clientSupabase();
  const { error } = await db.from('avis').upsert({
    auteur_id: membre.id, destinataire_id: id, note,
    commentaire: commentaire?.trim() || null,
  });
  if(error){
    if(error.code === '42501') throw new Error("Tu pourras donner un avis après avoir échangé des messages avec ce membre.");
    throw error;
  }
}

async function retirerAvis(id){
  const db = await clientSupabase();
  const { error } = await db.from('avis').delete().eq('auteur_id', membre.id).eq('destinataire_id', id);
  if(error) throw error;
}

async function resumesAvis(ids){
  const resumes = new Map();
  const uniques = [...new Set(ids)].filter(Boolean);
  if(!uniques.length || !estConnecte()) return resumes;
  try{
    const db = await clientSupabase();
    const { data, error } = await db.from('avis').select('destinataire_id, note').in('destinataire_id', uniques);
    if(error) return resumes;
    for(const a of data ?? []){
      const r = resumes.get(a.destinataire_id) ?? { positifs: 0, negatifs: 0 };
      r[a.note === 'positif' ? 'positifs' : 'negatifs']++;
      resumes.set(a.destinataire_id, r);
    }
  }catch{ }
  return resumes;
}

function resumeAvisHtml(r){
  if(!r || (!r.positifs && !r.negatifs)) return '';
  return `<span class="resume-avis" title="Avis reçus après des échanges">${pictogramme('pouce')} ${r.positifs}${r.negatifs ? ` · ${pictogramme('pouce-bas')} ${r.negatifs}` : ''}</span>`;
}

async function signalerContenu({ membreId, objet, motif, messageId = null, sujetId = null, reponseId = null }){
  const db = await clientSupabase();
  const ligne = { signaleur_id: membre.id, signale_id: membreId, objet, message_id: messageId, motif: motif.trim() };
  if(sujetId) ligne.sujet_id = sujetId;
  if(reponseId) ligne.reponse_id = reponseId;
  const { error } = await db.from('signalements').insert(ligne);
  if(error) throw error;
}

const FORMAT_JOUR_AVIS = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function badgesHtml(obtenus, complet){
  const montres = complet ? BADGES : BADGES.filter(b => obtenus.has(b.cle));
  if(!montres.length) return '<p class="vide-doux">Pas encore de badge.</p>';
  return FAMILLES_BADGES.map(f => {
    const dans = montres.filter(b => b.famille === f.cle);
    if(!dans.length) return '';
    const nb = dans.filter(b => obtenus.has(b.cle)).length;
    return `
      <h3 class="famille-badges">${f.nom}${complet ? ` <small>${nb} sur ${dans.length}</small>` : ''}</h3>
      <div class="badges">${dans.map(b => `
        <div class="badge-collection ${obtenus.has(b.cle) ? '' : 'verrouille'}"
             ${obtenus.has(b.cle) ? '' : 'aria-label="Badge à obtenir"'}>
          ${badgeArene('badge-' + b.cle, obtenus.has(b.cle), { taille: 46 })}
          <span><b>${b.nom}</b><small>${b.texte}</small></span>
        </div>`).join('')}</div>`;
  }).join('');
}

function avisHtml(liste, moi){
  if(!liste.length) return `<p class="vide-doux">${moi
    ? "Aucun avis pour l'instant. Après un échange, ton partenaire pourra en laisser un depuis votre discussion ou ton profil."
    : "Aucun avis pour l'instant."}</p>`;
  return `<ul class="liste-avis">${liste.map((a, i) => `
    <li class="un-avis">
      <a class="lien-profil" href="${lienProfil(a.auteur_id)}">${avatarHtml(a, 34)}</a>
      <div style="flex:1;min-width:0">
        <div class="tete-avis">
          <a class="lien-profil" href="${lienProfil(a.auteur_id)}"><b class="nom-lien">${echapperCommun(a.pseudo)}</b></a>
          <span>${a.note === 'positif' ? `${pictogramme('pouce')} Bien passé` : `${pictogramme('pouce-bas')} Mal passé`}</span>
          <span class="date">${FORMAT_JOUR_AVIS.format(new Date(a.maj_le))}</span>
          ${a.auteur_id !== membre?.id ? `<button type="button" class="signaler-avis" data-avis="${i}">Signaler</button>` : ''}
        </div>
        ${a.commentaire ? `<p>${echapperCommun(a.commentaire)}</p>` : ''}
      </div>
    </li>`).join('')}</ul>`;
}

function vitrineHtml(p, obtenus, avis, { moi = false, complet = false } = {}){
  const n = (nombre, un, plusieurs) => `${nombre > 1 ? plusieurs : un}`;
  return `
    <section class="chiffres" aria-label="En chiffres">
      <div class="chiffre"><b>${p.nb_proposees}</b><span>${n(p.nb_proposees, 'carte proposée', 'cartes proposées')} à l'échange</span></div>
      <div class="chiffre"><b>${p.nb_recherchees}</b><span>${n(p.nb_recherchees, 'carte recherchée', 'cartes recherchées')}</span></div>
      <div class="chiffre"><b>${p.avis_positifs}</b><span>${pictogramme('pouce')} ${n(p.avis_positifs, 'avis positif', 'avis positifs')}</span></div>
      <div class="chiffre"><b>${p.avis_negatifs}</b><span>${pictogramme('pouce-bas')} ${n(p.avis_negatifs, 'avis négatif', 'avis négatifs')}</span></div>
    </section>

    <section class="bloc-profil" aria-labelledby="titre-badges">
      <h2 id="titre-badges">${moi ? 'Mes badges' : 'Badges'} <small>${obtenus.size} sur ${BADGES.length}</small></h2>
      ${badgesHtml(obtenus, complet)}
    </section>

    <section class="bloc-profil" aria-labelledby="titre-avis">
      <h2 id="titre-avis">Avis reçus <small>${avis.length} avis</small></h2>
      <p>Laissés par des membres qui ont échangé avec ${moi ? 'toi' : echapperCommun(p.pseudo)}.</p>
      ${avisHtml(avis, moi)}
    </section>`;
}

function brancherVitrine(zone, p, avis){
  zone.querySelectorAll('.signaler-avis').forEach(b => b.addEventListener('click', async () => {
    const a = avis[Number(b.dataset.avis)];
    const reponse = await demanderSignalement(a.pseudo, { objet: 'avis' });
    if(!reponse) return;
    try{
      await signalerContenu({ membreId: a.auteur_id, objet: 'avis',
        motif: `Avis laissé à ${p.pseudo} : « ${a.commentaire ?? (a.note === 'positif' ? 'avis positif' : 'avis négatif')} » : ${reponse.motif}` });
      annoncer("Signalement envoyé. Merci : l'administrateur va l'examiner.");
    }catch(err){ annoncer(`Le signalement n'est pas parti : ${err.message}`, 'ko'); }
  }));
}

function ouvrirFenetre({ titre, corps, action, remplir, danger = false, extra = '' }){
  poserStyleCommunaute();
  return new Promise(resolve => {
    const fenetre = document.createElement('dialog');
    fenetre.className = 'fenetre-communaute';
    fenetre.innerHTML = `
      <form method="dialog" class="boite">
        <h2>${echapperCommun(titre)}</h2>
        ${corps}
        <div class="boutons">
          ${extra}
          <button type="button" class="annuler">Annuler</button>
          <button type="submit" class="valider ${danger ? 'danger' : ''}" disabled>${echapperCommun(action)}</button>
        </div>
      </form>`;
    document.body.appendChild(fenetre);
    const valider = fenetre.querySelector('.valider');
    const lire = remplir(fenetre, () => { valider.disabled = lire() === null; });
    const fermer = reponse => { fenetre.close(); fenetre.remove(); resolve(reponse); };
    fenetre.querySelector('.annuler').onclick = () => fermer(null);
    fenetre.addEventListener('cancel', e => { e.preventDefault(); fermer(null); });
    fenetre.addEventListener('click', e => { if(e.target === fenetre) fermer(null); });
    fenetre.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const r = lire();
      if(r !== null) fermer(r);
    });
    fenetre.querySelector('[data-retirer]')?.addEventListener('click', () => fermer({ retirer: true }));
    fenetre.showModal();
    valider.disabled = lire() === null;
    fenetre.querySelector('input:checked, input, textarea')?.focus();
  });
}

function demanderAvis(pseudo, actuel = null){
  return ouvrirFenetre({
    titre: actuel ? `Modifier ton avis sur ${pseudo}` : `Ton avis sur ${pseudo}`,
    action: actuel ? 'Enregistrer' : 'Publier mon avis',
    extra: actuel ? '<button type="button" class="retirer-avis" data-retirer>Retirer mon avis</button>' : '',
    corps: `
      <p>Comment s'est passé votre échange ? Ton avis sera visible des autres membres sur son profil.</p>
      <div class="choix-note" role="radiogroup" aria-label="Ton avis">
        <label><input type="radio" name="note" value="positif" ${actuel?.note === 'positif' ? 'checked' : ''}>
          <span>${pictogramme('pouce')} Bien passé</span></label>
        <label><input type="radio" name="note" value="negatif" ${actuel?.note === 'negatif' ? 'checked' : ''}>
          <span>${pictogramme('pouce-bas')} Mal passé</span></label>
      </div>
      <label class="libelle" for="commentaire-avis">Un mot pour les autres membres <small>(facultatif)</small></label>
      <textarea id="commentaire-avis" maxlength="280" rows="3"
        placeholder="Envoi rapide, carte en parfait état…">${echapperCommun(actuel?.commentaire ?? '')}</textarea>
      <p class="compteur"><span id="reste-avis">280</span> caractères restants</p>`,
    remplir(f, maj){
      const zone = f.querySelector('textarea'), reste = f.querySelector('#reste-avis');
      const majReste = () => { reste.textContent = String(280 - zone.value.length); };
      majReste();
      f.querySelectorAll('input[name="note"]').forEach(r => r.addEventListener('change', maj));
      zone.addEventListener('input', () => { majReste(); maj(); });
      return () => {
        const note = f.querySelector('input[name="note"]:checked')?.value;
        return note ? { note, commentaire: zone.value } : null;
      };
    },
  });
}

function demanderSignalement(pseudo, { photo = false, objet = null } = {}){
  const choix = objet ? [] : [
    ['profil', 'Son comportement (arnaque, harcèlement, insultes…)'],
    ...(photo ? [['photo', 'Sa photo de profil']] : []),
    ['pseudo', 'Son pseudo'],
  ];
  return ouvrirFenetre({
    titre: objet === 'avis' ? `Signaler l'avis de ${pseudo}`
         : objet === 'sujet' ? `Signaler le sujet de ${pseudo}`
         : objet === 'reponse' ? `Signaler la réponse de ${pseudo}`
         : `Signaler ${pseudo}`,
    action: 'Envoyer le signalement',
    danger: true,
    corps: `
      <p>Le signalement est lu par l'administrateur, et ${echapperCommun(pseudo)} n'en est pas averti.</p>
      ${choix.length ? `<div class="choix-objet" role="radiogroup" aria-label="Ce qui pose problème">
        ${choix.map(([v, t], i) => `<label><input type="radio" name="objet" value="${v}" ${i === 0 ? 'checked' : ''}><span>${t}</span></label>`).join('')}
      </div>` : ''}
      <label class="libelle" for="motif-signalement">Que s'est-il passé ?</label>
      <textarea id="motif-signalement" maxlength="1000" rows="4"
        placeholder="Décris le problème en quelques mots."></textarea>`,
    remplir(f, maj){
      const zone = f.querySelector('textarea');
      zone.addEventListener('input', maj);
      f.querySelectorAll('input[name="objet"]').forEach(r => r.addEventListener('change', maj));
      return () => {
        const motif = zone.value.trim();
        if(motif.length < 3) return null;
        return { objet: objet ?? f.querySelector('input[name="objet"]:checked')?.value ?? 'profil', motif };
      };
    },
  });
}

function annoncer(texte, type = 'ok'){
  poserStyleCommunaute();
  const a = Object.assign(document.createElement('div'), { className: `annonce-communaute ${type}`, textContent: texte });
  a.setAttribute('role', 'status');
  document.body.appendChild(a);
  requestAnimationFrame(() => a.classList.add('vue'));
  setTimeout(() => { a.classList.remove('vue'); setTimeout(() => a.remove(), 300); }, 3800);
}

const STYLE_COMMUNAUTE = `
  .chiffres{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 0}
  .chiffre{padding:16px;border-radius:12px;background:rgba(var(--trait-rgb,237,234,224),0.04);border:1px solid rgba(var(--trait-rgb,237,234,224),0.08)}
  .chiffre b{display:block;font-family:'Newsreader',serif;font-weight:500;font-size:30px;line-height:1.1}
  .chiffre span{font-size:12.5px;color:var(--text-on-ink-dim,#9B9E9C)}
  .bloc-profil{margin-top:38px}
  .bloc-profil h2{font-family:'Newsreader',serif;font-weight:500;font-size:23px;margin:0 0 4px;display:flex;align-items:baseline;gap:10px}
  .bloc-profil h2 small{font-family:'IBM Plex Sans',sans-serif;font-size:13px;color:var(--text-on-ink-dim,#9B9E9C);font-weight:400}
  .bloc-profil > p{font-size:13.5px;color:var(--text-on-ink-dim,#9B9E9C);margin:0 0 14px}
  .badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-top:10px}
  .famille-badges{font-family:'IBM Plex Sans',sans-serif;font-size:12.5px;font-weight:600;letter-spacing:.3px;
    text-transform:uppercase;color:var(--text-on-ink-dim,#9B9E9C);margin:18px 0 0}
  .famille-badges small{font-weight:400;text-transform:none;letter-spacing:0;margin-left:4px}
  .badge-collection{display:flex;gap:11px;align-items:flex-start;padding:13px;border-radius:12px;
    border:1px solid rgba(var(--gold-rgb,201,162,39),0.35);background:rgba(var(--gold-rgb,201,162,39),0.08)}
  .badge-collection b{display:block;font-size:13.5px;font-weight:600}
  .badge-collection small{display:block;font-size:11.5px;line-height:1.45;color:var(--text-on-ink-dim,#9B9E9C);margin-top:2px}
  .badge-collection.verrouille{border-color:rgba(var(--trait-rgb,237,234,224),0.10);background:transparent}
  .badge-collection.verrouille b{color:var(--text-on-ink-dim,#9B9E9C)}
  .liste-avis{list-style:none;margin:12px 0 0;padding:0}
  .un-avis{display:flex;gap:12px;padding:14px 0;border-top:1px solid rgba(var(--trait-rgb,237,234,224),0.08)}
  .un-avis .tete-avis{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px}
  .un-avis .tete-avis b{font-weight:600}
  .un-avis .date{font-size:12px;color:var(--text-on-ink-dim,#9B9E9C)}
  .un-avis p{margin:5px 0 0;font-size:14px;line-height:1.55;overflow-wrap:anywhere}
  .un-avis .signaler-avis{margin-left:auto;font:inherit;font-size:12px;background:none;border:0;cursor:pointer;
    color:var(--text-on-ink-dim,#9B9E9C);text-decoration:underline;text-underline-offset:2px;padding:4px}
  .un-avis .signaler-avis:hover{color:var(--alerte,#E08862)}
  .vide-doux{font-size:14px;color:var(--text-on-ink-dim,#9B9E9C);padding:6px 0;margin:0}
  @media(max-width:640px){ .chiffres{grid-template-columns:repeat(2,1fr)} }

  .fenetre-communaute label{display:block;margin:0;font-size:inherit;color:inherit}
  .fenetre-communaute input[type="radio"]{width:auto;min-height:0;padding:0;margin:0}
  .fenetre-communaute{border:0;padding:0;background:transparent;max-width:min(480px,calc(100vw - 32px));width:100%}
  .fenetre-communaute::backdrop{background:rgba(0,0,0,.55)}
  .fenetre-communaute .boite{background:var(--ink-soft,#20232A);color:var(--text-on-ink,#EDEAE0);border-radius:14px;
    padding:24px;border:1px solid rgba(var(--trait-rgb,237,234,224),.14);box-shadow:0 20px 50px rgba(0,0,0,.35);
    font-family:'IBM Plex Sans',sans-serif}
  .fenetre-communaute h2{font-family:'Newsreader',serif;font-weight:500;font-size:22px;margin:0 0 8px}
  .fenetre-communaute p{font-size:13.5px;line-height:1.6;color:var(--text-on-ink-dim,#9B9E9C);margin:0 0 14px}
  .fenetre-communaute .choix-note{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
  .fenetre-communaute .choix-objet{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
  .fenetre-communaute .choix-note label,.fenetre-communaute .choix-objet label{position:relative;cursor:pointer}
  .fenetre-communaute .choix-note input,.fenetre-communaute .choix-objet input{position:absolute;opacity:0;pointer-events:none}
  .fenetre-communaute .choix-note span,.fenetre-communaute .choix-objet span{display:block;padding:12px;border-radius:10px;
    border:1px solid rgba(var(--trait-rgb,237,234,224),.18);font-size:14px;text-align:center}
  .fenetre-communaute .choix-objet span{text-align:left;padding:10px 12px;font-size:13.5px}
  .fenetre-communaute input:checked + span{border-color:var(--gold,#C9A227);box-shadow:0 0 0 1px var(--gold,#C9A227);
    background:rgba(var(--gold-rgb,201,162,39),.10)}
  .fenetre-communaute input:focus-visible + span{outline:2px solid var(--gold,#C9A227);outline-offset:2px}
  .fenetre-communaute .libelle{display:block;font-size:13px;color:var(--text-on-ink-dim,#9B9E9C);margin:0 0 6px}
  .fenetre-communaute textarea{width:100%;box-sizing:border-box;resize:vertical;font:inherit;font-size:14px;
    padding:10px 12px;border-radius:8px;background:var(--ink,#15171B);color:var(--text-on-ink,#EDEAE0);
    border:1px solid rgba(var(--trait-rgb,237,234,224),.16)}
  .fenetre-communaute textarea:focus{outline:none;border-color:rgba(var(--gold-rgb,201,162,39),.6)}
  .fenetre-communaute .compteur{font-size:11.5px;margin:4px 0 0;text-align:right}
  .fenetre-communaute .boutons{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}
  .fenetre-communaute .boutons button{font:inherit;font-size:14px;padding:10px 16px;border-radius:8px;cursor:pointer;min-height:42px}
  .fenetre-communaute .annuler,.fenetre-communaute .retirer-avis{background:transparent;color:var(--text-on-ink-dim,#9B9E9C);
    border:1px solid rgba(var(--trait-rgb,237,234,224),.18)}
  .fenetre-communaute .retirer-avis{margin-right:auto}
  .fenetre-communaute .valider{background:var(--teal,#1F6F63);color:#EDF5F3;border:0}
  .fenetre-communaute .valider.danger{background:#A8431C;color:#FBEFE9}
  .fenetre-communaute .valider:disabled{opacity:.45;cursor:default}
  .annonce-communaute{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;z-index:90;
    padding:12px 18px;border-radius:10px;font-size:14px;font-family:'IBM Plex Sans',sans-serif;
    background:#1F2A28;color:#EDF5F3;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:opacity .2s,transform .2s;
    max-width:calc(100vw - 32px)}
  .annonce-communaute.ko{background:#4A2418;color:#FBEFE9}
  .annonce-communaute.vue{opacity:1;transform:translate(-50%,0)}
  .resume-avis{font-family:'IBM Plex Sans',sans-serif;font-size:12px;font-weight:500;padding:2px 8px;border-radius:999px;
    background:rgba(var(--trait-rgb,237,234,224),.07);color:var(--text-on-ink-dim,#9B9E9C);white-space:nowrap}
  a.lien-profil{color:inherit;text-decoration:none}
  a.lien-profil:hover .nom-lien,a.lien-profil:focus-visible .nom-lien{text-decoration:underline;text-underline-offset:3px}
  @media(prefers-reduced-motion:reduce){ .annonce-communaute{transition:none} }
`;

function poserStyleCommunaute(){
  if(document.getElementById('style-communaute')) return;
  document.head.appendChild(Object.assign(document.createElement('style'),
    { id: 'style-communaute', textContent: STYLE_COMMUNAUTE }));
}

poserStyleCommunaute();
