#!/usr/bin/env node
//
// Sonde : les pages qui décrivent les missions secrètes récentes
// ==============================================================
//
// Lit une liste de pages (guides, wiki, archives du web) et
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

// Pokémon GO Hub publie une page par extension : une collection qui mêle
// plusieurs extensions y figure dans celle de l'extension qui l'introduit.
const GOHUB = nom => `https://pokemongohub.net/post/tcg-pocket/pokemon-tcg-pocket-${nom}-all-themed-collection-and-secret-missions/`;

const PAGES = [
  GOHUB('mega-rising'),
  GOHUB('crimson-blaze'),
  GOHUB('fantastical-parade'),
  GOHUB('paldean-wonders'),
  GOHUB('mega-shine'),
  GOHUB('pulsing-aura'),
  GOHUB('paradox-drive'),
  GOHUB('everyday-wonders'),
  GOHUB('deluxe-pack-ex'),
  'https://game8.co/games/Pokemon-TCG-Pocket/archives/483769',
  'https://gamewave.fr/pokemon-pocket/pokemon-pocket-les-missions-secretes-de-booster-de-luxe-ex-et-comment-les-valider/',
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
  const pause = ms => new Promise(f => setTimeout(f, ms));
  for(const adresse of PAGES){
    try{
      // L'archive limite le rythme : une page toutes les quelques secondes,
      // et on patiente davantage quand elle demande de ralentir.
      let r, corps;
      for(let essai = 0; essai < 5; essai++){
        await pause(essai === 0 ? 4000 : 15000 * essai);
        r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
        corps = await r.text();
        if(r.status !== 429) break;
        console.log(`  429, nouvel essai — ${adresse}`);
      }
      let texte;
      texte = enTexte(corps);
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
