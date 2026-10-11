// Le nombre de cartes de chaque extension, pour le badge « Extension complète ».
// ==============================================================================
//
// Le badge se calcule dans la base (supabase/communaute.sql, badges_de) :
// elle doit savoir combien de cartes compte chaque extension. Ce nombre vient
// des fichiers du site ; ce script le résume dans donnees/totaux-extensions.json,
// à chaque construction nocturne (.github/workflows/instantane.yml).
//
// La base le reçoit ensuite du navigateur de l'administrateur, au plus une
// fois par jour, quand il ouvre le site (admin-site.js) : aucune clé secrète
// à ranger nulle part, et seule une session d'administrateur peut l'écrire.
//
//   node outils/totaux-extensions.mjs [--sortie donnees]

import { readFile, readdir, writeFile } from 'node:fs/promises';

const i = process.argv.indexOf('--sortie');
const sortie = i > 0 ? process.argv[i + 1] : 'donnees';

const totaux = {};
for(const univers of ['physique', 'pocket']){
  const dossier = `${sortie}/${univers}/sets`;
  for(const fichier of (await readdir(dossier)).filter(f => f.endsWith('.json')).sort()){
    const cartes = JSON.parse(await readFile(`${dossier}/${fichier}`, 'utf8'));
    // L'extension telle que la base la déduit d'un identifiant de carte
    // (tout ce qui précède le dernier tiret) : les deux doivent concorder.
    for(const c of cartes){
      const id = String(c.id).replace(/-[^-]+$/, '');
      totaux[id] = (totaux[id] ?? 0) + 1;
    }
  }
}

await writeFile(`${sortie}/totaux-extensions.json`, JSON.stringify(totaux) + '\n');
const n = Object.keys(totaux).length;
console.log(`${n} extensions, ${Object.values(totaux).reduce((s, t) => s + t, 0)} cartes → ${sortie}/totaux-extensions.json`);
