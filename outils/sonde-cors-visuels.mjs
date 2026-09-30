// Peut-on dessiner un visuel de carte dans une image à partager ?
//
// Pour fabriquer l'image d'un classeur, le navigateur doit peindre chaque
// carte sur une toile (canvas) puis en extraire un fichier. Or un navigateur
// refuse d'extraire une toile où l'on a peint une image venue d'un autre
// domaine, sauf si ce domaine l'autorise explicitement par l'en-tête
// « Access-Control-Allow-Origin ». Sans cette autorisation, l'export est
// impossible — et cela ne se voit qu'à l'exécution, par une erreur.
//
// Le bac à sable de développement n'atteint pas ce domaine : la sonde tourne
// sur un exécuteur GitHub et on lit son journal.
//
//   node outils/sonde-cors-visuels.mjs

const IDENTITE = {
  'User-Agent': 'PokeClasseur (sonde CORS)',
  // Un navigateur annonce l'origine de la page : c'est elle que le serveur
  // autorise ou non. Sans cet en-tête, beaucoup de serveurs ne répondent
  // rien du tout, et la sonde conclurait à tort.
  'Origin': 'https://mrv-972.github.io',
};

const A_SONDER = [
  ['carte physique', 'https://assets.tcgdex.net/fr/sv/sv01/1/high.png'],
  ['logo physique  ', 'https://assets.tcgdex.net/fr/sv/sv01/logo.png'],
  ['carte Pocket   ', 'https://assets.tcgdex.net/fr/tcgp/A1/1/high.png'],
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
console.log(tousAutorises
  ? 'Tout est autorisé : l\'image d\'un classeur peut contenir les vraies cartes.'
  : 'Au moins un visuel est refusé : l\'image devra se passer de lui.');
