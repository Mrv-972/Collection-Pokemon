#!/usr/bin/env node
//
// Demander au wiki comment il nomme ses extensions
// ================================================
//
// Sept extensions sur huit ont livré leurs visuels français. La huitième,
// P-B, résiste : cinq graphies de son dossier répondent 400, y compris en
// anglais — ce n'est donc pas la traduction qui manque, c'est leur nom
// d'extension qu'on ne devine pas.
//
// Plutôt qu'une sixième supposition, on pose la question à leur propre point
// d'entrée de données. Cela suppose d'employer la clé publique que leur site
// embarque dans son code : elle sert précisément à ça, mais ce n'est pas la
// même chose que lire un dossier ouvert, et c'est pourquoi cet outil est
// séparé, lancé à la main, et ne tourne pas dans la construction nocturne.
//
// Il n'AFFICHE JAMAIS la clé. Elle est déjà publique dans leur code ; la
// recopier dans des journaux consultables par tous n'apporterait rien et
// serait discourtois.

const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (+https://github.com/Mrv-972/Collection-Pokemon)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

const PAGE = 'https://pokemon-tcg-pocket.wiki/fr/cards';

// ------------------------------------------- retrouver de quoi appeler ----

async function reperages(){
  const r = await fetch(PAGE, { headers: IDENTITE });
  const html = await r.text();
  const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);

  let base = null, cle = null;
  for(const src of srcs){
    let code;
    try{
      const rr = await fetch(new URL(src, PAGE), { headers: IDENTITE });
      if(!rr.ok) continue;
      code = await rr.text();
    }catch(err){ continue; }

    base ??= code.match(/https:\/\/[a-z0-9.\-]+\/functions\/v1\/web_api/)?.[0] ?? null;
    // Deux formats de clé coexistent : l'ancien est un jeton en trois
    // morceaux commençant par « eyJ », le nouveau s'écrit « sb_publishable_ ».
    cle ??= code.match(/eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/)?.[0]
         ?? code.match(/sb_publishable_[A-Za-z0-9_\-]{10,}/)?.[0]
         ?? null;
    if(base && cle) break;
  }
  return { base, cle };
}

// ----------------------------------------------------- poser la question --

async function demander(base, cle, chemin, corps){
  const entetes = { ...IDENTITE };
  if(cle){ entetes.apikey = cle; entetes.Authorization = `Bearer ${cle}`; }
  if(corps) entetes['Content-Type'] = 'application/json';
  const r = await fetch(base + chemin, {
    method: corps ? 'POST' : 'GET',
    headers: entetes,
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const texte = await r.text();
  let donnees = null;
  try{ donnees = JSON.parse(texte); }catch(err){ /* pas du JSON */ }
  return { statut: r.status, donnees, texte: texte.slice(0, 300) };
}

// Ce qui nous intéresse : les identifiants d'extension, et la forme du chemin
// d'un visuel. On cherche donc, dans n'importe quelle réponse, tout ce qui
// ressemble à une extension promotionnelle.
function extraireExtensions(donnees, vus = new Set(), profondeur = 0){
  if(!donnees || profondeur > 6) return vus;
  if(Array.isArray(donnees)){
    for(const x of donnees) extraireExtensions(x, vus, profondeur + 1);
    return vus;
  }
  if(typeof donnees === 'object'){
    for(const [cle, valeur] of Object.entries(donnees)){
      if(/^(id|code|set|set_?id|expansion|expansion_?code|slug)$/i.test(cle) && typeof valeur === 'string' && valeur.length <= 12){
        vus.add(valeur);
      }
      extraireExtensions(valeur, vus, profondeur + 1);
    }
  }
  return vus;
}

// Nous séparons les promos en P-A et P-B ; eux n'ont qu'une série « PROMO »
// à numérotation continue. Si la suite est simplement « P-A puis P-B », leur
// PROMO-118 doit porter le nom de notre P-B-001. On ne le suppose pas : on
// compare les noms, carte par carte.
async function comparerLesPromos(base, cle){
  const r = await demander(base, cle, '/cards', {});
  if(r.statut !== 200) return console.log('Comparaison impossible : la liste des cartes ne répond pas.');

  const plat = [];
  (function parcourir(x, p = 0){
    if(!x || p > 6) return;
    if(Array.isArray(x)) return x.forEach(y => parcourir(y, p + 1));
    if(typeof x === 'object'){
      const id = x.id ?? x.code ?? x.card_id;
      const nom = x.name ?? x.name_fr ?? x.title;
      if(typeof id === 'string' && /^PROMO-\d+$/.test(id)) plat.push({ id, nom });
      Object.values(x).forEach(y => parcourir(y, p + 1));
    }
  })(r.donnees);

  const promos = [...new Map(plat.map(c => [c.id, c])).values()]
    .sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6)));
  console.log(`\n${promos.length} cartes PROMO chez eux.`);
  console.log('Les leurs, autour du 118 :');
  for(const c of promos.filter(c => { const n = Number(c.id.slice(6)); return n >= 115 && n <= 124; })){
    console.log(`  ${c.id}  ${c.nom ?? '(sans nom)'}`);
  }
}

async function principal(){
  console.log('Lecture du code du wiki…');
  const { base, cle } = await reperages();
  if(!base){ console.error("Point d'entrée introuvable."); process.exit(1); }
  console.log(`  point d'entrée : ${base}`);
  console.log(cle
    ? `  clé d'accès    : trouvée (non affichée, volontairement)\n`
    : `  clé d'accès    : aucune trouvée — on demande sans, le point d'entrée est peut-être ouvert\n`);

  for(const [chemin, corps] of [
    ['/cards', {}],
  ]){
    const r = await demander(base, cle, chemin, corps);
    console.log(`${corps ? 'POST' : 'GET '} ${chemin.padEnd(12)} → HTTP ${r.statut}`);
    if(r.statut !== 200){ console.log(`     ${r.texte}`); continue; }

    const extensions = [...extraireExtensions(r.donnees)].sort();
    if(extensions.length){
      const series = [...new Set(extensions.map(e => e.replace(/-\d+$/, '')))].sort();
      console.log(`     ${extensions.length} cartes, séries : ${series.join(', ')}`);
    }
    // Un chemin de visuel dans la réponse vaut mieux que toutes les déductions.
    const chemins = [...new Set(
      [...JSON.stringify(r.donnees).matchAll(/[A-Za-z0-9_\-\/]*card\/[A-Za-z0-9_\-\/.]+/g)].map(m => m[0])
    )].slice(0, 5);
    if(chemins.length){
      console.log('     chemins de visuel vus :');
      chemins.forEach(c => console.log('       ' + c));
    }
    if(!extensions.length && !chemins.length){
      console.log('     ' + JSON.stringify(r.donnees).slice(0, 400));
    }
    break;   // un chemin qui répond suffit : inutile de les essayer tous
  }

  await comparerLesPromos(base, cle);
}

principal().catch(err => { console.error('Échec :', err.message); process.exit(1); });
