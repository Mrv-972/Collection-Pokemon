// Zone géographique d'un membre.
//
// Deux collectionneurs proches peuvent se remettre les cartes en main propre
// plutôt que de les confier à la poste, et un échange se négocie plus
// facilement entre voisins. D'où ce repère de distance dans les échanges.
//
// Ce qui est enregistré n'est jamais une adresse : c'est la commune choisie,
// ramenée à son point central — le même pour tous ses habitants. Personne ne
// peut donc être localisé plus finement que « quelque part dans cette
// commune », et le site lui-même n'affiche aux autres membres que le
// département et une distance approximative.
//
// Les communes viennent de l'API Découpage administratif de l'État
// (geo.api.gouv.fr) : données publiques, gratuites, sans clé ni inscription.
// Elle ne couvre que la France ; d'autres pays demanderaient une autre
// source, ce qui sera à reprendre le jour où le site dépassera nos
// frontières.

const GEO_API = 'https://geo.api.gouv.fr/communes';
const GEO_CHAMPS = 'nom,code,codesPostaux,centre,departement';

// Le nom des départements, pour ne pas dépendre d'un champ de l'API qui
// pourrait manquer : le code INSEE d'une commune suffit à le retrouver.
const DEPARTEMENTS = {
  '01':'Ain','02':'Aisne','03':'Allier','04':'Alpes-de-Haute-Provence','05':'Hautes-Alpes',
  '06':'Alpes-Maritimes','07':'Ardèche','08':'Ardennes','09':'Ariège','10':'Aube',
  '11':'Aude','12':'Aveyron','13':'Bouches-du-Rhône','14':'Calvados','15':'Cantal',
  '16':'Charente','17':'Charente-Maritime','18':'Cher','19':'Corrèze','21':'Côte-d\'Or',
  '22':'Côtes-d\'Armor','23':'Creuse','24':'Dordogne','25':'Doubs','26':'Drôme',
  '27':'Eure','28':'Eure-et-Loir','29':'Finistère','2A':'Corse-du-Sud','2B':'Haute-Corse',
  '30':'Gard','31':'Haute-Garonne','32':'Gers','33':'Gironde','34':'Hérault',
  '35':'Ille-et-Vilaine','36':'Indre','37':'Indre-et-Loire','38':'Isère','39':'Jura',
  '40':'Landes','41':'Loir-et-Cher','42':'Loire','43':'Haute-Loire','44':'Loire-Atlantique',
  '45':'Loiret','46':'Lot','47':'Lot-et-Garonne','48':'Lozère','49':'Maine-et-Loire',
  '50':'Manche','51':'Marne','52':'Haute-Marne','53':'Mayenne','54':'Meurthe-et-Moselle',
  '55':'Meuse','56':'Morbihan','57':'Moselle','58':'Nièvre','59':'Nord',
  '60':'Oise','61':'Orne','62':'Pas-de-Calais','63':'Puy-de-Dôme','64':'Pyrénées-Atlantiques',
  '65':'Hautes-Pyrénées','66':'Pyrénées-Orientales','67':'Bas-Rhin','68':'Haut-Rhin','69':'Rhône',
  '70':'Haute-Saône','71':'Saône-et-Loire','72':'Sarthe','73':'Savoie','74':'Haute-Savoie',
  '75':'Paris','76':'Seine-Maritime','77':'Seine-et-Marne','78':'Yvelines','79':'Deux-Sèvres',
  '80':'Somme','81':'Tarn','82':'Tarn-et-Garonne','83':'Var','84':'Vaucluse',
  '85':'Vendée','86':'Vienne','87':'Haute-Vienne','88':'Vosges','89':'Yonne',
  '90':'Territoire de Belfort','91':'Essonne','92':'Hauts-de-Seine','93':'Seine-Saint-Denis',
  '94':'Val-de-Marne','95':'Val-d\'Oise',
  '971':'Guadeloupe','972':'Martinique','973':'Guyane','974':'La Réunion','976':'Mayotte',
};

// Le code du département se lit au début du code INSEE de la commune : deux
// chiffres en métropole, trois outre-mer, et « 2A » / « 2B » en Corse.
function codeDepartement(codeInsee){
  if(typeof codeInsee !== 'string') return null;
  if(codeInsee.startsWith('97') || codeInsee.startsWith('98')) return codeInsee.slice(0, 3);
  return codeInsee.slice(0, 2).toUpperCase();
}

function libelleDepartement(commune){
  const code = commune?.departement?.code ?? commune?.codeDepartement ?? codeDepartement(commune?.code);
  if(!code) return null;
  const nom = commune?.departement?.nom ?? DEPARTEMENTS[code];
  return nom ? `${nom} (${code})` : `Département ${code}`;
}

// Traduit une commune de l'API en ce que le site manipule, ou null si la
// réponse n'a pas la forme attendue — mieux vaut ignorer une commune que
// d'enregistrer un point de coordonnées vides.
function communeUtilisable(commune, codePostalCherche){
  const point = commune?.centre?.coordinates;   // l'API donne [longitude, latitude]
  if(!Array.isArray(point) || point.length < 2) return null;
  const [longitude, latitude] = point;
  if(typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  const codes = Array.isArray(commune.codesPostaux) ? commune.codesPostaux : [];
  return {
    nom: commune.nom ?? 'Commune',
    // Une grande ville a plusieurs codes postaux : si la recherche partait
    // de l'un d'eux, c'est celui-là qu'on garde.
    codePostal: codes.includes(codePostalCherche) ? codePostalCherche : (codes[0] ?? null),
    departement: libelleDepartement(commune),
    latitude,
    longitude,
  };
}

// Accepte un code postal (cinq chiffres) ou un nom de commune.
async function chercherCommunes(saisie){
  const texte = (saisie ?? '').trim();
  if(texte.length < 2) return [];

  const codePostal = /^\d{5}$/.test(texte) ? texte : null;
  const url = codePostal
    ? `${GEO_API}?codePostal=${codePostal}&fields=${GEO_CHAMPS}&format=json`
    : `${GEO_API}?nom=${encodeURIComponent(texte)}&fields=${GEO_CHAMPS}&boost=population&limit=12&format=json`;

  const reponse = await fetch(url);
  if(!reponse.ok) throw new Error(`L'annuaire des communes a répondu ${reponse.status}.`);
  const communes = await reponse.json();
  if(!Array.isArray(communes)) return [];

  return communes.map(c => communeUtilisable(c, codePostal)).filter(Boolean);
}

// Comment une distance se dit. En dessous du kilomètre, le chiffre exact
// n'apporte rien et donnerait une fausse impression de précision : les deux
// points comparés sont des centres de communes, pas des domiciles.
function distanceLisible(km){
  if(km === null || km === undefined) return null;
  if(km === 0) return 'même commune';
  if(km === 1) return 'à 1 km environ';
  return `à ${km} km environ`;
}

// Comment une zone se présente à son propriétaire.
function zoneLisible(profil){
  if(!profil?.ville) return null;
  const lieu = profil.code_postal ? `${profil.ville} (${profil.code_postal})` : profil.ville;
  return profil.departement ? `${lieu} — ${profil.departement}` : lieu;
}
