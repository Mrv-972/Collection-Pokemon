// Recopier dans la base le nombre de cartes de chaque extension.
// ==============================================================
//
// Le badge « Extension complète » se calcule dans la base
// (supabase/communaute.sql, badges_de) : elle doit savoir combien de cartes
// compte chaque extension. Ce nombre vient des fichiers du site, que la
// construction nocturne tient à jour ; ce script les recopie dans la table
// extensions_totaux.
//
//   node outils/synchroniser-totaux.mjs [--essai]
//
// Demande le secret SUPABASE_CLE_SERVICE ; sans lui, ne fait rien.

import { readFile, readdir } from 'node:fs/promises';

const essai = process.argv.includes('--essai');
const config = await readFile('supabase-config.js', 'utf8');
const SUPABASE_URL = process.env.SUPABASE_URL || /SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)?.[1];
const cle = process.env.SUPABASE_CLE_SERVICE?.trim();

const totaux = [];
for(const univers of ['physique', 'pocket']){
  const dossier = `donnees/${univers}/sets`;
  for(const fichier of (await readdir(dossier)).filter(f => f.endsWith('.json'))){
    const cartes = JSON.parse(await readFile(`${dossier}/${fichier}`, 'utf8'));
    // L'extension telle que la base la déduit d'un identifiant de carte
    // (tout ce qui précède le dernier tiret) : les deux doivent concorder.
    const parExtension = new Map();
    for(const c of cartes){
      const id = String(c.id).replace(/-[^-]+$/, '');
      parExtension.set(id, (parExtension.get(id) ?? 0) + 1);
    }
    for(const [id, total] of parExtension) totaux.push({ id, total, maj_le: new Date().toISOString() });
  }
}
console.log(`${totaux.length} extensions, ${totaux.reduce((s, t) => s + t.total, 0)} cartes.`);

if(essai){ console.log(totaux.slice(0, 5)); process.exit(0); }
if(!cle){
  console.log('SUPABASE_CLE_SERVICE absent : totaux non recopiés (le badge « Extension complète » attendra).');
  process.exit(0);
}

const entetes = { apikey: cle, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
if(cle.startsWith('eyJ')) entetes.Authorization = `Bearer ${cle}`;
const r = await fetch(`${SUPABASE_URL}/rest/v1/extensions_totaux?on_conflict=id`, {
  method: 'POST', headers: entetes, body: JSON.stringify(totaux),
});
if(!r.ok){
  console.error(`Échec : ${r.status} ${(await r.text()).slice(0, 300)}`);
  console.error('Si le message parle de « extensions_totaux », exécute d\'abord supabase/communaute.sql.');
  process.exit(1);
}
console.log('Totaux recopiés dans la base.');
