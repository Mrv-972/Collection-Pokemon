// Communauté : profils publics, badges, avis, signalements.
// =========================================================
//
// Chargé après compte.js par les pages qui montrent d'autres membres
// (profil, échanges, discussions). Tout ce qui se calcule — badges,
// nombre d'avis, droit de donner un avis — l'est par la base
// (supabase/communaute.sql) : le navigateur affiche, il ne décide pas.

// L'ordre est celui de l'affichage : du plus accessible au plus rare.
const BADGES = [
  { cle: 'premiere-carte',         icone: '🌱', nom: 'Premiers pas',          texte: 'A marqué sa première carte obtenue.' },
  { cle: 'cent-cartes',            icone: '📒', nom: 'Cent cartes',           texte: 'Possède au moins 100 cartes.' },
  { cle: 'cinq-cents-cartes',      icone: '📚', nom: 'Cinq cents cartes',     texte: 'Possède au moins 500 cartes.' },
  { cle: 'mille-cartes',           icone: '🏛️', nom: 'Mille cartes',          texte: 'Possède au moins 1 000 cartes.' },
  { cle: 'extension-complete',     icone: '🏆', nom: 'Extension complète',    texte: 'A réuni toutes les cartes d\'une extension.' },
  { cle: 'cinq-extensions',        icone: '👑', nom: 'Cinq extensions',       texte: 'A complété cinq extensions.' },
  { cle: 'genereux',               icone: '🎁', nom: 'Généreux',              texte: 'Propose au moins 20 cartes à l\'échange.' },
  { cle: 'premier-echange',        icone: '🤝', nom: 'Premier échange',       texte: 'A reçu un premier avis positif après un échange.' },
  { cle: 'echangeur-de-confiance', icone: '⭐', nom: 'Échangeur de confiance', texte: 'Au moins 5 avis positifs, et quatre fois plus de positifs que de négatifs.' },
  { cle: 'un-an',                  icone: '🎂', nom: 'Un an parmi nous',      texte: 'Inscrit depuis plus d\'un an.' },
  { cle: 'pionnier',               icone: '🚀', nom: 'Pionnier',              texte: 'Parmi les cent premiers inscrits.' },
];

const lienProfil = id => `profil.html?membre=${encodeURIComponent(id)}`;

const echapperCommun = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Une fonction absente de la base (script pas encore exécuté) répond par
// ces codes : la page le dit, plutôt qu'une erreur technique.
const fonctionAbsente = err => ['PGRST202', '42883', 'PGRST204', '42P01', 'PGRST205'].includes(err?.code);

async function appeler(fonction, args){
  const db = await clientSupabase();
  const { data, error } = await db.rpc(fonction, args);
  if(error) throw error;
  return data;
}

async function profilPublic(id){ return (await appeler('profil_public', { membre: id }))?.[0] ?? null; }
async function badgesDe(id){ return new Set((await appeler('badges_de', { membre: id }) ?? []).map(l => l.badge)); }
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
    // La règle de la base : un avis suppose d'avoir échangé des messages.
    if(error.code === '42501') throw new Error("Tu pourras donner un avis après avoir échangé des messages avec ce membre.");
    throw error;
  }
}

async function retirerAvis(id){
  const db = await clientSupabase();
  const { error } = await db.from('avis').delete().eq('auteur_id', membre.id).eq('destinataire_id', id);
  if(error) throw error;
}

// Le résumé des avis de plusieurs membres d'un coup, pour les listes.
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
  }catch{ /* pas d'avis affichés */ }
  return resumes;
}

function resumeAvisHtml(r){
  if(!r || (!r.positifs && !r.negatifs)) return '';
  return `<span class="resume-avis" title="Avis reçus après des échanges">👍 ${r.positifs}${r.negatifs ? ` · 👎 ${r.negatifs}` : ''}</span>`;
}

async function signalerContenu({ membreId, objet, motif, messageId = null }){
  const db = await clientSupabase();
  const { error } = await db.from('signalements').insert({
    signaleur_id: membre.id, signale_id: membreId, objet,
    message_id: messageId, motif: motif.trim(),
  });
  if(error) throw error;
}

// --------------------------------------------------------- fenêtres ------
//
// Une fenêtre au-dessus de la page, fermée par Échap, par le bouton
// Annuler ou par un clic à côté. « remplir » reçoit la boîte et renvoie la
// fonction qui lit la réponse (null tant qu'elle n'est pas valable).

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

// Un avis : pouce levé ou baissé, et un mot facultatif.
function demanderAvis(pseudo, actuel = null){
  return ouvrirFenetre({
    titre: actuel ? `Modifier ton avis sur ${pseudo}` : `Ton avis sur ${pseudo}`,
    action: actuel ? 'Enregistrer' : 'Publier mon avis',
    extra: actuel ? '<button type="button" class="retirer-avis" data-retirer>Retirer mon avis</button>' : '',
    corps: `
      <p>Comment s'est passé votre échange ? Ton avis sera visible des autres membres sur son profil.</p>
      <div class="choix-note" role="radiogroup" aria-label="Ton avis">
        <label><input type="radio" name="note" value="positif" ${actuel?.note === 'positif' ? 'checked' : ''}>
          <span>👍 Bien passé</span></label>
        <label><input type="radio" name="note" value="negatif" ${actuel?.note === 'negatif' ? 'checked' : ''}>
          <span>👎 Mal passé</span></label>
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

// Un signalement : ce qui pose problème, et pourquoi.
function demanderSignalement(pseudo, { photo = false, objet = null } = {}){
  const choix = objet ? [] : [
    ['profil', 'Son comportement (arnaque, harcèlement, insultes…)'],
    ...(photo ? [['photo', 'Sa photo de profil']] : []),
    ['pseudo', 'Son pseudo'],
  ];
  return ouvrirFenetre({
    titre: objet === 'avis' ? `Signaler l'avis de ${pseudo}` : `Signaler ${pseudo}`,
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

// Une courte annonce en bas de l'écran, qui s'efface d'elle-même.
function annoncer(texte, type = 'ok'){
  poserStyleCommunaute();
  const a = Object.assign(document.createElement('div'), { className: `annonce-communaute ${type}`, textContent: texte });
  a.setAttribute('role', 'status');
  document.body.appendChild(a);
  requestAnimationFrame(() => a.classList.add('vue'));
  setTimeout(() => { a.classList.remove('vue'); setTimeout(() => a.remove(), 300); }, 3800);
}

const STYLE_COMMUNAUTE = `
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
