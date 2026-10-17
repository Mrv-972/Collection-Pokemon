#!/usr/bin/env node
//
// Sonde : les pages qui décrivent les missions secrètes récentes
// ==============================================================
//
// Lit une liste de pages (guides francophones, guides anglophones, wiki) et
// en dépose le texte dans donnees/missions-pages.json, pour relecture. Elle
// ne décide de rien : c'est le recoupement à la main qui fait foi. Le
// fichier est un brouillon de travail, retiré une fois les missions saisies.
//
// Tourne sur un serveur GitHub : le poste de travail n'a pas accès à ces
// sites.

import { writeFileSync, mkdirSync } from 'node:fs';

const IDENTITE = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/json',
};

const BULBA = page => `https://bulbapedia.bulbagarden.net/w/api.php?action=parse&format=json&prop=wikitext&page=${encodeURIComponent(page)}`;

const PAGES = [
  // Guides francophones
  'https://gamewave.fr/pokemon-pocket/pokemon-pocket-les-missions-secretes-de-domination-celeste-et-comment-les-valider/',
  'https://gamewave.fr/pokemon-pocket/pokemon-pocket-les-missions-secretes-de-l-ambition-de-la-team-rocket-et-comment-les-valider/',
  'https://gamewave.fr/pokemon-pocket/pokemon-pocket-tout-savoir-sur-l-extension-booster-de-luxe-mega/',
  'https://gamewave.fr/pokemon-pocket/pokemon-pocket-les-missions-secretes-de-booster-de-luxe-mega-et-comment-les-valider/',
  'https://gamewave.fr/pokemon-pocket/pokemon-pocket-les-missions-secretes-de-jours-heureux-et-comment-les-valider/',
  'https://www.eternia.fr/dossier/pokemon-pocket-collections-par-theme-domination-celeste',
  'https://www.eternia.fr/dossier/pokemon-pocket-collections-par-theme-lambition-de-la-team-rocket',
  'https://www.eternia.fr/dossier/pokemon-pocket-collections-par-theme-booster-de-luxe-mega',
  'https://www.eternia.fr/dossier/pokemon-pocket-collections-par-theme-jours-heureux',
  // Guides anglophones
  'https://pokemongohub.net/post/tcg-pocket/pokemon-tcg-pocket-ruler-of-the-skies-all-themed-collection-and-secret-missions/',
  'https://pokemongohub.net/post/tcg-pocket/pokemon-tcg-pocket-team-rockets-ambition-all-themed-collection-and-secret-missions/',
  'https://pokemongohub.net/post/tcg-pocket/pokemon-tcg-pocket-deluxe-pack-mega-all-themed-collection-and-secret-missions/',
  'https://www.pokemon-zone.com/themed-collections/multiple-expansions/',
  'https://www.pokemon-zone.com/themed-collections/b3b/',
  'https://www.pokemon-zone.com/themed-collections/b4/',
  'https://www.pokemon-zone.com/themed-collections/b4a/',
  'https://www.pokemon-zone.com/themed-collections/b4b/',
  // Wiki anglophone, texte source structuré
  BULBA('Everyday Wonders (TCG Pocket)'),
  BULBA('Ruler of the Skies (TCG Pocket)'),
  BULBA("Team Rocket's Ambition (TCG Pocket)"),
  BULBA('Deluxe Pack: Mega (TCG Pocket)'),
  BULBA('Mission (TCG Pocket)'),
];

function enTexte(html){
  return html
    .replace(/<script(?![^>]*__NEXT_DATA__)[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, ' [$1] ')
    .replace(/<a[^>]*\bhref="([^"]*(?:secret|mission|collection)[^"]*)"[^>]*>/gi, ' <$1> ')
    .replace(/<\/(h[1-6]|p|li|tr|div|section|table)>/gi, '\n')
    .replace(/<h([1-6])[^>]*>/gi, (_, n) => '\n' + '#'.repeat(Number(n)) + ' ')
    .replace(/<li[^>]*>/gi, '\n  - ')
    .replace(/<(br|td|th)[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à')
    .replace(/&ecirc;/g, 'ê').replace(/&ccedil;/g, 'ç').replace(/&ocirc;/g, 'ô')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function principal(){
  const pages = [];
  for(const adresse of PAGES){
    try{
      const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
      const corps = await r.text();
      let texte;
      if(adresse.includes('api.php')){
        try{ texte = JSON.parse(corps)?.parse?.wikitext?.['*'] ?? corps.slice(0, 2000); }
        catch{ texte = corps.slice(0, 2000); }
      }else{
        texte = enTexte(corps);
      }
      // Les données embarquées d'une page construite en JavaScript.
      const donnees = corps.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? null;
      pages.push({ adresse, statut: r.status, final: r.url, texte: texte.slice(0, 120000),
        donnees: donnees ? donnees.slice(0, 300000) : null });
      console.log(`${r.status} ${texte.length} car.${donnees ? ` + données ${donnees.length}` : ''} — ${adresse}`);
    }catch(err){
      pages.push({ adresse, erreur: err.message });
      console.log(`ÉCHEC ${err.message} — ${adresse}`);
    }
  }
  mkdirSync('donnees', { recursive: true });
  writeFileSync('donnees/missions-pages.json', JSON.stringify({ releve: new Date().toISOString(), pages }, null, 1) + '\n');
}

principal().catch(err => { console.error(err); process.exit(1); });
