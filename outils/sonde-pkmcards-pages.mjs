// /cards/<numéro> est-il le paginateur de PkmCards ?
// ==================================================
//
// Dans leur page /cards, deux liens détonnaient parmi les adresses de
// cartes : /cards/4 et /cards/576. Ce ne sont pas des cartes — ce sont
// très probablement des numéros de page, et 576 la dernière. Si c'est
// vrai, voilà la porte du catalogue entier, et elle était dans la page
// depuis le début.
//
// Cette sonde le vérifie plutôt que de le supposer : elle lit quelques
// pages réparties du début à la fin et regarde quels codes d'extension
// y apparaissent. Les dernières pages doivent porter les extensions les
// plus anciennes — c'est ce qui dirait si nos extensions muettes y sont.
//
//   node outils/sonde-pkmcards-pages.mjs

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

// Leurs adresses de carte : /cards/<code>-<langue>-<numéro>-<nom>
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
  // Un détour vers /cards voudrait dire que ce numéro n'est pas une page.
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
// Réparties : le début, le milieu, la fin. Si la fin porte du « base1 »
// ou du « neo », la piste est bonne pour nos extensions anciennes.
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
