// Pied de page, commun à toutes les pages.
//
// Il y en avait neuf, écrits à la main, qui avaient divergé : plusieurs
// annonçaient encore des « cartes fournies en direct par l'API TCGdex »,
// ce qui n'est plus vrai depuis que les 3863 visuels et le catalogue vivent
// dans le dépôt. Un texte recopié dans neuf fichiers vieillit mal ; celui-ci
// vit à un seul endroit.
//
// Chaque page peut ajouter sa précision propre — « tes tags sont enregistrés
// dans ce navigateur », « les discussions ne sont lisibles que par leurs deux
// participants » — en la posant sur son <footer> :
//
//     <footer data-note="…"></footer>

// ---------------------------------------------------------- Soutien -----
//
// Un bouton pour qui veut aider à faire vivre le site. Pour l'allumer, colle
// ici l'adresse de ta page de dons :
//
//   Ko-fi           https://ko-fi.com/tonpseudo
//   Buy Me a Coffee https://buymeacoffee.com/tonpseudo
//   Tipeee          https://fr.tipeee.com/tonprojet
//   Liberapay       https://liberapay.com/tonpseudo
//   GitHub Sponsors https://github.com/sponsors/Mrv-972
//
// Tant que « adresse » reste vide, RIEN ne s'affiche : mieux vaut pas de
// bouton du tout qu'un bouton qui mène nulle part.
const SOUTIEN = {
  adresse: 'https://ko-fi.com/mrv972',
  libelle: 'Soutenir le site',
  // Une phrase pour dire à quoi sert l'argent. Les gens donnent plus
  // volontiers quand ils savent ce qu'ils paient.
  phrase: "PokéClasseur est gratuit et le restera. Un coup de pouce aide à couvrir l'hébergement.",
};

const PIED_LIENS = [
  ['Explorer', [
    ['Par extension', 'series.html'],
    ['Par Pokémon', 'pokemon.html'],
  ]],
  ['Échanger', [
    ['Échanges', 'echanges.html'],
    ['Discussions', 'discussions.html'],
  ]],
  ['Ton compte', [
    ['Mon compte', 'connexion.html'],
  ]],
];

const STYLE_PIED = `
  footer{padding:40px 0 48px;color:var(--text-on-ink-dim);font-size:13px;
         border-top:1px solid rgba(237,234,224,0.08);display:block;}
  .pied-haut{display:flex;gap:40px;flex-wrap:wrap;justify-content:space-between;
             align-items:flex-start;margin:0 0 30px;}
  .pied-marque{max-width:260px}
  .pied-marque .nom{font-family:'Newsreader',serif;font-size:19px;color:var(--text-on-ink);
                    display:block;margin:0 0 6px;}
  .pied-marque .nom span{color:var(--gold)}
  .pied-colonnes{display:flex;gap:40px;flex-wrap:wrap}
  .pied-colonne h3{font-size:12px;letter-spacing:.4px;text-transform:uppercase;
                   color:var(--text-on-ink);margin:0 0 9px;font-weight:600;
                   font-family:'IBM Plex Sans',sans-serif;}
  .pied-colonne a{display:block;padding:3px 0;color:var(--text-on-ink-dim);
                  text-decoration:none;transition:color .12s;}
  .pied-colonne a:hover{color:var(--text-on-ink)}
  .pied-note{margin:0 0 14px;color:var(--text-on-ink-dim)}
  .pied-soutien{display:inline-flex;align-items:center;gap:8px;margin:14px 0 0;
                padding:9px 16px;border-radius:999px;text-decoration:none;
                font-size:13px;font-weight:600;color:var(--ink);
                background:var(--gold);transition:filter .12s;}
  .pied-soutien:hover{filter:brightness(1.1)}
  .pied-soutien svg{width:15px;height:15px}
  .pied-soutien-phrase{display:block;margin:9px 0 0;font-size:12px;line-height:1.5;
                       color:var(--text-on-ink-dim);max-width:260px;}
  .pied-bas{font-size:12px;line-height:1.6;color:var(--text-on-ink-dim);opacity:.85;
            border-top:1px solid rgba(237,234,224,0.06);padding-top:16px;}
  .pied-bas p{margin:0 0 5px}
  .pied-bas a{color:inherit;text-decoration:underline;text-underline-offset:2px}
  @media(max-width:640px){
    .pied-haut{flex-direction:column;gap:26px}
    .pied-colonnes{gap:30px}
  }
`;

// Le bouton ne s'affiche que si une adresse a été renseignée plus haut.
function boutonSoutien(){
  if(!SOUTIEN.adresse) return '';
  const coeur = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 6.5 5.4 5.4 0 0 1 21.6 12c-2.1 4.4-9.6 9-9.6 9z"/></svg>';
  return `
    <a class="pied-soutien" href="${SOUTIEN.adresse}" target="_blank" rel="noopener noreferrer">
      ${coeur}${SOUTIEN.libelle}
    </a>
    ${SOUTIEN.phrase ? `<span class="pied-soutien-phrase">${SOUTIEN.phrase}</span>` : ''}`;
}

function poserPied(){
  const pied = document.querySelector('footer');
  if(!pied || pied.dataset.pose) return;
  pied.dataset.pose = '1';

  document.head.appendChild(Object.assign(document.createElement('style'),
    { textContent: STYLE_PIED }));

  // La précision propre à la page, si elle en a une.
  const note = pied.dataset.note ? `<p class="pied-note">${pied.dataset.note}</p>` : '';

  pied.innerHTML = `
    <div class="pied-haut">
      <div class="pied-marque">
        <span class="nom">Poké<span>Classeur</span></span>
        Ta collection de cartes Pokémon, retrouvée d'un appareil à l'autre — et
        des collectionneurs près de chez toi.
        ${boutonSoutien()}
      </div>
      <div class="pied-colonnes">
        ${PIED_LIENS.map(([titre, liens]) => `
          <div class="pied-colonne">
            <h3>${titre}</h3>
            ${liens.map(([nom, href]) => `<a href="${href}">${nom}</a>`).join('')}
          </div>`).join('')}
      </div>
    </div>
    ${note}
    <div class="pied-bas">
      <p>Noms, visuels de cartes et symboles de rareté reproduits à titre
         informatif. Pokémon, Pokémon TCG et Pokémon TCG Pocket sont des
         marques de Nintendo, Creatures Inc. et GAME FREAK inc.</p>
      <p>Catalogue constitué à partir de
         <a href="https://tcgdex.dev" rel="noopener">TCGdex</a>,
         de <a href="https://github.com/flibustier/pokemon-tcg-pocket-database" rel="noopener">flibustier</a>
         et du <a href="https://pokemon-tcg-pocket.wiki" rel="noopener">wiki francophone TCG Pocket</a>.</p>
      <p>Site indépendant, sans lien avec The Pokémon Company.</p>
    </div>
  `;
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', poserPied);
}else{
  poserPied();
}
