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

// ------------------------------------------------- Bulle de soutien -----
//
// Le bouton du pied de page ne se voit que si on descend jusqu'en bas. Cette
// petite bulle, elle, se pose dans le coin en bas à droite et reste visible.
//
// Trois règles de politesse, parce qu'une bulle qui insiste fait fuir :
//   — elle attend quelques secondes avant d'apparaître, le temps qu'on lise ;
//   — la croix la referme, et on ne la revoit pas avant un mois ;
//   — qui a cliqué sur le lien de dons ne la revoit pas avant trois mois.
//
// Le coin bas-droite est choisi exprès : le bandeau des univers occupe la
// gauche, et la vue zoom (z-index 70) passe par-dessus la bulle (55).
const BULLE = {
  actif: true,
  delaiAvantAffichage: 8000,
  silenceApresFermeture: 30,   // en jours
  silenceApresClic: 90,        // en jours
  titre: 'Un coup de pouce ?',
  pagesExclues: ['admin.html'], // inutile de se solliciter soi-même
};

const CLE_BULLE = 'pokeclasseur-bulle-soutien';

// localStorage n'est pas toujours accessible (navigation privée stricte,
// cookies bloqués). Une bulle qui plante la page serait pire que pas de bulle.
function lireSilence(){
  try{ return Number(localStorage.getItem(CLE_BULLE)) || 0; }
  catch{ return 0; }
}
function poserSilence(jours){
  try{ localStorage.setItem(CLE_BULLE, String(Date.now() + jours * 86400000)); }
  catch{ /* tant pis, la bulle reviendra */ }
}

const STYLE_BULLE = `
  .bulle-soutien{position:fixed;right:20px;bottom:20px;z-index:55;width:292px;
                 max-width:calc(100vw - 40px);padding:16px 17px 17px;
                 border-radius:14px;background:#15171A;
                 border:1px solid rgba(227,199,102,0.28);
                 box-shadow:0 18px 44px rgba(0,0,0,0.55);
                 font-family:'IBM Plex Sans',sans-serif;
                 opacity:0;transform:translateY(14px);
                 transition:opacity .28s ease,transform .28s ease;}
  .bulle-soutien.visible{opacity:1;transform:translateY(0)}
  .bulle-soutien h3{margin:0 0 6px;font-size:14px;font-weight:600;
                    color:var(--text-on-ink,#EDEAE0);padding-right:20px;}
  .bulle-soutien p{margin:0 0 13px;font-size:12.5px;line-height:1.5;
                   color:var(--text-on-ink-dim,#9B9E9C);}
  .bulle-soutien .lien{display:inline-flex;align-items:center;gap:8px;
                       padding:9px 16px;border-radius:999px;text-decoration:none;
                       font-size:13px;font-weight:600;color:var(--ink,#0A0B0D);
                       background:var(--gold,#E3C766);transition:filter .12s;}
  .bulle-soutien .lien:hover{filter:brightness(1.1)}
  .bulle-soutien .lien svg{width:15px;height:15px}
  .bulle-soutien .fermer{position:absolute;top:8px;right:8px;width:26px;height:26px;
                         display:flex;align-items:center;justify-content:center;
                         border:0;border-radius:7px;background:transparent;
                         color:var(--text-on-ink-dim,#9B9E9C);font-size:17px;
                         line-height:1;cursor:pointer;transition:background .12s,color .12s;}
  .bulle-soutien .fermer:hover{background:rgba(237,234,224,0.09);
                               color:var(--text-on-ink,#EDEAE0);}
  @media(max-width:640px){
    .bulle-soutien{right:12px;left:12px;bottom:12px;width:auto;max-width:none}
  }
  @media(prefers-reduced-motion:reduce){
    .bulle-soutien{transition:none}
  }
`;

function pageCourante(){
  const bout = location.pathname.split('/').pop();
  return bout || 'index.html';
}

function poserBulleSoutien(){
  if(!BULLE.actif || !SOUTIEN.adresse) return;
  if(BULLE.pagesExclues.includes(pageCourante())) return;
  if(Date.now() < lireSilence()) return;
  if(document.querySelector('.bulle-soutien')) return;

  document.head.appendChild(Object.assign(document.createElement('style'),
    { textContent: STYLE_BULLE }));

  const coeur = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 6.5 5.4 5.4 0 0 1 21.6 12c-2.1 4.4-9.6 9-9.6 9z"/></svg>';
  const bulle = document.createElement('aside');
  bulle.className = 'bulle-soutien';
  bulle.setAttribute('role', 'complementary');
  bulle.setAttribute('aria-label', 'Soutenir PokéClasseur');
  bulle.innerHTML = `
    <button class="fermer" type="button" aria-label="Fermer">&times;</button>
    <h3>${BULLE.titre}</h3>
    <p>${SOUTIEN.phrase}</p>
    <a class="lien" href="${SOUTIEN.adresse}" target="_blank" rel="noopener noreferrer">
      ${coeur}${SOUTIEN.libelle}
    </a>`;

  bulle.querySelector('.fermer').addEventListener('click', () => {
    poserSilence(BULLE.silenceApresFermeture);
    bulle.classList.remove('visible');
    setTimeout(() => bulle.remove(), 300);
  });
  // Qui a cliqué a fait son geste : on le laisse tranquille bien plus longtemps.
  bulle.querySelector('.lien').addEventListener('click', () => {
    poserSilence(BULLE.silenceApresClic);
  });

  document.body.appendChild(bulle);
  setTimeout(() => {
    // requestAnimationFrame pour que la transition parte bien de l'état initial.
    requestAnimationFrame(() => bulle.classList.add('visible'));
  }, BULLE.delaiAvantAffichage);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', poserBulleSoutien);
}else{
  poserBulleSoutien();
}
