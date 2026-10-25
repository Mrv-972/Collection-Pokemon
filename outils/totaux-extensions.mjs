import { readFile, readdir, writeFile } from 'node:fs/promises';

const i = process.argv.indexOf('--sortie');
const sortie = i > 0 ? process.argv[i + 1] : 'donnees';

const totaux = {};
for(const univers of ['physique', 'pocket']){
  const dossier = `${sortie}/${univers}/sets`;
  for(const fichier of (await readdir(dossier)).filter(f => f.endsWith('.json')).sort()){
    const cartes = JSON.parse(await readFile(`${dossier}/${fichier}`, 'utf8'));
    for(const c of cartes){
      const id = String(c.id).replace(/-[^-]+$/, '');
      totaux[id] = (totaux[id] ?? 0) + 1;
    }
  }
}

await writeFile(`${sortie}/totaux-extensions.json`, JSON.stringify(totaux) + '\n');
const n = Object.keys(totaux).length;
console.log(`${n} extensions, ${Object.values(totaux).reduce((s, t) => s + t, 0)} cartes → ${sortie}/totaux-extensions.json`);
