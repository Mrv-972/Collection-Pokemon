// Les deux pistes pour les 2 632 cartes qui restent sans visuel français.
// =======================================================================
//
// PkmCards branché, il reste surtout les promos (Promo SM : 248 cartes),
// les fondations (Set de Base, Jungle, Fossile, Base Set 2, Gym Heroes,
// Gym Challenge, Legendary Collection) et les coffrets. Soit exactement ce
// qu'aucune base grand public ne traite bien.
//
// Deux pistes à éprouver, sur de VRAIES cartes de ces extensions :
//
//   1. les wikis — Poképédia (francophone) et Bulbapedia. Ils documentent
//      les vieilles séries carte par carte, là où les API s'arrêtent. Ils
//      servent leurs images depuis un MediaWiki, dont l'interface de
//      données est publique et documentée : pas de devinette d'adresse.
//
//   2. Cardmarket — un site de vente, donc des photos de tout ce qui
//      s'échange, promos comprises.
//
// On regarde pour chacune : ce que robots.txt autorise, si la carte est
// trouvable, si l'image est en français, et si le serveur autorise son
// affichage chez nous (l'en-tête CORS, sans quoi le partage d'un classeur
// casserait).
//
//   node outils/sonde-pistes-restantes.mjs

const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (reperage de visuels francais ; ' +
                'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function lire(adresse, options = {}){
  try{
    const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow', ...options });
    const type = r.headers.get('content-type') ?? '';
    const corps = options.method === 'HEAD' ? '' : await r.text();
    return { code: r.status, corps, type, finale: r.url,
             cors: r.headers.get('access-control-allow-origin') };
  }catch(err){ return { code: 'réseau', corps: '', type: '', finale: adresse, err: err.message }; }
}

// Des cartes réelles des extensions qui nous manquent, avec leur nom
// français tel que notre instantané le porte.
const CIBLES = [
  { ext: 'base1', nom: 'Dracaufeu',   serieFr: 'Set de Base',  serieEn: 'Base Set' },
  { ext: 'base2', nom: 'Pikachu',     serieFr: 'Jungle',       serieEn: 'Jungle' },
  { ext: 'base3', nom: 'Aérodactyl',  serieFr: 'Fossile',      serieEn: 'Fossil' },
  { ext: 'gym1',  nom: 'Ronflex',     serieFr: 'Gym Heroes',   serieEn: 'Gym Heroes' },
  { ext: 'lc',    nom: 'Mewtwo',      serieFr: 'Legendary Collection', serieEn: 'Legendary Collection' },
];

// ===================== 1. les wikis =====================================
// L'interface de données de MediaWiki donne l'adresse exacte d'une image
// sans qu'on ait à la deviner, et dit si la page existe.
const WIKIS = [
  { nom: 'Poképédia (fr)', api: 'https://www.pokepedia.fr/api.php' },
  { nom: 'Bulbapedia',     api: 'https://bulbapedia.bulbagarden.net/w/api.php' },
];

console.log('=============== robots.txt ===============');
for(const racine of ['https://www.pokepedia.fr', 'https://bulbapedia.bulbagarden.net',
                     'https://www.cardmarket.com']){
  await dormir(1000);
  const r = await lire(`${racine}/robots.txt`);
  const lignes = r.corps.split('\n').filter(l => /^(user-agent|disallow|allow|crawl-delay)/i.test(l));
  console.log(`\n${racine} — code ${r.code}, ${lignes.length} règles`);
  console.log(lignes.slice(0, 18).map(l => '    ' + l.trim()).join('\n'));
  if(lignes.length > 18) console.log(`    … et ${lignes.length - 18} autres règles`);
}

console.log('\n=============== les wikis ===============');
for(const wiki of WIKIS){
  console.log(`\n--- ${wiki.nom} ---`);
  // On cherche d'abord si le wiki connaît ces cartes, par sa recherche.
  for(const cible of CIBLES.slice(0, 3)){
    await dormir(1200);
    const terme = `${cible.nom} ${cible.serieFr}`;
    const url = `${wiki.api}?action=query&list=search&srsearch=` +
      encodeURIComponent(terme) + '&srlimit=3&format=json';
    const r = await lire(url);
    let titres = [];
    try{ titres = (JSON.parse(r.corps).query?.search ?? []).map(s => s.title); }catch{}
    console.log(`  « ${terme} » -> code ${r.code}  ${titres.length ? titres.join(' | ') : '(rien)'}`);
  }
  // Puis : une page de carte porte-t-elle une image, et laquelle ?
  await dormir(1200);
  const ex = `${wiki.api}?action=query&generator=search&gsrsearch=` +
    encodeURIComponent('Dracaufeu Set de Base') +
    '&gsrlimit=1&prop=images&imlimit=12&format=json';
  const r = await lire(ex);
  try{
    const pages = Object.values(JSON.parse(r.corps).query?.pages ?? {});
    for(const p of pages){
      console.log(`  page « ${p.title} » : ${(p.images ?? []).length} images`);
      for(const i of (p.images ?? []).slice(0, 8)) console.log(`      ${i.title}`);
    }
  }catch(err){ console.log(`  (lecture impossible : ${r.code})`); }
}

// ===================== 2. Cardmarket ====================================
console.log('\n=============== Cardmarket ===============');
// On ne devine aucune adresse d'image : on demande la page d'une carte et
// on regarde ce qu'elle porte. Un 403 dirait que la piste est fermée aux
// robots, ce qui serait une réponse en soi.
for(const cible of CIBLES.slice(0, 3)){
  await dormir(2000);
  const slug = cible.nom.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const url = 'https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=' +
    encodeURIComponent(slug);
  const r = await lire(url);
  const images = [...new Set(r.corps.match(/https?:\/\/product-images[^"'\s)]+/gi) ?? [])];
  console.log(`  « ${slug} » -> code ${r.code}, ${r.corps.length} octets, ${images.length} images produit`);
  if(images.length) console.log(`      ex. ${images[0]}`);
}

console.log('\nRien n’a été téléchargé : cette sonde ne lit que du texte.');
