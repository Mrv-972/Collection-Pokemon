const GEO_API = 'https://geo.api.gouv.fr/communes';
const GEO_CHAMPS = 'nom,code,codesPostaux,centre,departement';

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

function communeUtilisable(commune, codePostalCherche){
  const point = commune?.centre?.coordinates;
  if(!Array.isArray(point) || point.length < 2) return null;
  const [longitude, latitude] = point;
  if(typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  const codes = Array.isArray(commune.codesPostaux) ? commune.codesPostaux : [];
  return {
    nom: commune.nom ?? 'Commune',
    codePostal: codes.includes(codePostalCherche) ? codePostalCherche : (codes[0] ?? null),
    departement: libelleDepartement(commune),
    latitude,
    longitude,
  };
}

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

function distanceLisible(km){
  if(km === null || km === undefined) return null;
  if(km === 0) return 'même commune';
  if(km === 1) return 'à 1 km environ';
  return `à ${km} km environ`;
}

function zoneLisible(profil){
  if(!profil?.ville) return null;
  const lieu = profil.code_postal ? `${profil.ville} (${profil.code_postal})` : profil.ville;
  return profil.departement ? `${lieu} · ${profil.departement}` : lieu;
}
