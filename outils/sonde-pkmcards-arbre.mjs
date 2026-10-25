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
    return { code: r.status, corps: await r.text(), finale: r.url };
  }catch(err){ return { code: 'réseau', corps: '', finale: adresse, err: err.message }; }
}

const liensDe = corps =>
  [...new Set([...(corps.matchAll(/href=["'](\/[^"'#?]{1,120})["']/g))].map(m => m[1]))];

const forme = l => {
  const bouts = l.split('/').filter(Boolean);
  if(!bouts.length) return '/';
  return '/' + bouts[0] + (bouts.length > 1 ? '/*' : '');
};

for(const entree of ['/', '/series', '/cards', '/sets', '/extensions']){
  await dormir(1200);
  const r = await lire(`${RACINE}${entree}`);
  const liens = liensDe(r.corps);
  console.log(`\n=============== ${entree} ===============`);
  console.log(`code ${r.code} (arrivé sur ${r.finale.replace(RACINE, '') || '/'}) ${liens.length} liens internes`);
  if(r.code !== 200) continue;
  const familles = {};
  for(const l of liens){ const f = forme(l); (familles[f] ??= []).push(l); }
  for(const [f, l] of Object.entries(familles).sort((a,b) => b[1].length - a[1].length).slice(0, 14)){
    console.log(`  ${String(l.length).padStart(4)}  ${f.padEnd(16)} ex. ${l[0]}`);
  }
}

console.log('\n=============== /series paginé ? ===============');
const base = `${RACINE}/series`;
const ref = await lire(base);
const sériesDe = corps => [...new Set([...(corps.matchAll(/href=["'](\/series\/[^"'#?]+)["']/g))].map(m => m[1]))];
const temoin = sériesDe(ref.corps);
console.log(`référence : ${temoin.length} séries, 1re = ${temoin[0]}`);
for(const forme2 of ['?page=2', '?p=2', '/page/2', '?tout=1', '?all=1', '?limit=500']){
  await dormir(1200);
  const r = await lire(base + forme2);
  const s = sériesDe(r.corps);
  const pareil = s[0] === temoin[0] && s.length === temoin.length;
  console.log(`  ${forme2.padEnd(12)} code ${String(r.code).padEnd(4)} ${String(s.length).padStart(4)} séries  ${pareil ? 'IDENTIQUE' : '>>> DIFFÉRENT <<<'}`);
}

console.log('\n=============== recherche ===============');
for(const forme3 of ['/search?q=pikachu', '/cards?q=pikachu', '/recherche?q=pikachu',
                     '/search?query=pikachu']){
  await dormir(1200);
  const r = await lire(RACINE + forme3);
  const n = [...new Set(r.corps.match(/static\.pkmcards\.fr\/cards\/fr\/[^"'\s)\\]+/gi) ?? [])].length;
  console.log(`  ${forme3.padEnd(26)} code ${String(r.code).padEnd(4)} ${String(n).padStart(3)} visuels  -> ${r.finale.replace(RACINE,'')}`);
}
