// L'onglet Communauté.
// ====================
//
// Une seule page (communaute.html), plusieurs rubriques, choisies par
// l'adresse — « ?r=questions », « ?sujet=12 » — pour que chaque vue se
// partage par un lien :
//
//   accueil        un aperçu de tout le reste ;
//   questions      questions et réponses entre membres ;
//   ameliorations  les idées pour le site, que les membres soutiennent et
//                  dont l'administrateur suit l'avancement ;
//   forums         des discussions libres, rangées par catégorie ;
//   savoir         « Le saviez-vous ? » ;
//   noms           l'origine du nom de chaque Pokémon ;
//   actualites     les dernières actualités Pokémon, et les sites à suivre.
//
// Les trois premières vivent dans la base (supabase/espace-communaute.sql) :
// tout le monde lit, les membres écrivent. Les trois dernières sont des
// fichiers du site (donnees/…), tenus à jour par des tâches automatiques.
//
// Rien de ce qu'un membre écrit n'est inséré tel quel dans la page : tout
// passe par echapperCommun() (communaute.js).

(() => {

const RUBRIQUES = [
  { cle: 'accueil',       nom: 'Accueil',          icone: '🏠' },
  { cle: 'questions',     nom: 'Questions',        icone: '❓' },
  { cle: 'ameliorations', nom: 'Améliorations',    icone: '💡' },
  { cle: 'forums',        nom: 'Forums',           icone: '💬' },
  { cle: 'savoir',        nom: 'Le saviez-vous ?', icone: '✨' },
  { cle: 'noms',          nom: 'Noms des Pokémon', icone: '🔤' },
  { cle: 'actualites',    nom: 'Actualités',       icone: '📰' },
];

const ESPACES = {
  questions: {
    espace: 'question', titre: 'Questions / Réponses', mot: 'question', nouveau: 'Poser une question',
    intro: "Une carte que tu n'arrives pas à identifier, une règle de TCG Pocket, une question sur le site ? Pose-la : les autres membres y répondent, et tu choisis la réponse qui t'a aidé.",
    vote: '🙋 Moi aussi', aideVote: 'Tu te poses la même question',
    aideCorps: "Donne le plus de détails possible : le nom de la carte, l'extension, ce que tu as déjà essayé…",
  },
  ameliorations: {
    espace: 'amelioration', titre: 'Idées d\'amélioration', mot: 'idée', nouveau: 'Proposer une idée',
    intro: "Une fonctionnalité qui te manque, quelque chose à améliorer sur le site ? Propose-la, et soutiens les idées des autres : les plus soutenues passent en premier.",
    vote: '👍 Je soutiens', aideVote: 'Tu aimerais voir cette idée sur le site',
    aideCorps: "Une idée par proposition. Explique ce que tu voudrais pouvoir faire, et pourquoi.",
  },
  forums: {
    espace: 'forum', titre: 'Forums', mot: 'sujet', nouveau: 'Ouvrir un sujet',
    intro: "Discute avec les autres collectionneurs : decks, extensions, belles trouvailles, conseils d'échange…",
    aideCorps: 'Lance la discussion : présente ton sujet en quelques lignes.',
  },
};

const CATEGORIES = [
  { cle: 'general',    icone: '💬', nom: 'Discussion générale',  texte: 'Tout ce qui touche à Pokémon et au site.' },
  { cle: 'pocket',     icone: '📱', nom: 'TCG Pocket',           texte: 'Decks, boosters, missions et événements de l\'application.' },
  { cle: 'physique',   icone: '🃏', nom: 'Cartes physiques',     texte: 'Extensions, raretés, conservation, gradation.' },
  { cle: 'echanges',   icone: '🤝', nom: 'Échanges et conseils', texte: 'Bien échanger, estimer une carte, éviter les arnaques.' },
  { cle: 'collection', icone: '🏆', nom: 'Montre ta collection', texte: 'Tes plus belles pièces, tes classeurs, tes objectifs.' },
  { cle: 'detente',    icone: '🎮', nom: 'Détente',              texte: 'Présentations, jeux vidéo, dessin animé, hors-sujet.' },
];
const categorie = cle => CATEGORIES.find(c => c.cle === cle);

const STATUTS = {
  proposee: { nom: 'Proposée',  classe: 'proposee' },
  etudiee:  { nom: 'À l\'étude', classe: 'etudiee' },
  prevue:   { nom: 'Prévue',    classe: 'prevue' },
  faite:    { nom: 'Réalisée',  classe: 'faite' },
  refusee:  { nom: 'Écartée',   classe: 'refusee' },
};

const GENERATIONS = [[1, 151], [152, 251], [252, 386], [387, 493], [494, 649], [650, 721], [722, 809], [810, 905], [906, 1025]];
const artwork = n => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`;

const zone = document.getElementById('communaute');
const esc = v => echapperCommun(v);
let jeSuisAdmin = false;
let tour = 0;            // chaque affichage a son numéro : une réponse tardive d'un affichage abandonné est ignorée

// ------------------------------------------------------------- adresse --

const parametres = () => Object.fromEntries(new URLSearchParams(location.search));

function lien(params){
  const u = new URLSearchParams();
  for(const [k, v] of Object.entries(params)) if(v !== undefined && v !== null && v !== '') u.set(k, v);
  const univers = new URLSearchParams(location.search).get('u');
  if(univers) u.set('u', univers);
  const q = u.toString();
  return `communaute.html${q ? '?' + q : ''}`;
}

function aller(href, { remplacer = false } = {}){
  const url = new URL(href, location.href);
  history[remplacer ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search);
  afficher();
  window.scrollTo({ top: 0 });
}

// Les liens internes changent de vue sans recharger la page.
zone.addEventListener('click', e => {
  const a = e.target.closest('a[data-interne]');
  if(!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  aller(a.getAttribute('href'));
});
window.addEventListener('popstate', afficher);

// ------------------------------------------------------------ outils ----

function texteRiche(t){
  // Échappé d'abord ; les adresses deviennent ensuite des liens, ouverts
  // ailleurs et marqués comme venant d'un membre (« ugc »).
  return esc(t).replace(/https?:\/\/[^\s<]+/g, url => {
    const fin = (url.match(/[.,;:!?)\]]+$/) ?? [''])[0];
    const propre = url.slice(0, url.length - fin.length);
    return `<a href="${propre}" target="_blank" rel="nofollow ugc noopener">${propre}</a>${fin}`;
  });
}
const gras = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
function depuis(date){
  const s = (Date.now() - new Date(date).getTime()) / 1000;
  if(s < 60) return 'à l\'instant';
  if(s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if(s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if(s < 172800) return 'hier';
  if(s < 604800) return `il y a ${Math.floor(s / 86400)} jours`;
  return `le ${FORMAT_DATE.format(new Date(date))}`;
}

function auteur(x, taille = 24){
  if(!x.pseudo) return '<span class="auteur ancien">Ancien membre</span>';
  return `<a class="lien-profil auteur" href="${lienProfil(x.auteur_id)}">${avatarHtml(x, taille)}<span class="nom-lien">${esc(x.pseudo)}</span></a>`;
}

const nb = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

async function rpc(nom, args){
  const db = await clientSupabase();
  const { data, error } = await db.rpc(nom, args);
  if(error) throw error;
  return data;
}

function erreurHtml(err){
  if(CONFIG_MANQUANTE) return '<p class="etat">Le site n\'est pas encore relié à sa base.</p>';
  if(typeof fonctionAbsente === 'function' && fonctionAbsente(err))
    return `<p class="etat">Cet espace ouvrira dès que la base aura été mise à jour (fichier <b>supabase/espace-communaute.sql</b>).</p>`;
  return `<p class="etat erreur">Le chargement a échoué : ${esc(err?.message ?? err)}</p>`;
}

const fichiers = new Map();
function lireFichier(nom){
  if(!fichiers.has(nom)) fichiers.set(nom, fetch(`donnees/${nom}`, { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null).catch(() => null));
  return fichiers.get(nom);
}

async function confirmer(titre, message, action){
  if(typeof demanderConfirmation === 'function') return demanderConfirmation({ titre, message, action, danger: true });
  return confirm(`${titre}\n\n${message}`);
}

const exigerMembre = action => {
  if(estConnecte() && profil) return true;
  annoncer(`Connecte-toi pour ${action}.`, 'ko');
  return false;
};

// ------------------------------------------------------- squelette ------

function afficher(){
  const p = parametres();
  const rubrique = p.sujet ? (p.depuis ?? 'accueil') : (RUBRIQUES.some(r => r.cle === p.r) ? p.r : 'accueil');
  document.querySelectorAll('.sous-onglets a').forEach(a =>
    a.setAttribute('aria-current', String(a.dataset.rubrique === rubrique && !p.sujet)));
  const vue = document.getElementById('vue');
  const numero = ++tour;
  const encore = () => numero === tour;
  vue.innerHTML = '<p class="etat">Chargement…</p>';
  const titre = RUBRIQUES.find(r => r.cle === rubrique)?.nom;
  document.title = `${rubrique === 'accueil' ? 'Communauté' : titre + ' — Communauté'} — PokéClasseur`;
  if(p.sujet) return afficherFil(vue, Number(p.sujet), encore);
  ({
    accueil: afficherAccueil, questions: afficherListe, ameliorations: afficherListe, forums: afficherForums,
    savoir: afficherSavoir, noms: afficherNoms, actualites: afficherActualites,
  })[rubrique](vue, encore, rubrique, p);
}

function poserSquelette(){
  zone.innerHTML = `
    <nav class="sous-onglets" aria-label="Rubriques de la communauté">
      ${RUBRIQUES.map(r => `<a href="${lien(r.cle === 'accueil' ? {} : { r: r.cle })}" data-interne data-rubrique="${r.cle}">
        <span aria-hidden="true">${r.icone}</span>${r.nom}</a>`).join('')}
    </nav>
    <div id="vue"></div>`;
}

// ------------------------------------------------------- les listes -----

function ligneSujet(s, { categorieVisible = false } = {}){
  const resolue = s.espace === 'question' && s.resolue;
  const compteur = s.espace === 'amelioration'
    ? `<span class="compteur votes ${s.a_vote ? 'actif' : ''}"><b>${s.nb_votes}</b>${s.nb_votes > 1 ? 'soutiens' : 'soutien'}</span>`
    : `<span class="compteur ${resolue ? 'resolue' : ''}"><b>${s.nb_reponses}</b>${s.nb_reponses > 1 ? 'réponses' : 'réponse'}</span>`;
  const cat = categorieVisible && s.categorie ? categorie(s.categorie) : null;
  return `
    <li class="sujet-ligne ${s.epingle ? 'epingle' : ''}">
      ${compteur}
      <div class="corps-ligne">
        <a class="titre-sujet" href="${lien({ sujet: s.id, depuis: parametres().r ?? 'accueil' })}" data-interne>
          ${s.epingle ? '<span class="pastille-epingle" title="Épinglé">📌</span>' : ''}${esc(s.titre)}</a>
        <span class="etiquettes">
          ${resolue ? '<span class="etiquette resolue">✓ Résolue</span>' : ''}
          ${s.statut ? `<span class="etiquette statut ${STATUTS[s.statut]?.classe}">${STATUTS[s.statut]?.nom}</span>` : ''}
          ${s.verrouille ? '<span class="etiquette" title="Verrouillé">🔒</span>' : ''}
          ${cat ? `<span class="etiquette">${cat.icone} ${cat.nom}</span>` : ''}
        </span>
        <p class="extrait">${esc(s.extrait)}${s.extrait?.length >= 220 ? '…' : ''}</p>
        <div class="meta">${auteur(s, 20)} · ${depuis(s.cree_le)}${s.nb_reponses ? ` · dernière activité ${depuis(s.activite_le)}` : ''}</div>
      </div>
    </li>`;
}

async function afficherListe(vue, encore, rubrique, p){
  const def = ESPACES[rubrique];
  const filtres = rubrique === 'questions'
    ? [['', 'Toutes'], ['sans-reponse', 'Sans réponse'], ['resolues', 'Résolues'], ...(estConnecte() ? [['miens', 'Mes questions']] : [])]
    : [['', 'Toutes'], ...Object.entries(STATUTS).map(([k, s]) => [k, s.nom]), ...(estConnecte() ? [['miens', 'Mes idées']] : [])];
  const tri = rubrique === 'ameliorations' ? (p.tri ?? 'votes') : 'activite';
  vue.innerHTML = `
    <header class="tete-rubrique">
      <div><h1>${def.titre}</h1><p>${def.intro}</p></div>
      <button type="button" class="bouton-principal" id="nouveau-sujet">${def.nouveau}</button>
    </header>
    <div class="barre-filtres">
      <div class="chips">${filtres.map(([v, n]) => `<a class="chip ${v === (p.filtre ?? '') ? 'on' : ''}"
        href="${lien({ r: rubrique, filtre: v, tri: p.tri })}" data-interne>${n}</a>`).join('')}</div>
      ${rubrique === 'ameliorations' ? `<div class="chips tri">
        <a class="chip ${tri === 'votes' ? 'on' : ''}" href="${lien({ r: rubrique, filtre: p.filtre })}" data-interne>Les plus soutenues</a>
        <a class="chip ${tri === 'recents' ? 'on' : ''}" href="${lien({ r: rubrique, filtre: p.filtre, tri: 'recents' })}" data-interne>Les plus récentes</a></div>` : ''}
    </div>
    <ul class="liste-sujets" id="liste-sujets"><li class="etat">Chargement…</li></ul>
    <div class="suite" id="suite"></div>`;
  document.getElementById('nouveau-sujet').onclick = () => nouveauSujet(def);
  await remplirListe({ espace: def.espace, tri, filtre: p.filtre || null, encore, vide: rubrique === 'questions'
    ? 'Aucune question pour l\'instant. Lance-toi : la première est souvent la plus attendue !'
    : 'Aucune idée pour l\'instant. Propose la première !' });
}

async function remplirListe({ espace, categorie: cat = null, tri = 'activite', filtre = null, encore, vide, categorieVisible = false }){
  const liste = document.getElementById('liste-sujets');
  const suite = document.getElementById('suite');
  const PAGE = 30;
  let decalage = 0;
  const charger = async () => {
    let lignes;
    try{ lignes = await rpc('liste_sujets', { p_espace: espace, p_categorie: cat, p_tri: tri, p_filtre: filtre, p_limite: PAGE, p_decalage: decalage }); }
    catch(err){ if(encore()) liste.outerHTML = erreurHtml(err); return; }
    if(!encore()) return;
    if(decalage === 0) liste.innerHTML = lignes.length ? '' : `<li class="etat vide">${vide}</li>`;
    liste.insertAdjacentHTML('beforeend', lignes.map(s => ligneSujet(s, { categorieVisible })).join(''));
    decalage += lignes.length;
    suite.innerHTML = lignes.length === PAGE ? '<button type="button" class="bouton-discret">Voir plus</button>' : '';
    suite.querySelector('button')?.addEventListener('click', charger);
  };
  await charger();
}

async function afficherForums(vue, encore, rubrique, p){
  const def = ESPACES.forums;
  const cat = categorie(p.categorie);
  if(!cat){
    vue.innerHTML = `
      <header class="tete-rubrique">
        <div><h1>${def.titre}</h1><p>${def.intro}</p></div>
        <button type="button" class="bouton-principal" id="nouveau-sujet">${def.nouveau}</button>
      </header>
      <div class="categories" id="categories">${CATEGORIES.map(c => `
        <a class="categorie" href="${lien({ r: 'forums', categorie: c.cle })}" data-interne data-cat="${c.cle}">
          <span class="icone" aria-hidden="true">${c.icone}</span>
          <span><b>${c.nom}</b><small>${c.texte}</small><em class="compte"></em></span>
        </a>`).join('')}</div>
      <h2 class="sous-titre">Discussions récentes</h2>
      <ul class="liste-sujets" id="liste-sujets"><li class="etat">Chargement…</li></ul>
      <div class="suite" id="suite"></div>`;
    document.getElementById('nouveau-sujet').onclick = () => nouveauSujet(def);
    rpc('categories_forum').then(lignes => {
      if(!encore()) return;
      for(const l of lignes ?? []){
        const el = vue.querySelector(`[data-cat="${l.categorie}"] .compte`);
        if(el) el.textContent = `${nb(l.nb_sujets, 'sujet', 'sujets')} · ${depuis(l.derniere_activite)}`;
      }
    }).catch(() => {});
    await remplirListe({ espace: 'forum', encore, categorieVisible: true,
      vide: 'Aucune discussion pour l\'instant. Ouvre le premier sujet !' });
    return;
  }
  vue.innerHTML = `
    <a class="retour" href="${lien({ r: 'forums' })}" data-interne>← Tous les forums</a>
    <header class="tete-rubrique">
      <div><h1><span aria-hidden="true">${cat.icone}</span> ${cat.nom}</h1><p>${cat.texte}</p></div>
      <button type="button" class="bouton-principal" id="nouveau-sujet">${def.nouveau}</button>
    </header>
    <ul class="liste-sujets" id="liste-sujets"><li class="etat">Chargement…</li></ul>
    <div class="suite" id="suite"></div>`;
  document.getElementById('nouveau-sujet').onclick = () => nouveauSujet(def, cat.cle);
  await remplirListe({ espace: 'forum', categorie: cat.cle, encore,
    vide: 'Aucun sujet dans cette catégorie pour l\'instant. Ouvre le premier !' });
}

// ------------------------------------------------- écrire un sujet ------

function nouveauSujet(def, categorieChoisie = null){
  if(!exigerMembre(`publier dans la communauté`)) return;
  ouvrirFenetre({
    titre: def.nouveau,
    action: 'Publier',
    corps: `
      <label class="libelle" for="titre-sujet">Titre</label>
      <input id="titre-sujet" class="champ" type="text" maxlength="120" placeholder="${def.espace === 'question' ? 'Ta question en une phrase' : def.espace === 'amelioration' ? 'Ton idée en une phrase' : 'Le sujet de la discussion'}">
      ${def.espace === 'forum' ? `
        <label class="libelle" for="categorie-sujet">Catégorie</label>
        <select id="categorie-sujet" class="champ">${CATEGORIES.map(c =>
          `<option value="${c.cle}" ${c.cle === (categorieChoisie ?? 'general') ? 'selected' : ''}>${c.icone} ${c.nom}</option>`).join('')}</select>` : ''}
      <label class="libelle" for="corps-sujet">Message</label>
      <textarea id="corps-sujet" maxlength="5000" rows="7" placeholder="${esc(def.aideCorps)}"></textarea>
      <p class="compteur-texte">Sois courtois : les messages sont visibles de tous, et peuvent être signalés.</p>`,
    remplir(f, maj){
      const titre = f.querySelector('#titre-sujet'), corps = f.querySelector('#corps-sujet');
      [titre, corps].forEach(c => c.addEventListener('input', maj));
      return () => titre.value.trim().length >= 3 && corps.value.trim().length >= 1
        ? { titre: titre.value.trim(), corps: corps.value.trim(), categorie: f.querySelector('#categorie-sujet')?.value ?? null }
        : null;
    },
  }).then(async r => {
    if(!r) return;
    try{
      const db = await clientSupabase();
      const { data, error } = await db.from('sujets')
        .insert({ espace: def.espace, categorie: def.espace === 'forum' ? r.categorie : null, titre: r.titre, corps: r.corps })
        .select('id').single();
      if(error) throw error;
      annoncer('C\'est publié !');
      aller(lien({ sujet: data.id, depuis: parametres().r ?? 'accueil' }));
    }catch(err){ annoncer(err.message, 'ko'); }
  });
}

// ------------------------------------------------------- un fil ---------

async function afficherFil(vue, id, encore){
  let fil;
  try{ fil = await rpc('fil_sujet', { p_sujet: id }); }
  catch(err){ if(encore()) vue.innerHTML = erreurHtml(err); return; }
  if(!encore()) return;
  if(!fil){
    vue.innerHTML = `<p class="etat">Ce sujet n'existe plus : il a peut-être été retiré par son auteur.</p>
      <p><a class="retour" href="${lien({})}" data-interne>← Retour à la communauté</a></p>`;
    return;
  }
  const s = fil.sujet, reponses = fil.reponses ?? [];
  const def = Object.values(ESPACES).find(d => d.espace === s.espace);
  const rubrique = Object.keys(ESPACES).find(k => ESPACES[k].espace === s.espace);
  const moi = estConnecte() && membre.id === s.auteur_id;
  const cat = categorie(s.categorie);
  document.title = `${s.titre} — Communauté — PokéClasseur`;

  // La meilleure réponse remonte en tête, juste sous la question.
  const ordonnees = s.reponse_acceptee
    ? [...reponses.filter(r => r.id === s.reponse_acceptee), ...reponses.filter(r => r.id !== s.reponse_acceptee)]
    : reponses;

  const retour = cat ? lien({ r: 'forums', categorie: cat.cle }) : lien({ r: rubrique });
  vue.innerHTML = `
    <a class="retour" href="${retour}" data-interne>← ${cat ? cat.nom : def.titre}</a>
    <article class="sujet-complet" id="sujet">
      <header>
        <div class="etiquettes">
          <span class="etiquette espace">${cat ? `${cat.icone} ${cat.nom}` : s.espace === 'question' ? '❓ Question' : '💡 Idée'}</span>
          ${s.statut ? `<span class="etiquette statut ${STATUTS[s.statut]?.classe}">${STATUTS[s.statut]?.nom}</span>` : ''}
          ${s.reponse_acceptee ? '<span class="etiquette resolue">✓ Résolue</span>' : ''}
          ${s.epingle ? '<span class="etiquette">📌 Épinglé</span>' : ''}
          ${s.verrouille ? '<span class="etiquette">🔒 Verrouillé</span>' : ''}
        </div>
        <h1 id="titre-fil">${esc(s.titre)}</h1>
        <div class="meta">${auteur(s, 28)} · ${depuis(s.cree_le)}${s.modifie_le ? ' · modifié' : ''}</div>
      </header>
      <div class="texte" id="texte-sujet">${texteRiche(s.corps)}</div>
      <div class="actions-message">
        ${def.vote ? `<button type="button" class="vote ${s.a_vote ? 'actif' : ''}" id="vote" aria-pressed="${s.a_vote}" title="${def.aideVote}">
          ${def.vote} <b>${s.nb_votes}</b></button>` : ''}
        ${moi && !s.verrouille ? '<button type="button" class="petit" id="modifier-sujet">Modifier</button>' : ''}
        ${moi || jeSuisAdmin ? '<button type="button" class="petit danger" id="supprimer-sujet">Supprimer</button>' : ''}
        ${!moi && estConnecte() ? '<button type="button" class="petit discret" id="signaler-sujet">Signaler</button>' : ''}
      </div>
      ${jeSuisAdmin ? `
        <div class="moderation" aria-label="Modération">
          <span class="insigne-admin">◆ Modération</span>
          <button type="button" class="petit" id="epingler">${s.epingle ? 'Désépingler' : 'Épingler'}</button>
          <button type="button" class="petit" id="verrouiller">${s.verrouille ? 'Déverrouiller' : 'Verrouiller'}</button>
          ${s.espace === 'amelioration' ? `<label class="statut-choix">Avancement
            <select id="statut">${Object.entries(STATUTS).map(([k, v]) =>
              `<option value="${k}" ${k === s.statut ? 'selected' : ''}>${v.nom}</option>`).join('')}</select></label>` : ''}
        </div>` : ''}
    </article>

    <section class="bloc-reponses" aria-labelledby="titre-reponses">
      <h2 id="titre-reponses">${reponses.length ? nb(reponses.length, 'réponse', 'réponses') : 'Aucune réponse pour l\'instant'}</h2>
      ${ordonnees.map(r => reponseHtml(r, s)).join('')}
    </section>

    <section class="repondre" id="repondre">
      ${s.verrouille ? '<p class="etat">🔒 Ce sujet est verrouillé : il ne reçoit plus de réponse.</p>'
        : !estConnecte() ? `<p class="etat"><a href="connexion.html">Connecte-toi</a> pour répondre.</p>`
        : `<label class="libelle" for="texte-reponse">Ta réponse</label>
           <textarea id="texte-reponse" maxlength="5000" rows="5" placeholder="Écris ta réponse…"></textarea>
           <div class="ligne-envoi"><span class="compteur-texte" id="reste-reponse"></span>
             <button type="button" class="bouton-principal" id="publier-reponse" disabled>Publier ma réponse</button></div>`}
    </section>`;
  brancherFil(vue, s, reponses, def);
}

function reponseHtml(r, s){
  const moi = estConnecte() && membre.id === r.auteur_id;
  const auteurQuestion = estConnecte() && membre.id === s.auteur_id && s.espace === 'question';
  const acceptee = r.id === s.reponse_acceptee;
  return `
    <article class="reponse ${acceptee ? 'acceptee' : ''}" data-reponse="${r.id}">
      ${acceptee ? '<p class="mention-acceptee">✓ Meilleure réponse, choisie par l\'auteur de la question</p>' : ''}
      <div class="meta">${auteur(r, 24)} · ${depuis(r.cree_le)}${r.modifie_le ? ' · modifiée' : ''}</div>
      <div class="texte">${texteRiche(r.corps)}</div>
      <div class="actions-message">
        ${auteurQuestion ? `<button type="button" class="petit ${acceptee ? 'actif' : ''}" data-accepter="${r.id}">
          ${acceptee ? 'Retirer « meilleure réponse »' : '✓ C\'est la meilleure réponse'}</button>` : ''}
        ${moi ? `<button type="button" class="petit" data-modifier="${r.id}">Modifier</button>` : ''}
        ${moi || jeSuisAdmin ? `<button type="button" class="petit danger" data-supprimer="${r.id}">Supprimer</button>` : ''}
        ${!moi && estConnecte() && r.pseudo ? `<button type="button" class="petit discret" data-signaler="${r.id}">Signaler</button>` : ''}
      </div>
    </article>`;
}

function brancherFil(vue, s, reponses, def){
  const recharger = () => afficher();
  const sur = (sel, fn) => vue.querySelector(sel)?.addEventListener('click', fn);
  const essayer = async (fn, reussite) => {
    try{ await fn(); if(reussite) annoncer(reussite); recharger(); }
    catch(err){ annoncer(err.message, 'ko'); }
  };
  const db = () => clientSupabase();

  sur('#vote', () => {
    if(!exigerMembre('soutenir')) return;
    essayer(async () => {
      const d = await db();
      const { error } = s.a_vote
        ? await d.from('votes').delete().eq('sujet_id', s.id).eq('membre_id', membre.id)
        : await d.from('votes').insert({ sujet_id: s.id });
      if(error) throw error;
    });
  });

  sur('#modifier-sujet', () => modifierEnPlace({
    conteneur: vue.querySelector('#sujet'), titre: s.titre, corps: s.corps,
    enregistrer: async ({ titre, corps }) => {
      const { error } = await (await db()).from('sujets').update({ titre, corps }).eq('id', s.id);
      if(error) throw error;
    }, recharger,
  }));
  sur('#supprimer-sujet', async () => {
    if(!await confirmer('Supprimer ce sujet ?', `« ${esc(s.titre)} » et ${nb(reponses.length, 'sa réponse', 'ses réponses')} seront effacés définitivement.`, 'Supprimer')) return;
    try{
      const { error } = await (await db()).from('sujets').delete().eq('id', s.id);
      if(error) throw error;
      annoncer('Sujet supprimé.');
      const rubrique = Object.keys(ESPACES).find(k => ESPACES[k].espace === s.espace);
      aller(s.categorie ? lien({ r: 'forums', categorie: s.categorie }) : lien({ r: rubrique }), { remplacer: true });
    }catch(err){ annoncer(err.message, 'ko'); }
  });
  sur('#signaler-sujet', async () => {
    const r = await demanderSignalement(s.pseudo ?? 'ce membre', { objet: 'sujet' });
    if(r) essayer(() => signalerContenu({ membreId: s.auteur_id, objet: 'sujet', motif: r.motif, sujetId: s.id }),
      'Signalement envoyé. Merci : l\'administrateur va l\'examiner.');
  });

  sur('#epingler', () => essayer(() => rpc('moderer_sujet', { p_sujet: s.id, p_epingle: !s.epingle })));
  sur('#verrouiller', () => essayer(() => rpc('moderer_sujet', { p_sujet: s.id, p_verrouille: !s.verrouille })));
  vue.querySelector('#statut')?.addEventListener('change', e =>
    essayer(() => rpc('moderer_sujet', { p_sujet: s.id, p_statut: e.target.value }), 'Avancement mis à jour.'));

  vue.querySelectorAll('[data-accepter]').forEach(b => b.addEventListener('click', () => {
    const id = Number(b.dataset.accepter);
    essayer(() => rpc('accepter_reponse', { p_sujet: s.id, p_reponse: id === s.reponse_acceptee ? null : id }));
  }));
  vue.querySelectorAll('[data-modifier]').forEach(b => b.addEventListener('click', () => {
    const r = reponses.find(x => x.id === Number(b.dataset.modifier));
    modifierEnPlace({
      conteneur: b.closest('.reponse'), corps: r.corps,
      enregistrer: async ({ corps }) => {
        const { error } = await (await db()).from('reponses').update({ corps }).eq('id', r.id);
        if(error) throw error;
      }, recharger,
    });
  }));
  vue.querySelectorAll('[data-supprimer]').forEach(b => b.addEventListener('click', async () => {
    if(!await confirmer('Supprimer cette réponse ?', 'Elle sera effacée définitivement.', 'Supprimer')) return;
    essayer(async () => {
      const { error } = await (await db()).from('reponses').delete().eq('id', Number(b.dataset.supprimer));
      if(error) throw error;
    }, 'Réponse supprimée.');
  }));
  vue.querySelectorAll('[data-signaler]').forEach(b => b.addEventListener('click', async () => {
    const r = reponses.find(x => x.id === Number(b.dataset.signaler));
    const rep = await demanderSignalement(r.pseudo, { objet: 'reponse' });
    if(rep) essayer(() => signalerContenu({ membreId: r.auteur_id, objet: 'reponse', motif: rep.motif, reponseId: r.id }),
      'Signalement envoyé. Merci : l\'administrateur va l\'examiner.');
  }));

  const zoneTexte = vue.querySelector('#texte-reponse');
  if(zoneTexte){
    const bouton = vue.querySelector('#publier-reponse'), reste = vue.querySelector('#reste-reponse');
    zoneTexte.addEventListener('input', () => {
      bouton.disabled = !zoneTexte.value.trim();
      reste.textContent = zoneTexte.value.length > 4500 ? `${5000 - zoneTexte.value.length} caractères restants` : '';
    });
    bouton.addEventListener('click', async () => {
      if(!exigerMembre('répondre')) return;
      bouton.disabled = true;
      try{
        const { error } = await (await db()).from('reponses').insert({ sujet_id: s.id, corps: zoneTexte.value.trim() });
        if(error) throw error;
        annoncer('Réponse publiée.');
        await recharger();
        requestAnimationFrame(() => document.querySelector('.reponse:last-of-type')?.scrollIntoView({ block: 'center' }));
      }catch(err){ annoncer(err.message, 'ko'); bouton.disabled = false; }
    });
  }
}

// Modifier un message sur place : le texte devient un champ.
function modifierEnPlace({ conteneur, titre = null, corps, enregistrer, recharger }){
  const texte = conteneur.querySelector('.texte');
  const actions = conteneur.querySelector('.actions-message');
  const formulaire = document.createElement('div');
  formulaire.className = 'edition';
  formulaire.innerHTML = `
    ${titre !== null ? `<input class="champ" type="text" maxlength="120" value="${esc(titre)}" aria-label="Titre">` : ''}
    <textarea maxlength="5000" rows="6" aria-label="Message">${esc(corps)}</textarea>
    <div class="ligne-envoi"><button type="button" class="bouton-discret annuler">Annuler</button>
      <button type="button" class="bouton-principal enregistrer">Enregistrer</button></div>`;
  texte.hidden = true; actions.hidden = true;
  texte.after(formulaire);
  formulaire.querySelector('textarea').focus();
  formulaire.querySelector('.annuler').onclick = () => { formulaire.remove(); texte.hidden = false; actions.hidden = false; };
  formulaire.querySelector('.enregistrer').onclick = async () => {
    const nouveauTitre = formulaire.querySelector('input')?.value.trim();
    const nouveauCorps = formulaire.querySelector('textarea').value.trim();
    if(!nouveauCorps || (titre !== null && nouveauTitre.length < 3)) return annoncer('Le message ne peut pas être vide.', 'ko');
    try{ await enregistrer({ titre: nouveauTitre, corps: nouveauCorps }); annoncer('Modification enregistrée.'); recharger(); }
    catch(err){ annoncer(err.message, 'ko'); }
  };
}

// ------------------------------------------------------- accueil --------

async function afficherAccueil(vue, encore){
  vue.innerHTML = `
    <section class="bienvenue">
      <h1>La communauté PokéClasseur</h1>
      <p>Pose tes questions, propose tes idées pour le site, discute avec d'autres collectionneurs, et découvre
         l'origine du nom de chaque Pokémon.</p>
      ${estConnecte() ? '' : '<a class="bouton-principal" href="connexion.html">Rejoindre la communauté</a>'}
    </section>
    <div id="savoir-du-jour"></div>
    <div class="accueil-grille">
      ${['questions', 'ameliorations', 'forums'].map(r => `
        <section class="bloc-accueil">
          <h2><a href="${lien({ r })}" data-interne>${RUBRIQUES.find(x => x.cle === r).icone} ${
            r === 'questions' ? 'Dernières questions' : r === 'ameliorations' ? 'Idées les plus soutenues' : 'Discussions récentes'}</a></h2>
          <ul class="liste-mini" id="mini-${r}"><li class="etat">Chargement…</li></ul>
          <a class="voir-tout" href="${lien({ r })}" data-interne>${
            r === 'questions' ? 'Toutes les questions' : r === 'ameliorations' ? 'Toutes les idées' : 'Tous les forums'} →</a>
        </section>`).join('')}
      <section class="bloc-accueil">
        <h2><a href="${lien({ r: 'actualites' })}" data-interne>📰 Actualités</a></h2>
        <ul class="liste-mini" id="mini-actualites"><li class="etat">Chargement…</li></ul>
        <a class="voir-tout" href="${lien({ r: 'actualites' })}" data-interne>Toutes les actualités →</a>
      </section>
    </div>
    <a class="raccourci-noms" href="${lien({ r: 'noms' })}" data-interne>
      <span aria-hidden="true">🔤</span><span><b>D'où vient le nom des Pokémon ?</b>
      <small>Bulbizarre, Ronflex, Pikachu… l'origine des noms de tous les Pokémon, en français et ailleurs.</small></span><span aria-hidden="true">→</span></a>`;

  anecdoteDuJour().then(a => { if(encore()) document.getElementById('savoir-du-jour').innerHTML = carteAnecdote(a, { duJour: true, lienPlus: true }); });

  const remplirMini = async (r, args) => {
    const ul = document.getElementById(`mini-${r}`);
    try{
      const lignes = await rpc('liste_sujets', { p_limite: 5, ...args });
      if(!encore()) return;
      ul.innerHTML = lignes.length ? lignes.map(s => `
        <li><a href="${lien({ sujet: s.id, depuis: r })}" data-interne>${esc(s.titre)}</a>
          <small>${s.espace === 'amelioration' ? `👍 ${s.nb_votes}` : `💬 ${s.nb_reponses}`}${s.resolue ? ' · ✓ résolue' : ''} · ${depuis(s.activite_le)}</small></li>`).join('')
        : '<li class="etat vide">Rien pour l\'instant : à toi de lancer le mouvement !</li>';
    }catch(err){ if(encore()) ul.innerHTML = `<li>${erreurHtml(err)}</li>`; }
  };
  remplirMini('questions', { p_espace: 'question' });
  remplirMini('ameliorations', { p_espace: 'amelioration', p_tri: 'votes' });
  remplirMini('forums', { p_espace: 'forum' });

  const actus = await lireFichier('actualites.json');
  if(!encore()) return;
  const ul = document.getElementById('mini-actualites');
  ul.innerHTML = actus?.articles?.length ? actus.articles.slice(0, 5).map(a => `
    <li><a href="${esc(a.lien)}" target="_blank" rel="noopener">${esc(a.titre)}</a>
      <small>${esc(a.source)} · ${depuis(a.date)}</small></li>`).join('')
    : '<li class="etat vide">Les actualités arrivent bientôt.</li>';
}

// ------------------------------------------------ le saviez-vous --------

const THEMES = {
  cartes:    { nom: 'Le jeu de cartes', icone: '🃏' },
  pocket:    { nom: 'TCG Pocket',       icone: '📱' },
  pokemon:   { nom: 'L\'univers Pokémon', icone: '⭐' },
  pokepedia: { nom: 'Les Pokémon',      icone: '🔍' },
};

let reserve = null;
async function anecdotes(){
  if(reserve) return reserve;
  const [maison, wiki] = await Promise.all([lireFichier('le-saviez-vous.json'), lireFichier('anecdotes-pokemon.json')]);
  reserve = [
    ...(maison?.anecdotes ?? []),
    ...(wiki?.anecdotes ?? []).flatMap(p => p.textes.map(texte => ({ theme: 'pokepedia', texte, n: p.n, nom: p.nom, page: p.page }))),
  ];
  return reserve;
}

// Le même jour donne la même anecdote, pour tout le monde.
async function anecdoteDuJour(){
  const toutes = await anecdotes();
  if(!toutes.length) return null;
  const jour = new Date().toISOString().slice(0, 10);
  let h = 7;
  for(const c of jour) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return toutes[h % toutes.length];
}

const pageWiki = page => `https://www.pokepedia.fr/${encodeURIComponent(page.replace(/ /g, '_'))}`;

function carteAnecdote(a, { duJour = false, lienPlus = false } = {}){
  if(!a) return '';
  const theme = THEMES[a.theme] ?? THEMES.pokemon;
  return `
    <aside class="anecdote ${duJour ? 'du-jour' : ''}">
      ${a.n ? `<img class="illustration" src="${artwork(a.n)}" alt="" loading="lazy" onerror="this.remove()">`
            : `<span class="illustration icone" aria-hidden="true">${theme.icone}</span>`}
      <div>
        <p class="sur-titre">✨ ${duJour ? 'Le saviez-vous ? — l\'anecdote du jour' : 'Le saviez-vous ?'}${a.nom ? ` · ${esc(a.nom)}` : ''}</p>
        <p class="texte-anecdote">${gras(a.texte)}</p>
        ${a.page ? `<p class="source">Source : <a href="${pageWiki(a.page)}" target="_blank" rel="noopener">Poképédia</a>, licence CC BY-NC-SA 3.0</p>` : ''}
        ${lienPlus ? `<a class="voir-tout" href="${lien({ r: 'savoir' })}" data-interne>D'autres anecdotes →</a>` : ''}
      </div>
    </aside>`;
}

async function afficherSavoir(vue, encore, rubrique, p){
  const toutes = await anecdotes();
  if(!encore()) return;
  if(!toutes.length){ vue.innerHTML = '<p class="etat">Les anecdotes arrivent bientôt.</p>'; return; }
  const theme = THEMES[p.theme] ? p.theme : '';
  const choix = toutes.filter(a => !theme || a.theme === theme);
  const hasard = () => choix[Math.floor(Math.random() * choix.length)];
  vue.innerHTML = `
    <header class="tete-rubrique"><div><h1>Le saviez-vous ?</h1>
      <p>${nb(toutes.length, 'anecdote', 'anecdotes')} sur le jeu de cartes, TCG Pocket et les Pokémon. Une nouvelle chaque jour sur l'accueil de la communauté.</p></div></header>
    <div id="anecdote-principale">${carteAnecdote(theme ? hasard() : await anecdoteDuJour(), { duJour: !theme })}</div>
    <div class="barre-filtres">
      <div class="chips">${[['', 'Toutes'], ...Object.entries(THEMES).map(([k, t]) => [k, `${t.icone} ${t.nom}`])].map(([k, n]) =>
        `<a class="chip ${k === theme ? 'on' : ''}" href="${lien({ r: 'savoir', theme: k })}" data-interne>${n}</a>`).join('')}</div>
      <button type="button" class="bouton-principal" id="autre-anecdote">🎲 Une autre anecdote</button>
    </div>
    <div class="grille-anecdotes" id="grille-anecdotes"></div>
    <div class="suite"><button type="button" class="bouton-discret" id="encore-anecdotes">D'autres anecdotes</button></div>`;
  document.getElementById('autre-anecdote').onclick = () => {
    document.getElementById('anecdote-principale').innerHTML = carteAnecdote(hasard());
  };
  // Les anecdotes du site d'abord, dans l'ordre ; celles de Poképédia,
  // trop nombreuses pour tout montrer, tirées au hasard.
  const maison = choix.filter(a => a.theme !== 'pokepedia');
  const wiki = choix.filter(a => a.theme === 'pokepedia').sort(() => Math.random() - 0.5);
  const file = [...maison, ...wiki];
  let montrees = 0;
  const grille = document.getElementById('grille-anecdotes');
  const plus = () => {
    grille.insertAdjacentHTML('beforeend', file.slice(montrees, montrees + 12).map(a => carteAnecdote(a)).join(''));
    montrees += 12;
    document.getElementById('encore-anecdotes').hidden = montrees >= file.length;
  };
  document.getElementById('encore-anecdotes').onclick = plus;
  plus();
}

// --------------------------------------------------- noms des Pokémon ---

const plat = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function afficherNoms(vue, encore, rubrique, p){
  const [noms, wiki] = await Promise.all([lireFichier('noms-pokemon.json'), lireFichier('anecdotes-pokemon.json')]);
  if(!encore()) return;
  if(!noms?.pokemon?.length){
    vue.innerHTML = `<header class="tete-rubrique"><div><h1>D'où vient le nom des Pokémon ?</h1></div></header>
      <p class="etat">Les explications arrivent bientôt.</p>`;
    return;
  }
  const recits = new Map((wiki?.anecdotes ?? []).map(a => [a.n, a.textes]));
  const gen = Number(p.gen) || 0;
  vue.innerHTML = `
    <header class="tete-rubrique"><div><h1>D'où vient le nom des Pokémon ?</h1>
      <p>Bulbizarre vient de « bulbe » et de « bizarre », Ronflex de « ronflement »… L'origine du nom des
         ${noms.pokemon.length.toLocaleString('fr-FR')} Pokémon, en français et dans d'autres langues.</p></div></header>
    <div class="recherche-noms">
      <input type="search" id="cherche-nom" class="champ" placeholder="Rechercher un Pokémon ou un numéro…" value="${esc(p.q ?? '')}" aria-label="Rechercher un Pokémon">
    </div>
    <div class="chips">${[0, ...GENERATIONS.map((_, k) => k + 1)].map(g =>
      `<a class="chip ${g === gen ? 'on' : ''}" href="${lien({ r: 'noms', gen: g || '', q: p.q })}" data-interne>${g ? `${g}${g === 1 ? 're' : 'e'} génération` : 'Toutes'}</a>`).join('')}</div>
    <p class="compte-noms" id="compte-noms"></p>
    <div class="grille-noms" id="grille-noms"></div>
    <div class="suite"><button type="button" class="bouton-discret" id="plus-noms">Voir plus</button></div>
    <p class="source source-page">Explications tirées de <a href="https://www.pokepedia.fr" target="_blank" rel="noopener">Poképédia</a>,
      l'encyclopédie Pokémon francophone, sous licence
      <a href="${esc(noms.licenceUrl)}" target="_blank" rel="noopener">CC BY-NC-SA 3.0</a> ; mises à jour chaque mois.</p>`;

  const champ = document.getElementById('cherche-nom');
  const grille = document.getElementById('grille-noms');
  const bouton = document.getElementById('plus-noms');
  let liste = [], montres = 0;
  const carte = x => `
    <article class="carte-nom" id="pokemon-${x.n}">
      <img src="${artwork(x.n)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div>
        <h2><small>n° ${String(x.n).padStart(4, '0')}</small> ${esc(x.nom)}</h2>
        <p>${x.fr ? gras(x.fr) : '<span class="vide">Pas encore d\'explication.</span>'}</p>
        ${x.en || x.ja || x.de ? `<details><summary>Dans d'autres langues</summary>
          ${x.en ? `<p><b>Anglais</b> — ${gras(x.en)}</p>` : ''}
          ${x.ja ? `<p><b>Japonais</b> — ${gras(x.ja)}</p>` : ''}
          ${x.de ? `<p><b>Allemand</b> — ${gras(x.de)}</p>` : ''}</details>` : ''}
        ${recits.has(x.n) ? `<details><summary>Le saviez-vous ?</summary>
          ${recits.get(x.n).map(t => `<p>${gras(t)}</p>`).join('')}</details>` : ''}
        <a class="source" href="${pageWiki(x.page ?? x.nom)}" target="_blank" rel="noopener">Fiche Poképédia ↗</a>
      </div>
    </article>`;
  const montrer = () => {
    grille.insertAdjacentHTML('beforeend', liste.slice(montres, montres + 48).map(carte).join(''));
    montres += 48;
    bouton.hidden = montres >= liste.length;
  };
  const filtrer = () => {
    const q = plat(champ.value.trim()).replace(/^n°\s*/, '');
    const [debut, fin] = gen ? GENERATIONS[gen - 1] : [1, Infinity];
    liste = noms.pokemon.filter(x => x.n >= debut && x.n <= fin &&
      (!q || plat(x.nom).includes(q) || String(x.n) === q.replace(/^0+/, '')));
    grille.innerHTML = liste.length ? '' : '<p class="etat">Aucun Pokémon ne correspond à cette recherche.</p>';
    document.getElementById('compte-noms').textContent = q || gen ? nb(liste.length, 'Pokémon', 'Pokémon') : '';
    montres = 0;
    montrer();
  };
  let attente = null;
  champ.addEventListener('input', () => {
    clearTimeout(attente);
    attente = setTimeout(() => {
      history.replaceState({}, '', lien({ r: 'noms', gen: gen || '', q: champ.value.trim() }));
      filtrer();
    }, 180);
  });
  bouton.onclick = montrer;
  filtrer();
}

// --------------------------------------------------------- actualités ---

const SUJETS_ACTUS = { '': 'Tout', pocket: '📱 TCG Pocket', cartes: '🃏 Cartes', pokemon: '⭐ Pokémon' };

async function afficherActualites(vue, encore, rubrique, p){
  const [actus, sites] = await Promise.all([lireFichier('actualites.json'), lireFichier('sites-pokemon.json')]);
  if(!encore()) return;
  const sujet = SUJETS_ACTUS[p.sujet_actu] ? (p.sujet_actu ?? '') : '';
  const articles = (actus?.articles ?? []).filter(a => !sujet || a.sujet === sujet);
  vue.innerHTML = `
    <header class="tete-rubrique"><div><h1>Actualités Pokémon</h1>
      <p>Les derniers articles parus sur Pokémon, le jeu de cartes et TCG Pocket, repérés automatiquement deux fois par jour.
         Chaque lien ouvre l'article sur le site qui l'a publié.</p></div></header>
    <div class="chips">${Object.entries(SUJETS_ACTUS).map(([k, n]) =>
      `<a class="chip ${k === sujet ? 'on' : ''}" href="${lien({ r: 'actualites', sujet_actu: k })}" data-interne>${n}</a>`).join('')}</div>
    ${articles.length ? `<ul class="liste-actus">${articles.map(a => `
      <li><a href="${esc(a.lien)}" target="_blank" rel="noopener">${esc(a.titre)} <span aria-hidden="true">↗</span></a>
        <small>${esc(a.source)} · ${depuis(a.date)}</small></li>`).join('')}</ul>`
      : '<p class="etat">Les actualités arrivent bientôt.</p>'}
    ${actus?.majLe ? `<p class="source">Liste mise à jour ${depuis(actus.majLe)}, à partir de Google Actualités, jeuxvideo.com et Dexerto.</p>` : ''}
    <h2 class="sous-titre">Les sites à suivre</h2>
    <div class="grille-sites">${(sites ?? []).map(s => `
      <a class="site" href="${esc(s.url)}" target="_blank" rel="noopener"><b>${esc(s.nom)} ↗</b><small>${esc(s.texte)}</small></a>`).join('')}</div>`;
}

// ------------------------------------------------------------ départ ----

(async () => {
  poserSquelette();
  await initCompte();
  afficherEtatCompte();
  if(typeof verifierAdmin === 'function'){
    try{ jeSuisAdmin = (await verifierAdmin()).admin === true && document.documentElement.dataset.vueVisiteur !== 'oui'; }catch{}
  }
  afficher();
})();

})();
