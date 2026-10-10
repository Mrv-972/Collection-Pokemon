// Le serveur des CARTES de Pokécardex sert-il vraiment ses images ?
// ==================================================================
//
// Après branchement, la vérification a compté 118 cartes de plus SANS
// visuel : des cartes qui s'affichaient en anglais pointent désormais vers
// Pokécardex, et cette adresse ne répond pas.
//
// Erreur à moi : l'autorisation d'affichage (CORS) avait été vérifiée sur
// pokecardex.b-cdn.net — leurs symboles — et PAS sur
// pokecardex-scans.b-cdn.net, le serveur des cartes. Deux serveurs, que
// j'ai supposés identiques.
//
// On teste donc, sur de vraies adresses relevées, chaque variable qui peut
// faire échouer l'affichage :
//   — la méthode : la vérification demande l'en-tête seul (HEAD), un
//     navigateur demande l'image (GET). Un serveur peut refuser l'un et
//     servir l'autre ;
//   — le paramètre « ?class=md » que le moissonneur a retiré ;
//   — l'origine de la demande (Referer), certains CDN refusant qu'on
//     affiche leurs images ailleurs que chez eux.
//
//   node outils/sonde-pokecardex-scans.mjs

import { readFile } from 'node:fs/promises';

const releve = JSON.parse(await readFile('donnees/visuels-pokecardex.json', 'utf8'));
const verif = JSON.parse(await readFile('donnees/verification-visuels.json', 'utf8'));
const extensions = JSON.parse(await readFile('donnees/physique/extensions.json', 'utf8'));

// Des cartes réellement concernées : servies par Pokécardex et comptées
// sans visuel par la vérification.
const echantillon = [];
for(const [id, e] of Object.entries(verif.extensions)){
  for(const c of (e.cartesManquantes ?? []).slice(0, 2)){
    let cartes; try{ cartes = JSON.parse(await readFile(`donnees/physique/sets/${id}.json`, 'utf8')); }catch{ continue; }
    const carte = cartes.find(x => x.id === c.id);
    if(carte?.imageSecours?.includes('pokecardex')) echantillon.push({ id: c.id, adresse: carte.imageSecours });
  }
  if(echantillon.length >= 6) break;
}
// Et quelques adresses prises directement dans le relevé, pour comparer.
for(const [code, s] of Object.entries(releve.series).slice(0, 3)){
  const [num, c] = Object.entries(s.cartes)[0];
  echantillon.push({ id: `${code}-${num} (relevé)`, adresse: c.adresse });
}

const NAV = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
async function essai(adresse, { methode = 'GET', referer = null } = {}){
  try{
    const h = { 'User-Agent': NAV, Accept: 'image/avif,image/webp,image/*,*/*' };
    if(referer) h.Referer = referer;
    const r = await fetch(adresse, { method: methode, headers: h, redirect: 'follow' });
    const t = methode === 'GET' ? (await r.arrayBuffer()).byteLength : '-';
    return `${r.status} ${String(r.headers.get('content-type') ?? '').slice(0, 11).padEnd(11)} ${String(t).padStart(7)} o  cors=${r.headers.get('access-control-allow-origin') ?? 'ABSENT'}`;
  }catch(err){ return `réseau : ${err.message}`; }
}

for(const { id, adresse } of echantillon){
  console.log(`\n${id}\n  ${adresse}`);
  console.log(`  HEAD                  ${await essai(adresse, { methode: 'HEAD' })}`);
  console.log(`  GET                   ${await essai(adresse)}`);
  console.log(`  GET ?class=md         ${await essai(adresse + '?class=md')}`);
  console.log(`  GET + referer GitHub  ${await essai(adresse, { referer: 'https://mrv-972.github.io/' })}`);
  console.log(`  GET + referer leur    ${await essai(adresse, { referer: 'https://www.pokecardex.com/' })}`);
}
