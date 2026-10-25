import { readFile } from 'node:fs/promises';

const releve = JSON.parse(await readFile('donnees/visuels-pokecardex.json', 'utf8'));
const verif = JSON.parse(await readFile('donnees/verification-visuels.json', 'utf8'));
const extensions = JSON.parse(await readFile('donnees/physique/extensions.json', 'utf8'));

const echantillon = [];
for(const [id, e] of Object.entries(verif.extensions)){
  for(const c of (e.cartesManquantes ?? []).slice(0, 2)){
    let cartes; try{ cartes = JSON.parse(await readFile(`donnees/physique/sets/${id}.json`, 'utf8')); }catch{ continue; }
    const carte = cartes.find(x => x.id === c.id);
    if(carte?.imageSecours?.includes('pokecardex')) echantillon.push({ id: c.id, adresse: carte.imageSecours });
  }
  if(echantillon.length >= 6) break;
}
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
