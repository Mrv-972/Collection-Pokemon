#!/usr/bin/env node

import { argv } from 'node:process';

const args = Object.fromEntries(argv.slice(2).map(a => {
  const [cle, ...reste] = a.replace(/^--/, '').split('=');
  return [cle, reste.length ? reste.join('=') : true];
}));

const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (+https://github.com/Mrv-972/Collection-Pokemon)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

const titre = t => { console.log('\n' + '─'.repeat(70)); console.log(t); console.log('─'.repeat(70)); };
const lister = (nom, valeurs, max = 25) => {
  titre(`${nom} (${valeurs.length})`);
  if(!valeurs.length){ console.log('  : rien -'); return; }
  valeurs.slice(0, max).forEach(v => console.log('  ' + v));
  if(valeurs.length > max) console.log(`  … et ${valeurs.length - max} autres`);
};
const uniques = it => [...new Set(it)];

async function explorer(adresse){
  console.log(`\n══ ${adresse}`);
  const r = await fetch(adresse, { redirect: 'follow', headers: IDENTITE });
  console.log(`   HTTP ${r.status} · ${r.headers.get('content-type')} · arrivé sur ${r.url}`);
  if(!r.ok) return;
  const texte = await r.text();
  console.log(`   ${texte.length} caractères`);

  lister('Scripts chargés',
    uniques([...texte.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1])));

  lister('Fichiers de données (.json)',
    uniques([...texte.matchAll(/["'(]([^"'()\s]*\.json[^"'()\s]*)/g)].map(m => m[1])));

  lister("Adresses contenant « api », « data », « graphql » ou « trpc »",
    uniques([...texte.matchAll(/["'(]([^"'()\s]*(?:\/api\/|\/data\/|graphql|trpc)[^"'()\s]*)/gi)].map(m => m[1])));

  const hotes = uniques([...texte.matchAll(/https?:\/\/([a-z0-9.\-]+)/gi)].map(m => m[1].toLowerCase()));
  lister('Serveurs nommés dans la page', hotes.sort(), 40);

  const tiers = uniques([...texte.matchAll(/https?:\/\/[^\s"'\\<>]{6,200}/g)].map(m => m[0]))
    .filter(a => !a.includes('pokemon-tcg-pocket.wiki') && !a.includes('schema.org') && !a.includes('w3.org'));
  lister('Adresses extérieures complètes', tiers, 30);

  lister('Images trouvées',
    uniques([...texte.matchAll(/https?:\/\/[^\s"'\\]+\.(?:webp|png|jpg|jpeg|avif)/gi)].map(m => m[0])));

  for(const [nom, motif] of [
    ['__NEXT_DATA__', /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i],
    ['ld+json',       /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i],
    ['self.__next_f', /self\.__next_f\.push\(([\s\S]{0,400})/],
  ]){
    const m = texte.match(motif);
    if(m){
      titre(`Bloc « ${nom} » : début du contenu`);
      console.log('  ' + m[1].trim().slice(0, 700).replace(/\n/g, '\n  '));
    }
  }

  if(args.suivre) await suivreLesScripts(r.url, texte);
}

async function suivreLesScripts(adressePage, texte){
  const srcs = uniques([...texte.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]));
  const filtre = new RegExp(String(args.filtre ?? 'jsdelivr|/api/|\\.json|githubusercontent|cdn\\.'), 'i');
  titre(`Adresses trouvées DANS les ${srcs.length} scripts (filtre : ${filtre.source})`);

  let total = 0;
  for(const src of srcs){
    let code;
    try{
      const r = await fetch(new URL(src, adressePage), { headers: IDENTITE });
      if(!r.ok) continue;
      code = await r.text();
    }catch(err){ continue; }

    const trouvees = uniques([
      ...[...code.matchAll(/https?:\/\/[^\s"'`\\<>]{6,200}/g)].map(m => m[0]),
      ...[...code.matchAll(/["'`]([\/a-z0-9._\-@]{6,120})["'`]/gi)].map(m => m[1]),
    ]).filter(a => filtre.test(a));

    if(trouvees.length){
      console.log(`\n  ── ${src.split('/').pop()}`);
      trouvees.slice(0, 20).forEach(a => console.log('     ' + a));
      total += trouvees.length;
    }

    if(args.contexte){
      const cible = new RegExp(String(args.contexte), 'g');
      for(const m of code.matchAll(cible)){
        const debut = Math.max(0, m.index - 400);
        console.log(`\n     ┌─ voisinage de « ${m[0]} » dans ${src.split('/').pop().split('?')[0]}`);
        console.log('     │ ' + code.slice(debut, m.index + 500).replace(/\n/g, ' ').replace(/(.{110})/g, '$1\n     │ '));
      }
    }
  }
  if(!total) console.log('  : aucune adresse ne correspond au filtre -');
}

const adresses = String(args.url ?? '').split(',').filter(Boolean);
if(!adresses.length){ console.error('Il manque --url="…"'); process.exit(1); }

for(const a of adresses){
  try{ await explorer(a); }
  catch(err){ console.log(`\n══ ${a}\n   échec : ${err.message}`); }
}
