// Chercher par où PkmCards se laisse parcourir.
// =============================================
//
// Leur page « liste des cartes françaises » renvoie les 30 mêmes cartes
// quelle que soit la page demandée : c'est une vitrine, pas un catalogue.
// Cette sonde regarde, sans rien télécharger d'autre que du texte :
//
//   1. robots.txt   — ce qu'ils autorisent, et où est leur plan de site ;
//   2. le plan de site — la voie prévue pour les machines, si elle existe ;
//   3. les formes de pagination courantes, pour voir si l'une répond ;
//   4. les traces d'une interface de données (Next.js, API) dans leur page.
//
//   node outils/sonde-pkmcards-plan.mjs

const RACINE = 'https://www.pkmcards.fr';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (reperage ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function lire(adresse){
  try{
    const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
    const corps = await r.text();
    return { code: r.status, corps, finale: r.url, type: r.headers.get('content-type') ?? '' };
  }catch(err){ return { code: 'réseau', corps: '', finale: adresse, type: '', err: err.message }; }
}

// --- 1. robots.txt --------------------------------------------------------
console.log('=============== robots.txt ===============');
const robots = await lire(`${RACINE}/robots.txt`);
console.log(`code ${robots.code}`);
console.log(robots.corps.slice(0, 1500));
const plans = [...new Set([...(robots.corps.matchAll(/^\s*sitemap:\s*(\S+)/gim))].map(m => m[1]))];

// --- 2. le plan de site ---------------------------------------------------
console.log('\n=============== plan de site ===============');
const candidats = plans.length ? plans : [`${RACINE}/sitemap.xml`, `${RACINE}/sitemap_index.xml`];
for(const adresse of candidats){
  await dormir(1200);
  const r = await lire(adresse);
  const liens = [...new Set([...(r.corps.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi))].map(m => m[1]))];
  console.log(`\n${adresse}\n  code ${r.code} — ${r.corps.length} octets — ${liens.length} adresses`);
  // Un plan d'index renvoie vers d'autres plans ; on montre de quoi il parle.
  const parGenre = {};
  for(const l of liens){
    const genre = (l.replace(RACINE, '').match(/^\/[a-z0-9_-]*/i) ?? ['/'])[0];
    parGenre[genre] = (parGenre[genre] ?? 0) + 1;
  }
  for(const [genre, n] of Object.entries(parGenre).sort((a,b) => b[1]-a[1]).slice(0, 12)){
    console.log(`    ${String(n).padStart(6)}  ${genre}`);
  }
  console.log('  exemples : ' + liens.slice(0, 4).join('\n             '));
}

// --- 3. les formes de pagination ------------------------------------------
console.log('\n=============== pagination ===============');
const base = `${RACINE}/cards/liste-cartes-francaises`;
const reference = await lire(base);
const empreinte = corps => {
  const m = [...new Set(corps.match(
    /static\.pkmcards\.fr\/cards\/fr\/[^"'\s)\\]+/gi) ?? [])];
  return { n: m.length, premiere: m[0] ?? '—' };
};
const temoin = empreinte(reference.corps);
console.log(`référence : ${temoin.n} visuels, 1re = ${temoin.premiere.slice(-40)}`);
for(const forme of ['?page=2', '?p=2', '/page/2', '?offset=30', '?skip=30', '?start=30']){
  await dormir(1200);
  const r = await lire(base + forme);
  const e = empreinte(r.corps);
  const pareil = e.premiere === temoin.premiere;
  console.log(`  ${forme.padEnd(12)} code ${String(r.code).padEnd(4)} ${String(e.n).padStart(3)} visuels  ${pareil ? 'IDENTIQUE' : '>>> DIFFÉRENT <<<'}`);
}

// --- 4. une interface de données ? ----------------------------------------
console.log('\n=============== interface de données ===============');
const c = reference.corps;
const indices = {
  'Next.js (__NEXT_DATA__)': /__NEXT_DATA__/.test(c),
  'buildId':                 (c.match(/"buildId":"([^"]+)"/) ?? [])[1] ?? null,
  'Nuxt':                    /__NUXT__/.test(c),
  'appels /api/':            [...new Set([...(c.matchAll(/["'](\/api\/[^"'\s]{2,60})["']/g))].map(m=>m[1]))].slice(0,8),
  'lien rel=next':           (c.match(/<link[^>]+rel=["']next["'][^>]*>/i) ?? [])[0] ?? null,
  'mot « pagination »':      /pagination|loadMore|charger plus|voir plus/i.test(c),
};
for(const [quoi, valeur] of Object.entries(indices)){
  console.log(`  ${quoi.padEnd(26)} ${JSON.stringify(valeur)}`);
}
