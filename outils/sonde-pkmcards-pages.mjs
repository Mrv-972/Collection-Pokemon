const RACINE = 'https://www.pkmcards.fr';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (reperage ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));
const lire = async a => {
  try{ const r = await fetch(a, { headers: IDENTITE, redirect: 'follow' });
       return { code: r.status, corps: await r.text(), finale: r.url }; }
  catch(e){ return { code: 'réseau', corps: '', finale: a, err: e.message }; }
};

const CARTES = /\/cards\/([a-z0-9.]+)-(fr|en|jp)-([0-9a-z]+)-/gi;

async function page(n){
  const adresse = n === null ? `${RACINE}/cards` : `${RACINE}/cards/${n}`;
  const r = await lire(adresse);
  const vus = [...r.corps.matchAll(CARTES)];
  const codes = {};
  for(const m of vus){
    const cle = `${m[1].toLowerCase()}/${m[2].toLowerCase()}`;
    codes[cle] = (codes[cle] ?? 0) + 1;
  }
  const attendu = n === null ? '/cards' : `/cards/${n}`;
  return {
    code: r.code,
    détourné: !r.finale.endsWith(attendu),
    finale: r.finale.replace(RACINE, ''),
    cartes: vus.length,
    codes: Object.entries(codes).sort((a,b) => b[1]-a[1]).slice(0, 6),
  };
}

console.log('=============== /cards/<numéro> ===============');
for(const n of [null, 1, 2, 4, 100, 300, 500, 576, 577]){
  await dormir(1500);
  const r = await page(n);
  const nom = n === null ? '/cards' : `/cards/${n}`;
  console.log(`\n  ${nom}`);
  console.log(`    code ${r.code}${r.détourné ? '  DÉTOURNÉ -> ' + r.finale : ''}`);
  console.log(`    ${r.cartes} liens de carte`);
  if(r.codes.length) console.log('    extensions : ' +
    r.codes.map(([c,n2]) => `${c}×${n2}`).join('  '));
}
