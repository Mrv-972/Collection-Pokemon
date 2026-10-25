const IDENTITE = {
  'User-Agent': 'PokeClasseur (sonde CORS)',
  'Origin': 'https://mrv-972.github.io',
};

const A_SONDER = [
  ['carte physique, basse déf. ', 'https://assets.tcgdex.net/fr/sv/sv01/001/low.webp'],
  ['carte physique, haute déf.  ', 'https://assets.tcgdex.net/fr/sv/sv01/001/high.webp'],
  ['logo d\'extension physique  ', 'https://assets.tcgdex.net/fr/sv/sv01/logo.png'],
];

let tousAutorises = true;
for(const [nom, adresse] of A_SONDER){
  try{
    const r = await fetch(adresse, { headers: IDENTITE });
    const autorise = r.headers.get('access-control-allow-origin');
    r.body?.cancel();
    const ok = autorise === '*' || autorise === IDENTITE.Origin;
    if(!ok) tousAutorises = false;
    console.log(`${nom}  ${String(r.status).padEnd(4)} ` +
      `access-control-allow-origin: ${autorise ?? '(absent)'}  ${ok ? '→ peignable' : '→ REFUSÉ'}`);
  }catch(err){
    tousAutorises = false;
    console.log(`${nom}  réseau : ${err.message}`);
  }
}

console.log('');
console.log('Les visuels des cartes de l\'application sont dans le dépôt du site,');
console.log('donc de la même origine que la page : rien à autoriser de ce côté.');
console.log('');
console.log(tousAutorises
  ? 'Tout est autorisé : l\'image d\'un classeur peut contenir les vraies cartes.'
  : 'Au moins un visuel est refusé : l\'image devra se passer de lui.');
