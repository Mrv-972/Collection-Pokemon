#!/usr/bin/env node
//
// Combien pèseraient les visuels qu'on n'a pas encore ?
//
// Les 1366 cartes récoltées chez le wiki pèsent 93 Ko pièce. Les 2497 autres
// viennent de TCGdex, qui propose deux définitions par carte — « low » pour
// les grilles, « high » pour le zoom. Copier les deux, ou une seule, ou
// aucune, ne se décide pas au jugé : ça se pèse.

import { readFile, readdir } from 'node:fs/promises';

const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (+https://github.com/Mrv-972/Collection-Pokemon)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

const ko = o => `${(o / 1024).toFixed(0)} Ko`;
const mo = o => `${(o / 1048576).toFixed(0)} Mo`;

async function poids(adresse){
  try{
    const r = await fetch(adresse, { method: 'HEAD', redirect: 'follow', headers: IDENTITE });
    if(!r.ok) return null;
    const n = Number(r.headers.get('content-length'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }catch(err){ return null; }
}

const moyenne = t => t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0;

async function principal(){
  const dejaLa = new Set((await readdir('images/cards')).map(f => f.replace(/\.[^.]+$/, '')));
  const extensions = JSON.parse(await readFile('donnees/pocket/extensions.json', 'utf8'));

  const restantes = [];
  for(const ext of extensions){
    const cartes = JSON.parse(await readFile(`donnees/pocket/sets/${ext.id}.json`, 'utf8'));
    for(const c of cartes) if(!dejaLa.has(c.id)) restantes.push(c);
  }
  console.log(`${dejaLa.size} visuels déjà dans le dépôt.`);
  console.log(`${restantes.length} cartes Pocket encore servies par un serveur extérieur.\n`);
  if(!restantes.length) return;

  // Un échantillon réparti sur tout le catalogue, pas les trente premières :
  // les extensions récentes sont souvent plus lourdes que les anciennes.
  const pas = Math.max(1, Math.floor(restantes.length / 30));
  const echantillon = restantes.filter((_, i) => i % pas === 0).slice(0, 30);

  const bas = [], hauts = [];
  for(const c of echantillon){
    const [b, h] = await Promise.all([poids(c.image), c.imageHaute ? poids(c.imageHaute) : null]);
    if(b) bas.push(b);
    if(h) hauts.push(h);
  }

  console.log(`Échantillon de ${echantillon.length} cartes :`);
  console.log(`  définition d'affichage  ${ko(moyenne(bas))} en moyenne  (${bas.length} mesurées)`);
  console.log(`  haute définition        ${hauts.length ? ko(moyenne(hauts)) : '—'}  (${hauts.length} mesurées)`);

  console.log(`\nSi on copiait tout dans le dépôt :`);
  console.log(`  affichage seul          + ${mo(moyenne(bas) * restantes.length)}`);
  if(hauts.length){
    console.log(`  haute définition seule  + ${mo(moyenne(hauts) * restantes.length)}`);
    console.log(`  les deux                + ${mo((moyenne(bas) + moyenne(hauts)) * restantes.length)}`);
  }

  const dejaOctets = 124 * 1048576;   // les 1366 du wiki, mesurés
  console.log(`\nLe dossier pèse aujourd'hui ~${mo(dejaOctets)}. Il passerait à :`);
  console.log(`  affichage seul          ~${mo(dejaOctets + moyenne(bas) * restantes.length)}`);
  if(hauts.length) console.log(`  les deux                ~${mo(dejaOctets + (moyenne(bas) + moyenne(hauts)) * restantes.length)}`);
}

principal().catch(err => { console.error('Échec :', err.message); process.exit(1); });
