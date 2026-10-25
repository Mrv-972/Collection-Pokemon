const IDENTITE = {
  nom: 'Mrv972',
  anonymat: true,

  email: 'mrv972.contact@gmail.com',

  adresse: '',

  directeurPublication: '',

  emailSignalement: '',

  miseAJour: '11 octobre 2026',
};

const PRESTATAIRES = {
  hebergeur: {
    nom: 'GitHub, Inc. (GitHub Pages)',
    adresse: '88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis',
    site: 'https://github.com',
  },
  baseDeDonnees: {
    nom: 'Supabase, Inc.',
    role: 'hébergement de la base de données et gestion des comptes',
    site: 'https://supabase.com',
  },
};

const SITE = {
  nom: 'PokéClasseur',
  adresseWeb: 'https://mrv-972.github.io/Collection-Pokemon/',
};

const STYLE_LEGAL_MANQUANT = `
  .legal-manquant{color:#E08862;font-weight:600;border-bottom:1px dashed currentColor}
`;

function valeurLegale(champ){
  switch(champ){
    case 'nom':          return IDENTITE.nom;
    case 'email':        return IDENTITE.email;
    case 'adresse':      return IDENTITE.adresse;
    case 'directeur':    return IDENTITE.directeurPublication || IDENTITE.nom;
    case 'signalement':  return IDENTITE.emailSignalement || IDENTITE.email;
    case 'miseAJour':    return IDENTITE.miseAJour;
    case 'siteNom':      return SITE.nom;
    case 'siteAdresse':  return SITE.adresseWeb;
    case 'hebergeur':    return PRESTATAIRES.hebergeur.nom;
    case 'hebergeurAdresse': return PRESTATAIRES.hebergeur.adresse;
    case 'baseNom':      return PRESTATAIRES.baseDeDonnees.nom;
    default:             return '';
  }
}

function remplirLesBlancs(){
  if(!document.getElementById('style-legal-manquant')){
    document.head.appendChild(Object.assign(document.createElement('style'),
      { id: 'style-legal-manquant', textContent: STYLE_LEGAL_MANQUANT }));
  }

  document.querySelectorAll('[data-si-anonymat]').forEach(el => {
    el.hidden = el.dataset.siAnonymat === 'oui' ? !IDENTITE.anonymat : IDENTITE.anonymat;
  });

  document.querySelectorAll('[data-legal]').forEach(el => {
    if(el.closest('[hidden]')) return;
    const valeur = valeurLegale(el.dataset.legal);
    if(valeur){
      el.textContent = valeur;
      el.classList.remove('legal-manquant');
    }else{
      el.textContent = '[à compléter dans legal.js]';
      el.classList.add('legal-manquant');
    }
  });
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', remplirLesBlancs);
}else{
  remplirLesBlancs();
}
