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
    // Le niveau de titre est ce qui distingue une extension d'une mission :
    // on le garde, sous forme de dièses, plutôt que de tout aplatir.
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

// ------------------------------------------------------- mise en forme ----
//
// Le guide écrit toujours la même chose, dans le même ordre :
//
//     ## Musée de la Source Secrète 1
//       - Carte(s) à obtenir : Milobellus (72/071), Limonde (73/071)…
//       - Récompenses : 12 sabliers booster, 36 sabliers miracle…
//
// Un titre suivi d'une ligne « Carte(s) à obtenir » est donc une mission ;
// tout autre titre est une section, et la plus proche au-dessus donne
// l'extension. On ne devine rien de plus : ce qui ne rentre pas dans ce
// moule est laissé de côté plutôt que deviné de travers.

function lignes(texte){
  return texte.split('\n').map(l => l.trim()).filter(Boolean);
}

// « Milobellus (72/071) » → { nom: 'Milobellus', numero: 72, total: 71 }
function cartesDeLaLigne(ligne){
  const apres = ligne.replace(/^[-•\s]*Cartes?\(?s?\)?\s*à obtenir\s*:\s*/i, '');
  const cartes = [];
  for(const m of apres.matchAll(/([^,()]+?)\s*\((\d+)\s*\/\s*(\d+)\)/g)){
    const nom = m[1].replace(/^(et|ou)\s+/i, '').replace(/^[-–—\s]+/, '').trim();
    if(nom) cartes.push({ nom, numero: Number(m[2]), total: Number(m[3]) });
  }
  // Certaines missions ne listent pas des cartes nommées mais une condition
  // (« trois cartes chromatiques deux étoiles ») : on garde la phrase telle
  // quelle, à charge pour la relecture de décider quoi en faire.
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

const SORTIE = 'donnees/missions-brutes.json';

async function principal(){
  const choisi = process.argv[2] !== undefined && process.argv[2] !== ''
    ? Number(process.argv[2]) : null;
  const guides = choisi !== null ? [[choisi, GUIDES[choisi]]] : GUIDES.entries();

  const recolte = [];
  for(const [numero, adresse] of guides){
    process.stdout.write(`Guide ${numero} — ${adresse}\n`);
    try{
      const texte = partieUtile(enTexte(await lire(adresse)));
      const sections = analyser(texte);
      // Un guide dont la mise en forme ne ressemble pas au moule attendu
      // repart avec son texte : il sera relu à la main plutôt que perdu.
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
  writeFileSync(SORTIE, JSON.stringify({
    releve: new Date().toISOString().slice(0, 10),
    avertissement: "Relevé brut de guides rédigés à la main. À relire avant usage : aucune de ces lignes n'a été vérifiée dans le jeu.",
    recolte,
  }, null, 2) + '\n');
  console.log(`\nÉcrit dans ${SORTIE}`);
}

principal().catch(err => { console.error(err); process.exit(1); });
