// Pages légales : l'identité à déclarer, écrite à un seul endroit.
//
// Trois pages obligatoires répètent les mêmes coordonnées. Les recopier
// trois fois, c'est se garantir qu'un jour deux d'entre elles diront des
// choses différentes — et sur ces pages-là, c'est exactement ce qu'il ne
// faut pas.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ À REMPLIR AVANT DE PUBLIER. Tant qu'un champ est vide, les pages    │
// │ l'affichent en rouge avec la mention « à compléter » : mieux vaut   │
// │ un trou visible qu'une page d'apparence officielle qui ment.        │
// └─────────────────────────────────────────────────────────────────────┘

const IDENTITE = {
  // Le nom sous lequel tu publies. La loi (LCEN, article 6) permet à un
  // particulier qui édite un site à titre non professionnel de ne pas
  // afficher son nom et son adresse au public — à condition d'avoir
  // communiqué son identité à l'hébergeur, qui la tient à disposition de la
  // justice. Deux possibilités, donc :
  //   — soit tu mets ton nom complet ici ;
  //   — soit tu mets ton pseudo, et tu coches « anonymat » ci-dessous.
  nom: 'Mrv972',
  anonymat: true,

  // Une adresse de contact est obligatoire dans tous les cas, y compris si
  // tu restes anonyme. Une adresse dédiée au site évite de donner ta
  // messagerie personnelle.
  email: 'mrv972.contact@gmail.com',

  // L'adresse postale. Facultative si « anonymat » est vrai.
  adresse: '',

  // Le directeur de la publication, c'est-à-dire qui répond du contenu.
  // Pour un site personnel, c'est l'éditeur : laisse vide et ce sera lui.
  directeurPublication: '',

  // Où signaler un contenu illicite : un message injurieux, une usurpation,
  // une annonce frauduleuse. La loi impose un moyen de signalement ; à
  // défaut, l'adresse de contact ci-dessus sert.
  emailSignalement: '',

  // La date de dernière mise à jour des trois pages, en toutes lettres.
  miseAJour: '22 septembre 2026',
};

// Les deux prestataires dont dépend le site. Leurs coordonnées sont
// publiques, mais elles changent : vérifie-les le jour où tu publies.
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

// Le site lui-même.
const SITE = {
  nom: 'PokéClasseur',
  adresseWeb: 'https://mrv-972.github.io/Collection-Pokemon/',
};

// --------------------------------------------------- remplir les blancs ---
//
// Chaque page écrit <span data-legal="email"></span> là où une coordonnée
// doit apparaître. Un champ vide se voit, plutôt que de laisser une phrase
// bancale du genre « contactez-nous à  ».

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

  // Les passages qui ne valent que dans un cas se règlent d'abord : sans
  // quoi l'adresse postale, masquée par l'anonymat, serait quand même
  // signalée « à compléter » — un trou dans une phrase que personne ne lit.
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
