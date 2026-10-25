import { readFile, writeFile } from 'node:fs/promises';
import { sansTiretPartout } from './typographie.mjs';

const i = process.argv.indexOf('--sortie');
const SORTIE = i > 0 ? process.argv[i + 1] : 'donnees';
const API = 'https://www.pokepedia.fr/api.php';
const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (origine des noms ; github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
const dormir = ms => new Promise(r => setTimeout(r, ms));
const POKEDEX_FR = new Function((await readFile('pokedex-fr.js', 'utf8')) + '\nreturn POKEDEX_FR;')();

function modele(contenu){
  const parties = contenu.split('|').map(s => s.trim());
  const positionnels = parties.slice(1).filter(p => !/^[\w ]+=/.test(p));
  return positionnels.length ? positionnels[positionnels.length - 1] : '';
}

function lien(contenu){
  const [cible, ...texte] = contenu.split('|');
  if(/^(fichier|file|image|catégorie|category)\s*:/i.test(cible.replace(/^:/, ''))) return '';
  if(texte.length) return texte.join('|');
  return cible.replace(/^:?(wp|w|en|ja)?:?/i, '').replace(/#.*/, '');
}

function apostrophes(ligne){
  const t = ligne.split(/(''+)/);
  let italiques = 0, gras = 0;
  for(let k = 1; k < t.length; k += 2){
    let n = t[k].length;
    if(n === 4){ t[k - 1] += "'"; t[k] = "'''"; n = 3; }
    else if(n > 5){ t[k - 1] += "'".repeat(n - 5); t[k] = "'''''"; n = 5; }
    if(n === 2) italiques++;
    else if(n === 3) gras++;
    else { italiques++; gras++; }
  }
  if(italiques % 2 === 1 && gras % 2 === 1){
    let lettre = -1, mot = -1, espace = -1;
    for(let k = 1; k < t.length; k += 2){
      if(t[k].length !== 3) continue;
      const x1 = t[k - 1].slice(-1), x2 = t[k - 1].slice(-2, -1);
      if(x1 === ' '){ if(espace === -1) espace = k; }
      else if(x2 === ' '){ lettre = k; break; }
      else if(mot === -1) mot = k;
    }
    const k = lettre > -1 ? lettre : mot > -1 ? mot : espace;
    if(k > -1){ t[k] = "''"; t[k - 1] += "'"; }
  }
  let ouvert = false, sortie = '';
  t.forEach((morceau, k) => {
    if(k % 2 === 0){ sortie += morceau; return; }
    if(morceau.length !== 2){ sortie += '**'; ouvert = !ouvert; }
  });
  return ouvert ? sortie + '**' : sortie;
}

function texteBrut(wiki){
  let t = wiki
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  for(let tour = 0; tour < 8 && /\{\{/.test(t); tour++) t = t.replace(/\{\{([^{}]*)\}\}/g, (_, c) => modele(c));
  for(let tour = 0; tour < 4 && /\[\[/.test(t); tour++) t = t.replace(/\[\[([^\[\]]*)\]\]/g, (_, c) => lien(c));
  t = t.replace(/\[https?:\/\/[^\s\]]+(?:\s+([^\]]*))?\]/g, (_, texte) => texte ?? '');
  t = apostrophes(t)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([.,;)])/g, '$1').replace(/\(\s+/g, '(')
    .trim();
  return t;
}

const propre = t => t && t.length >= 12 && !/\{\{|\}\}|\[\[|\]\]|\|/.test(t);

function section(wiki, motif, niveau){
  const titre = new RegExp(`^={${niveau}}\\s*(?:${motif})\\s*={${niveau}}\\s*$`, 'mi');
  const m = titre.exec(wiki);
  if(!m) return null;
  const suite = wiki.slice(m.index + m[0].length);
  const fin = suite.search(new RegExp(`^={2,${niveau}}[^=]`, 'm'));
  return fin === -1 ? suite : suite.slice(0, fin);
}

const LANGUES = { fr: /français/i, en: /anglais/i, ja: /japonais/i, de: /allemand/i };

function etymologies(wiki){
  const bloc = section(wiki, 'Étymologies?|Origine du nom', 3) ?? section(wiki, 'Étymologies?', 2);
  if(!bloc) return {};
  const res = {};
  let derniere = [];
  for(const ligne of bloc.split('\n')){
    const m = /^\*(?!\*)\s*([^:]{2,60}?)\s*:\s*(.+)$/.exec(ligne);
    if(m){
      derniere = Object.entries(LANGUES).filter(([, motif]) => motif.test(m[1])).map(([cle]) => cle);
      const texte = texteBrut(m[2]);
      for(const cle of derniere) if(!res[cle] && propre(texte)) res[cle] = texte;
      continue;
    }
    const sous = /^\*\*+\s*(.+)$/.exec(ligne);
    if(sous) for(const cle of derniere) if(res[cle]){
      const texte = texteBrut(sous[1]);
      if(propre(texte) && res[cle].length + texte.length < 900) res[cle] += ' ' + texte;
    }
  }
  return res;
}

function anecdotes(wiki){
  const bloc = section(wiki, 'Anecdotes?', 2);
  if(!bloc) return [];
  const sansNotes = l => l.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  return bloc.split('\n')
    .filter(l => /^\*(?!\*)/.test(l) && !/\{\{/.test(sansNotes(l)))
    .map(l => texteBrut(l.replace(/^\*\s*/, '')))
    .filter(t => propre(t) && t.length >= 40 && t.length <= 420)
    .slice(0, 4);
}

async function lirePages(titres){
  const url = API + '?' + new URLSearchParams({
    action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
    titles: titres.join('|'), redirects: '1', format: 'json', formatversion: '2',
  });
  for(let essai = 1; ; essai++){
    try{
      const r = await fetch(url, { headers: IDENTITE });
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }catch(err){
      if(essai >= 4) throw err;
      await dormir(4000 * essai);
    }
  }
}

const noms = [], recits = [], manquants = [], avecModeles = [], renvois = [];
const PAQUET = 50;
for(let debut = 0; debut < POKEDEX_FR.length; debut += PAQUET){
  const titres = POKEDEX_FR.slice(debut, debut + PAQUET);
  const d = await lirePages(titres);
  const normalise = new Map((d.query?.normalized ?? []).map(x => [x.from, x.to]));
  const redirige = new Map((d.query?.redirects ?? []).map(x => [x.from, x.to]));
  const pages = new Map((d.query?.pages ?? []).map(p => [p.title, p]));
  titres.forEach((nom, k) => {
    const numero = debut + k + 1;
    const t1 = normalise.get(nom) ?? nom;
    const titre = redirige.get(t1) ?? t1;
    if(titre !== nom) renvois.push(`${numero} ${nom} → ${titre}`);
    const wiki = pages.get(titre)?.revisions?.[0]?.slots?.main?.content;
    if(!wiki){ manquants.push(`${numero} ${nom}`); return; }
    const e = etymologies(wiki);
    const bloc = section(wiki, 'Étymologies?|Origine du nom', 3) ?? '';
    if(/\{\{/.test(bloc.replace(/<ref[\s\S]*?(\/>|<\/ref>)/gi, ''))) avecModeles.push(`${numero} ${nom} : ${e.fr ?? ''}`);
    if(!e.fr) manquants.push(`${numero} ${nom} (sans étymologie française)`);
    noms.push({ n: numero, nom, page: titre, ...e });
    const a = anecdotes(wiki);
    if(a.length) recits.push({ n: numero, nom, page: titre, textes: a });
  });
  console.log(`${Math.min(debut + PAQUET, POKEDEX_FR.length)} / ${POKEDEX_FR.length}`);
  await dormir(1200);
}

const LICENCE = {
  source: 'Poképédia (https://www.pokepedia.fr)',
  licence: 'CC BY-NC-SA 3.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/3.0/deed.fr',
};
const majLe = new Date().toISOString();
await writeFile(`${SORTIE}/noms-pokemon.json`, JSON.stringify(sansTiretPartout({ majLe, ...LICENCE, pokemon: noms })) + '\n');
await writeFile(`${SORTIE}/anecdotes-pokemon.json`, JSON.stringify(sansTiretPartout({ majLe, ...LICENCE, anecdotes: recits })) + '\n');

const avecFr = noms.filter(x => x.fr).length;
console.log(`\nétymologie française : ${avecFr} / ${POKEDEX_FR.length}`);
console.log(`anecdotes : ${recits.reduce((s, x) => s + x.textes.length, 0)} pour ${recits.length} Pokémon`);
console.log('exemples :');
for(const n of [1, 25, 143, 1025]){
  const x = noms.find(y => y.n === n);
  console.log(`  ${n} ${x?.nom} : ${x?.fr ?? '(rien)'}`);
}
if(manquants.length) console.log(`\nà revoir (${manquants.length}) :\n  ${manquants.join('\n  ')}`);
if(renvois.length) console.log(`\nnoms écrits autrement sur Poképédia (${renvois.length}) :\n  ${renvois.join('\n  ')}`);
if(avecModeles.length) console.log(`\nétymologies passées par des modèles (${avecModeles.length}), à relire :\n  ${avecModeles.slice(0, 60).join('\n  ')}`);
if(avecFr < POKEDEX_FR.length * 0.9){
  console.error('Trop peu d\'étymologies trouvées : fichiers non publiés.');
  process.exit(1);
}
