// Quelles sources françaises pourrait-on utiliser, et en a-t-on le droit ?
// =======================================================================
//
// Le besoin : des visuels de cartes EN FRANÇAIS pour les quelque 1 400
// cartes dont ni TCGdex ni pokemon-tcg-data n'ont rien.
//
// Cette sonde ne récolte aucune image. Elle pose, pour chaque candidat,
// les trois questions à régler AVANT d'écrire la moindre ligne de récolte :
//
//   1. le site répond-il, et sous quelle forme (page, API) ?
//   2. son robots.txt autorise-t-il un programme à le parcourir ?
//   3. publie-t-il sous une licence qui permette la réutilisation ?
//
// La deuxième question n'est pas une formalité. Un site de communauté qui
// a scanné ses cartes lui-même n'est pas un jeu de données ouvert : lui
// prendre son travail sans regarder ce qu'il autorise serait malhonnête,
// et se verrait.
//
//   node outils/sonde-sources-francaises.mjs

const IDENTITE = { 'User-Agent': 'PokeClasseur (reconnaissance, github.com/Mrv-972/Collection-Pokemon)' };

const CANDIDATS = [
  { nom: 'Pokécardex', hote: 'www.pokecardex.com',
    pages: ['https://www.pokecardex.com/', 'https://www.pokecardex.com/series'],
    note: "La référence française : 24 000 cartes, 240 séries, scans en français." },
  { nom: 'PkmCards', hote: 'www.pkmcards.fr',
    pages: ['https://www.pkmcards.fr/cards/liste-cartes-francaises'],
    note: 'Catalogue les cartes françaises depuis 2023.' },
  { nom: 'Poképédia', hote: 'www.pokepedia.fr',
    pages: ['https://www.pokepedia.fr/api.php?action=query&meta=siteinfo&format=json',
            'https://www.pokepedia.fr/api.php?action=query&list=search&srsearch=carte&format=json'],
    note: "Wiki francophone sous licence libre, avec une API MediaWiki ouverte." },
  { nom: 'Pokémon (officiel)', hote: 'www.pokemon.com',
    pages: ['https://www.pokemon.com/fr/jcc-pokemon/cartes-pokemon'],
    note: "L'ayant droit lui-même." },
];

async function lire(adresse, { texte = false } = {}){
  try{
    const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
    const corps = texte ? await r.text() : null;
    if(!texte) r.body?.cancel();
    return { code: r.status, type: r.headers.get('content-type') ?? '', corps };
  }catch(err){
    return { code: 'réseau', type: '', corps: null, err: err.message };
  }
}

// Ce que le robots.txt dit à un programme comme le nôtre. On lit la section
// « User-agent: * », la seule qui nous concerne.
function lireRobots(texte){
  if(!texte) return { interdits: [], brut: '' };
  const lignes = texte.split('\n').map(l => l.trim());
  const interdits = [];
  let nousConcerne = false;
  for(const l of lignes){
    const m = l.match(/^user-agent:\s*(.+)$/i);
    if(m){ nousConcerne = m[1].trim() === '*'; continue; }
    if(!nousConcerne) continue;
    const d = l.match(/^disallow:\s*(.*)$/i);
    if(d) interdits.push(d[1].trim() || '(rien)');
  }
  return { interdits, brut: texte.slice(0, 400) };
}

for(const c of CANDIDATS){
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${c.nom}  —  ${c.hote}`);
  console.log(c.note);
  console.log('='.repeat(60));

  const robots = await lire(`https://${c.hote}/robots.txt`, { texte: true });
  if(robots.code === 200){
    const { interdits } = lireRobots(robots.corps);
    console.log(`robots.txt : ${interdits.length} interdiction(s) pour un programme quelconque`);
    for(const i of interdits.slice(0, 12)) console.log(`   interdit : ${i}`);
    if(interdits.includes('/')) console.log('   >>> TOUT LE SITE EST INTERDIT aux programmes <<<');
  }else{
    console.log(`robots.txt : ${robots.code} — aucune règle publiée`);
  }

  for(const page of c.pages){
    const r = await lire(page, { texte: true });
    const estJson = r.type.includes('json');
    console.log(`\n  ${r.code}  ${r.type.split(';')[0]}  ${page}`);
    if(r.code !== 200 || !r.corps) continue;

    if(estJson){
      console.log(`     réponse JSON de ${r.corps.length} octets`);
      console.log(`     ${r.corps.slice(0, 220).replace(/\s+/g, ' ')}`);
      continue;
    }
    // Quelles adresses d'image la page porte-t-elle ? C'est ce qui dit si
    // les visuels se devinent ou s'il faut lire chaque page.
    const images = [...new Set((r.corps.match(/https?:\/\/[^"'\s)]+\.(?:png|jpe?g|webp)/gi) ?? []))];
    const interessantes = images.filter(a => !/logo|icon|favicon|sprite|avatar|banner/i.test(a));
    console.log(`     ${images.length} adresses d'image, dont ${interessantes.length} qui ressemblent à des cartes`);
    for(const a of interessantes.slice(0, 6)) console.log(`     ${a}`);
    const hotes = [...new Set(images.map(a => { try{ return new URL(a).host; }catch{ return '?'; } }))];
    if(hotes.length) console.log(`     servies depuis : ${hotes.slice(0, 5).join(', ')}`);
  }
}

console.log('\n\nRappel : cette sonde n\'a récolté aucune image. Elle dit seulement');
console.log('ce que chaque site répond et ce qu\'il autorise.');
