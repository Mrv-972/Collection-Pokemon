#!/usr/bin/env node

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

function enTexte(html){
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(h[1-6]|p|li|tr|div|section|table)>/gi, '\n')
    .replace(/<h([1-6])[^>]*>/gi, (_, n) => '\n' + '#'.repeat(Number(n)) + ' ')
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

function partieUtile(texte){
  const debut = texte.search(/mission|collection à thème|collections à thème/i);
  return debut > 0 ? texte.slice(Math.max(0, debut - 200)) : texte;
}

async function lire(adresse){
  const r = await fetch(adresse, { headers: IDENTITE, redirect: 'follow' });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

function lignes(texte){
  return texte.split('\n').map(l => l.trim()).filter(Boolean);
}

function cartesDeLaLigne(ligne){
  const apres = ligne.replace(/^[-•\s]*Cartes?\(?s?\)?\s*à obtenir\s*:\s*/i, '');
  const cartes = [];
  for(const m of apres.matchAll(/([^,()]+?)\s*\((\d+)\s*\/\s*(\d+)\)/g)){
    const nom = m[1].replace(/^(et|ou)\s+/i, '').replace(/^[-\u2013\u2014\s]+/, '').trim();
    if(nom) cartes.push({ nom, numero: Number(m[2]), total: Number(m[3]) });
  }
  return cartes.length ? cartes : [{ condition: apres.trim() }];
}

function analyser(texte){
  const sections = [];
  let section = null, mission = null;
  const brut = lignes(texte);

  brut.forEach((ligne, i) => {
    const titre = ligne.match(/^(#{1,6})\s+(.*)$/);
    if(titre){
      const suivante = brut[i + 1] ?? '';
      if(/Cartes?\(?s?\)?\s*à obtenir/i.test(suivante)){
        mission = { nom: titre[2].trim(), cartes: [], recompense: null };
        (section ?? (sections.push(section = { titre: '(sans section)', missions: [] }), section))
          .missions.push(mission);
      }else{
        sections.push(section = { titre: titre[2].trim(), niveau: titre[1].length, missions: [] });
        mission = null;
      }
      return;
    }
    if(!mission) return;
    if(/Cartes?\(?s?\)?\s*à obtenir/i.test(ligne)) mission.cartes = cartesDeLaLigne(ligne);
    else if(/^[-•\s]*Récompenses?\s*:/i.test(ligne)){
      mission.recompense = ligne.replace(/^[-•\s]*Récompenses?\s*:\s*/i, '').replace(/\s*\|\s*$/, '').trim();
    }
  });

  return sections.filter(s => s.missions.length);
}

import { writeFileSync, mkdirSync } from 'node:fs';
import { sansTiretPartout } from './typographie.mjs';

const SORTIE = 'donnees/missions-brutes.json';

async function principal(){
  const choisi = process.argv[2] !== undefined && process.argv[2] !== ''
    ? Number(process.argv[2]) : null;
  const guides = choisi !== null ? [[choisi, GUIDES[choisi]]] : GUIDES.entries();

  const recolte = [];
  for(const [numero, adresse] of guides){
    process.stdout.write(`Guide ${numero} : ${adresse}\n`);
    try{
      const texte = partieUtile(enTexte(await lire(adresse)));
      const sections = analyser(texte);
      recolte.push(sections.length
        ? { guide: adresse, sections }
        : { guide: adresse, sections: [], texte: texte.slice(0, 40000) });
      const missions = sections.reduce((n, s) => n + s.missions.length, 0);
      console.log(`  ${sections.length} sections, ${missions} missions`);
      for(const s of sections){
        console.log(`    ${String(s.missions.length).padStart(3)} × ${s.titre.slice(0, 60)}`);
      }
    }catch(err){
      console.log(`  lecture impossible : ${err.message}`);
    }
  }

  mkdirSync('donnees', { recursive: true });
  writeFileSync(SORTIE, JSON.stringify(sansTiretPartout({
    releve: new Date().toISOString().slice(0, 10),
    avertissement: "Relevé brut de guides rédigés à la main. À relire avant usage : aucune de ces lignes n'a été vérifiée dans le jeu.",
    recolte,
  }), null, 2) + '\n');
  console.log(`\nÉcrit dans ${SORTIE}`);
}

principal().catch(err => { console.error(err); process.exit(1); });
