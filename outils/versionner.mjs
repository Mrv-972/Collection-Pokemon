import { readdir, readFile, writeFile } from 'node:fs/promises';

const version = new Date().toISOString().slice(0, 10) + '-'
  + Math.random().toString(36).slice(2, 6);

const pages = (await readdir('.')).filter(f => f.endsWith('.html'));
let total = 0;

for(const page of pages){
  const avant = await readFile(page, 'utf8');
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
