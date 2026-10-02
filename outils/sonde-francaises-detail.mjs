// Deuxième reconnaissance : les deux pistes qui tiennent.
// ======================================================
//
// La première a montré que Pokécardex ne livre rien sans navigateur, et que
// Poképédia n'est pas un catalogue de cartes. Restent deux pistes, qu'on
// examine de près, toujours sans rien récolter :
//
//   — pokemon.com, l'ayant droit, qui sert des visuels sous « cms-fr-fr »
//     avec NOS identifiants d'extension ;
//   — pkmcards.fr, qui sert des scans français sous « static.pkmcards.fr ».
//
// Les deux questions : l'adresse d'une CARTE se devine-t-elle, et nos
// extensions vides y sont-elles ?
//
//   node outils/sonde-francaises-detail.mjs

const IDENTITE = { 'User-Agent': 'PokeClasseur (reconnaissance, github.com/Mrv-972/Collection-Pokemon)' };

// Quelques-unes de nos extensions sans aucun visuel, choisies pour couvrir
// les trois familles : kit du dresseur, McDonald's, et une grosse prise.
const MUETTES = ['30th-c', 'swsh4.5sv', 'sm3.5', 'tk-xy-p', '2019sm-fr', 'mee', 'mfb'];

async function lire(adresse){
  try{
    const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
    const corps = await r.text();
    return { code: r.status, corps, adresse: r.url };
  }catch(err){
    return { code: 'réseau', corps: '', err: err.message, adresse };
  }
}

const images = corps => [...new Set((corps.match(/https?:\/\/[^"'\s)\\]+\.(?:png|jpe?g|webp)/gi) ?? []))];
const liens = corps => [...new Set((corps.match(/href="([^"]+)"/g) ?? [])
  .map(h => h.slice(6, -1)))];

// ---------------------------------------------------- Pokémon officiel ---
console.log('='.repeat(64));
console.log('Pokémon officiel — les cartes suivent-elles une adresse régulière ?');
console.log('='.repeat(64));

// La recherche de cartes du site officiel, en français.
const recherche = await lire('https://www.pokemon.com/fr/jcc-pokemon/cartes-pokemon/?card-type=&format=unlimited');
console.log(`recherche : ${recherche.code}`);
if(recherche.code === 200){
  const img = images(recherche.corps);
  const cartes = img.filter(a => /\/tcg(-|\/)|cards?\//i.test(a) && !/symbol|logo/i.test(a));
  console.log(`  ${img.length} images, dont ${cartes.length} qui ressemblent à des cartes`);
  for(const a of cartes.slice(0, 8)) console.log(`  ${a}`);
  if(!cartes.length){
    console.log('  aucune : la liste est probablement construite par JavaScript.');
    const sousTypes = [...new Set(img.map(a => a.replace(/[^/]+$/, '')))];
    console.log('  dossiers vus :');
    for(const d of sousTypes.slice(0, 8)) console.log(`    ${d}`);
  }
}

// Les symboles d'extension, eux, se devinent : vérifions-le sur nos muettes.
console.log('\nLes symboles d\'extension, avec nos identifiants :');
for(const id of MUETTES){
  const a = `https://www.pokemon.com/static-assets/content-assets/cms-fr-fr/img/tcg/expansion-symbols/${id}-expansion-symbol.png`;
  try{
    const r = await fetch(a, { headers: IDENTITE });
    r.body?.cancel();
    console.log(`  ${r.ok ? 'oui' : 'non'}  ${String(r.status).padEnd(4)} ${id}`);
  }catch{ console.log(`  non  réseau ${id}`); }
}

// ----------------------------------------------------------- PkmCards ---
console.log('\n' + '='.repeat(64));
console.log('PkmCards — nos extensions vides y sont-elles, et avec quels visuels ?');
console.log('='.repeat(64));

const liste = await lire('https://www.pkmcards.fr/cards/liste-cartes-francaises');
console.log(`page de liste : ${liste.code}`);
if(liste.code === 200){
  // Quelles pages d'extension la liste propose-t-elle ?
  const pages = liens(liste.corps).filter(h => /\/(cards|series|extension|set)/i.test(h));
  console.log(`  ${pages.length} liens vers des pages de cartes ou d'extensions`);
  for(const h of pages.slice(0, 12)) console.log(`    ${h}`);

  // Les adresses d'image portent le code d'extension : lesquels voit-on ?
  const codes = [...new Set((liste.corps.match(/static\.pkmcards\.fr\/cards\/fr\/([^/]+)\//g) ?? [])
    .map(m => m.split('/')[4]))];
  console.log(`\n  codes d'extension vus dans les adresses : ${codes.join(', ') || '(aucun)'}`);
}

// Nos identifiants correspondent-ils aux leurs ? On essaie quelques formes.
console.log('\nNos extensions vides, cherchées chez eux :');
for(const id of MUETTES){
  const formes = [id, id.replace(/th-/, ''), id.replace(/\./g, ''), id.replace(/^tk-/, '')];
  let trouve = null;
  for(const forme of [...new Set(formes)]){
    const r = await lire(`https://www.pkmcards.fr/cards/${encodeURIComponent(forme)}`);
    if(r.code === 200 && r.corps.includes('static.pkmcards.fr/cards/fr/')){
      const n = images(r.corps).filter(a => a.includes('/cards/fr/')).length;
      trouve = { forme, n, adresse: r.adresse };
      break;
    }
  }
  console.log(trouve
    ? `  oui  ${id.padEnd(12)} → ${trouve.forme.padEnd(10)} ${trouve.n} visuels   ${trouve.adresse}`
    : `  non  ${id.padEnd(12)} aucune page trouvée sous les formes essayées`);
}

console.log('\nAucune image récoltée : cette sonde ne fait que regarder.');
