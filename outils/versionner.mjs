// Estampille les fichiers JS appelés par les pages.
//
// GitHub Pages dit aux navigateurs de garder les fichiers un moment. C'est
// bien pour la vitesse, mais quand le code change, un visiteur peut se
// retrouver avec l'ancien script et les nouvelles données — ou l'inverse. Il
// n'a alors aucun moyen de le savoir, et « recharge en forçant » n'est pas
// une réponse acceptable.
//
// On ajoute donc un numéro de version à chaque appel :
//
//     <script src="catalogue.js?v=2026-09-19-3">
//
// Le navigateur voit une autre adresse et va rechercher le fichier. À lancer
// après toute modification d'un .js :
//
//     node outils/versionner.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';

const version = new Date().toISOString().slice(0, 10) + '-'
  + Math.random().toString(36).slice(2, 6);

const pages = (await readdir('.')).filter(f => f.endsWith('.html'));
let total = 0;

for(const page of pages){
  const avant = await readFile(page, 'utf8');
  // Uniquement nos propres fichiers : les adresses complètes sont servies
  // par des CDN qui gèrent déjà leurs versions.
  const apres = avant.replace(
    /(<script src=")([a-z0-9-]+\.js)(\?v=[^"]*)?(")/g,
    (_, debut, fichier, __, fin) => `${debut}${fichier}?v=${version}${fin}`);
  if(apres !== avant){
    await writeFile(page, apres, 'utf8');
    total += (apres.match(/\?v=/g) ?? []).length;
    console.log(`  ${page}`);
  }
}
console.log(`\n${total} appels estampillés « ${version} »`);
