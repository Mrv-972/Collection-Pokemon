#!/usr/bin/env node
//
// Lire les guides francophones sur les missions secrètes
// ======================================================
//
// Les missions secrètes de Pokémon TCG Pocket ne figurent dans aucune base
// de données ouverte : ni TCGdex, ni le jeu de données de flibustier, ni le
// wiki francophone ne les répertorient. Elles ne vivent que dans des guides
// rédigés à la main.
//
// Cet outil va les lire et recrache leur texte. Il ne décide de rien : le
// tri, la vérification et la mise en forme se font ensuite à la main, en
// recoupant plusieurs guides. Un guide qui se trompe sur une carte ferait
// chercher pour rien une mission impossible.
//
// Il tourne sur un serveur GitHub, jamais dans la construction nocturne :
// c'est une lecture ponctuelle, pas une dépendance du site.

const IDENTITE = {
  'User-Agent': 'Mozilla/5.0 (compatible; PokeClasseur/1.0; +https://github.com/Mrv-972/Collection-Pokemon)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Accept': 'text/html,application/xhtml+xml',
};

const GUIDES = [
  'https://www.millenium.org/guide/420948.html',
  'https://www.dexerto.fr/pokemon/missions-secretes-jcc-pokemon-pocket-1594060/',
  'https://www.projectdiva.fr/article/missions-secretes-pokemon-tcg-pocket-liste-complete-collections-theme',
  'https://booster-breakerz.fr/mission-secrete-pokemon-pocket-liste-complete-solutions-et-guide-des-cartes-cachees',
  'https://www.realite-virtuelle.com/pokemon-tcg-pocket-les-missions-secretes-et-leurs-recompenses/',
  'https://www.next-stage.fr/2026/03/toutes-missions-secretes-mega-shine-pokemon-tcg-pocket.html',
];

// Une page de guide, c'est 95 % de menus, de bandeaux et de publicité. On
// retire ce qui ne se lit pas, puis on garde la structure des titres et des
// listes : c'est elle qui porte le découpage « extension → mission → cartes ».
function enTexte(html){
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(h[1-6]|p|li|tr|div|section|table)>/gi, '\n')
    .replace(/<(h[1-6])[^>]*>/gi, '\n## ')
    .replace(/<li[^>]*>/gi, '\n  - ')
    .replace(/<(br|td|th)[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à')
    .replace(/&ecirc;/g, 'ê').replace(/&ccedil;/g, 'ç').replace(/&ocirc;/g, 'ô')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// Le texte utile commence là où l'on parle de missions. Tout ce qui précède
// est du bandeau de site ; tout ce qui suit la fin de l'article aussi.
function partieUtile(texte){
  const debut = texte.search(/mission|collection à thème|collections à thème/i);
  return debut > 0 ? texte.slice(Math.max(0, debut - 200)) : texte;
}

async function lire(adresse){
  const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

async function principal(){
  const choisi = process.argv[2] ? Number(process.argv[2]) : null;
  const limite = Number(process.env.LIMITE_CARACTERES || 28000);
  const guides = choisi !== null ? [GUIDES[choisi]] : GUIDES;

  for(const [i, adresse] of guides.entries()){
    const numero = choisi !== null ? choisi : i;
    console.log(`\n${'='.repeat(74)}\n=== GUIDE ${numero} : ${adresse}\n${'='.repeat(74)}`);
    try{
      const texte = partieUtile(enTexte(await lire(adresse)));
      console.log(`(${texte.length} caractères utiles)\n`);
      console.log(texte.slice(0, limite));
      if(texte.length > limite){
        console.log(`\n[…coupé à ${limite} caractères. Relancer avec LIMITE_CARACTERES plus grand.]`);
      }
    }catch(err){
      console.log(`Lecture impossible : ${err.message}`);
    }
  }
}

principal().catch(err => { console.error(err); process.exit(1); });
