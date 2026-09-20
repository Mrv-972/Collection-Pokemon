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
  .pied-bas{font-size:12px;line-height:1.6;color:var(--text-on-ink-dim);opacity:.85;
            border-top:1px solid rgba(237,234,224,0.06);padding-top:16px;}
  .pied-bas p{margin:0 0 5px}
  .pied-bas a{color:inherit;text-decoration:underline;text-underline-offset:2px}
  @media(max-width:640px){
    .pied-haut{flex-direction:column;gap:26px}
    .pied-colonnes{gap:30px}
  }
`;

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
