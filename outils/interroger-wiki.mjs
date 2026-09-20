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

async function principal(){
  console.log('Lecture du code du wiki…');
  const { base, cle } = await reperages();
  if(!base){ console.error("Point d'entrée introuvable."); process.exit(1); }
  console.log(`  point d'entrée : ${base}`);
  console.log(cle
    ? `  clé d'accès    : trouvée (non affichée, volontairement)\n`
    : `  clé d'accès    : aucune trouvée — on demande sans, le point d'entrée est peut-être ouvert\n`);

  for(const [chemin, corps] of [
    ['/expansions', null],
    ['/sets', null],
    ['/expansion', null],
    ['/cards', { page: 1, pageSize: 3 }],
    ['/cards', {}],
    ['', null],
    ['/', null],
    ['/expansions/list', null],
    ['/card-list', null],
  ]){
    const r = await demander(base, cle, chemin, corps);
    console.log(`${corps ? 'POST' : 'GET '} ${chemin.padEnd(12)} → HTTP ${r.statut}`);
    if(r.statut !== 200){ console.log(`     ${r.texte}`); continue; }

    const extensions = [...extraireExtensions(r.donnees)].sort();
    if(extensions.length){
      console.log(`     extensions vues : ${extensions.join(', ')}`);
      const promos = extensions.filter(e => /p|promo/i.test(e));
      if(promos.length) console.log(`     → candidates pour les promos : ${promos.join(', ')}`);
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
  }
}

principal().catch(err => { console.error('Échec :', err.message); process.exit(1); });
