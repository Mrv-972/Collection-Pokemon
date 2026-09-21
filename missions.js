// Missions secrètes de Pokémon TCG Pocket.
//
// Le jeu cache, dans chaque extension, des missions qui n'apparaissent dans
// l'écran des missions qu'une fois accomplies. On ne peut donc pas les y
// lire : il faut savoir à l'avance ce qu'elles demandent. C'est tout l'objet
// de cette page.
//
// Ces missions ne figurent dans aucune base de données ouverte — ni TCGdex,
// ni le jeu de données de flibustier, ni le wiki francophone. Elles ont été
// relevées dans deux guides francophones, recoupées, et rangées à la main
// dans donnees/missions-secretes.json. Là où les guides se contredisent ou
// se trompent visiblement, la mission porte une réserve, affichée telle
// quelle : mieux vaut un doute annoncé qu'une certitude fausse.

const FICHIER_MISSIONS = 'donnees/missions-secretes.json';
const CLE_MISSIONS_FAITES = 'pokeclasseur-missions-faites';

// Le jeu ne dit nulle part « mission accomplie » à un site extérieur, et les
// versions full art ou chromatiques d'une carte ne sont pas distinguées dans
// les marquages du site. Cocher reste donc à la main — mais la coche, elle,
// est bien enregistrée.
function missionsFaites(){
  try{ return new Set(JSON.parse(localStorage.getItem(CLE_MISSIONS_FAITES)) || []); }
  catch{ return new Set(); }
}

function enregistrerMissionsFaites(faites){
  try{ localStorage.setItem(CLE_MISSIONS_FAITES, JSON.stringify([...faites])); }
  catch(err){ console.warn('Impossible d\'enregistrer les missions faites', err); }
}

// Une mission n'a pas d'identifiant propre : son extension et son nom
// suffisent à la retrouver, et survivent à une réorganisation du fichier.
const cleMission = (idExtension, nom) => `${idExtension}::${nom}`;

async function chargerMissions(){
  const r = await fetch(FICHIER_MISSIONS, { cache: 'no-cache' });
  if(!r.ok) throw new Error(`Fichier des missions indisponible (HTTP ${r.status}).`);
  return r.json();
}
