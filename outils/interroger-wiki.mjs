#!/usr/bin/env node

const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (+https://github.com/Mrv-972/Collection-Pokemon)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

const PAGE = 'https://pokemon-tcg-pocket.wiki/fr/cards';

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
    cle ??= code.match(/eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/)?.[0]
         ?? code.match(/sb_publishable_[A-Za-z0-9_\-]{10,}/)?.[0]
         ?? null;
    if(base && cle) break;
  }
  return { base, cle };
}

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
  try{ donnees = JSON.parse(texte); }catch(err){ }
  return { statut: r.status, donnees, texte: texte.slice(0, 300) };
}

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

async function trouverLesIconesDeRarete(base, cle){
  const r = await demander(base, cle, '/cards', {});
  if(r.statut !== 200) return console.log('Liste des cartes indisponible.');

  const raretes = new Map();
  (function parcourir(x, p = 0){
    if(!x || p > 6) return;
    if(Array.isArray(x)) return x.forEach(y => parcourir(y, p + 1));
    if(typeof x === 'object'){
      const code = x.rarity ?? x.rarete ?? x.rarity_code;
      if(typeof code === 'string' && code.length <= 12){
        raretes.set(code, (raretes.get(code) ?? 0) + 1);
      }
      Object.values(x).forEach(y => parcourir(y, p + 1));
    }
  })(r.donnees);

  if(!raretes.size) return console.log('Aucun code de rareté repéré dans les cartes.');

  console.log(`\n${raretes.size} codes de rareté chez eux :`);
  const racine = base.replace(/\/functions\/v1\/web_api$/, '');
  const site = 'https://pokemon-tcg-pocket.wiki';

  for(const [code, nombre] of [...raretes].sort((a, b) => b[1] - a[1])){
    const essais = [
      `${site}/icons/card-rarity/${code}.png`,
      `${site}/icons/card-rarity/${encodeURIComponent(code)}.png`,
      `${racine}/storage/v1/object/public/public_files/system/rarity/${code}.png`,
    ];
    let verdict = 'aucune icône';
    for(const adresse of essais){
      try{
        const rr = await fetch(adresse, { method: 'HEAD', redirect: 'follow', headers: IDENTITE });
        if(rr.ok && /image\//.test(rr.headers.get('content-type') ?? '')){
          verdict = `${adresse}  (${rr.headers.get('content-length') ?? '?'} o)`;
          break;
        }
      }catch(err){ }
    }
    console.log(`  ${code.padEnd(6)} ${String(nombre).padStart(5)} cartes  →  ${verdict}`);
  }
}

async function principal(){
  console.log('Lecture du code du wiki…');
  const { base, cle } = await reperages();
  if(!base){ console.error("Point d'entrée introuvable."); process.exit(1); }
  console.log(`  point d'entrée : ${base}`);
  console.log(cle
    ? `  clé d'accès    : trouvée (non affichée, volontairement)\n`
    : `  clé d'accès    : aucune trouvée : on demande sans, le point d'entrée est peut-être ouvert\n`);

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
    break;
  }

  await trouverLesIconesDeRarete(base, cle);
}

principal().catch(err => { console.error('Échec :', err.message); process.exit(1); });
