// Sonde : d'où tirer les explications de noms et les actualités ?
// ===============================================================
//
// Lancée à la main (.github/workflows/sonde-communaute.yml). Elle ne publie
// rien : elle affiche dans le journal ce que Poképédia et les sites
// d'actualités répondent, pour écrire ensuite les vrais outils sur du
// concret plutôt que sur des suppositions.

const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (communaute ; github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const API = 'https://www.pokepedia.fr/api.php';
const q = async p => (await fetch(API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...p }), { headers: IDENTITE })).json();

console.log('=============== Poképédia : sections ===============');
for(const titre of ['Bulbizarre', 'Pikachu', 'Ronflex', 'Nidoran♀', 'M. Mime', 'Type:0', 'Pêchaminus', 'Morphéo']){
  try{
    const d = await q({ action: 'parse', page: titre, prop: 'sections', redirects: '1' });
    if(d.error){ console.log(`${titre} : ${d.error.code}`); continue; }
    console.log(`${titre} (${d.parse.title}) : ` + d.parse.sections.map(s => `${s.level}:${s.line}`).join(' | '));
  }catch(err){ console.log(`${titre} : ${err.message}`); }
}

console.log('\n=============== Poképédia : texte brut de Bulbizarre et Ronflex ===============');
for(const titre of ['Bulbizarre', 'Ronflex']){
  const d = await q({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: titre, redirects: '1' });
  const texte = d.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? '';
  const i = texte.search(/==+\s*(Étymologie|Origine|Nom)/i);
  console.log(`--- ${titre} : ${texte.length} caractères, section trouvée à ${i}`);
  console.log(i >= 0 ? texte.slice(i, i + 2500) : texte.slice(0, 1500));
}

console.log('\n=============== Poképédia : plusieurs pages en une requête ===============');
{
  const d = await q({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: 'Bulbizarre|Herbizarre|Florizarre', redirects: '1' });
  console.log((d.query?.pages ?? []).map(p => `${p.title}: ${p.revisions?.[0]?.slots?.main?.content?.length ?? 'vide'}`).join(' ; '), d.warnings ? JSON.stringify(d.warnings) : '');
}
{
  const d = await q({ action: 'query', meta: 'siteinfo', siprop: 'rightsinfo' });
  console.log('licence :', JSON.stringify(d.query?.rightsinfo));
}

console.log('\n=============== Actualités : flux RSS ===============');
const FLUX = [
  'https://www.pokemon.com/fr/actus-pokemon/rss',
  'https://www.pokemon.com/us/pokemon-news/rss',
  'https://www.pokebip.com/rss',
  'https://www.pokebip.com/rss.xml',
  'https://www.pokebip.com/feed',
  'https://www.pokemontrash.com/feed/',
  'https://www.pokemontrash.com/club/feed/',
  'https://www.pokekalos.fr/feed',
  'https://www.pokekalos.fr/rss.xml',
  'https://www.pokecardex.com/rss',
  'https://www.pokecardex.com/feed',
  'https://www.pokecardex.com/rss.xml',
  'https://www.pokebeach.com/feed',
  'https://www.serebii.net/index2.xml',
  'https://www.pokepedia.fr/index.php?title=Sp%C3%A9cial:Nouvelles_pages&feed=rss',
  'https://news.google.com/rss/search?q=Pok%C3%A9mon&hl=fr&gl=FR&ceid=FR:fr',
  'https://news.google.com/rss/search?q=%22Pok%C3%A9mon+TCG+Pocket%22&hl=fr&gl=FR&ceid=FR:fr',
  'https://news.google.com/rss/search?q=%22cartes+Pok%C3%A9mon%22&hl=fr&gl=FR&ceid=FR:fr',
  'https://www.jeuxvideo.com/rss/rss.xml',
  'https://www.millenium.org/rss',
  'https://www.dexerto.fr/feed/',
];
for(const url of FLUX){
  try{
    const r = await fetch(url, { headers: IDENTITE, redirect: 'follow' });
    const t = await r.text();
    const items = (t.match(/<item[\s>]/g) ?? []).length + (t.match(/<entry[\s>]/g) ?? []).length;
    const titres = [...t.matchAll(/<item[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?(?:<pubDate>([\s\S]*?)<\/pubDate>)?/g)].slice(0, 3)
      .map(m => `${m[1].trim().slice(0, 90)} [${(m[2] ?? '').trim()}]`);
    console.log(`${r.status} ${r.headers.get('content-type') ?? ''} ${items} éléments  ${url}`);
    titres.forEach(x => console.log('     · ' + x));
  }catch(err){ console.log(`ERREUR ${err.message}  ${url}`); }
}
