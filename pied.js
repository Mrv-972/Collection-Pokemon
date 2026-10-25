const SOUTIEN = {
  adresse: 'https://ko-fi.com/mrv972',
  libelle: 'Soutenir le site',
  phrase: "PokéClasseur est gratuit et le restera. Un coup de pouce aide à couvrir l'hébergement.",
};

const PIED_LIENS = [
  ['Explorer', [
    ['Par extension', 'series.html'],
    ['Par Pokémon / Dresseur', 'pokemon.html'],
  ]],
  ['Échanger', [
    ['Échanges', 'echanges.html'],
    ['Discussions', 'discussions.html'],
  ]],
  ['Communauté', [
    ['Questions et forums', 'communaute.html'],
    ['Idées pour le site', 'communaute.html?r=ameliorations'],
    ['Noms des Pokémon', 'communaute.html?r=noms'],
  ]],
  ['Ton compte', [
    ['Mon profil', 'connexion.html'],
    ['Paramètres', 'parametres.html'],
  ]],
  ['Le site', [
    ['Nous écrire', 'contact.html'],
    ['Mentions légales', 'mentions-legales.html'],
    ['Confidentialité', 'confidentialite.html'],
    ["Conditions d'utilisation", 'cgu.html'],
  ]],
];

const STYLE_PIED = `
  footer{padding:40px 0 48px;color:var(--text-on-ink-dim);font-size:13px;
         border-top:1px solid rgba(var(--trait-rgb,237,234,224),0.08);display:block;}
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
            border-top:1px solid rgba(var(--trait-rgb,237,234,224),0.06);padding-top:16px;}
  .pied-bas p{margin:0 0 5px}
  .pied-bas a{color:inherit;text-decoration:underline;text-underline-offset:2px}
  @media(max-width:640px){
    .pied-haut{flex-direction:column;gap:26px}
    .pied-colonnes{gap:30px}
  }
`;

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

  const note = pied.dataset.note ? `<p class="pied-note">${pied.dataset.note}</p>` : '';

  pied.innerHTML = `
    <div class="pied-haut">
      <div class="pied-marque">
        <span class="nom">Poké<span>Classeur</span></span>
        Ta collection de cartes Pokémon, retrouvée d'un appareil à l'autre, et
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
         de <a href="https://github.com/flibustier/pokemon-tcg-pocket-database" rel="noopener">flibustier</a>,
         du <a href="https://pokemon-tcg-pocket.wiki" rel="noopener">wiki francophone TCG Pocket</a>
         et de <a href="https://www.pkmcards.fr" rel="noopener">PkmCards</a>.</p>
      <!-- Ce crédit n'est pas une politesse : la licence de Poképédia
           (CC BY-NC-SA 3.0) l'exige, et elle impose aussi que le site
           reste non commercial. Le détail de ce qui en vient est dans
           donnees/visuels-pokepedia-copies.json. -->
      <p>Certains visuels de cartes anciennes proviennent de
         <a href="https://www.pokepedia.fr" rel="noopener">Poképédia</a>,
         sous licence
         <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/deed.fr" rel="noopener"
            >CC BY-NC-SA 3.0</a>.</p>
      <p>Site indépendant, sans lien avec The Pokémon Company.</p>
    </div>
  `;
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', poserPied);
}else{
  poserPied();
}

const BULLE = {
  actif: true,
  delaiAvantAffichage: 5000,
  silenceApresFermeture: 30,
  silenceApresClic: 90,
  titre: 'Un coup de pouce ?',
  pagesExclues: [],
};

const CLE_BULLE = 'pokeclasseur-bulle-soutien';

function lireSilence(){
  try{ return Number(localStorage.getItem(CLE_BULLE)) || 0; }
  catch{ return 0; }
}
function poserSilence(jours){
  try{ localStorage.setItem(CLE_BULLE, String(Date.now() + jours * 86400000)); }
  catch{ }
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
  .bulle-soutien .fermer:hover{background:rgba(var(--trait-rgb,237,234,224),0.09);
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
  bulle.querySelector('.lien').addEventListener('click', () => {
    poserSilence(BULLE.silenceApresClic);
  });

  document.body.appendChild(bulle);
  setTimeout(() => {
    requestAnimationFrame(() => bulle.classList.add('visible'));
  }, BULLE.delaiAvantAffichage);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', poserBulleSoutien);
}else{
  poserBulleSoutien();
}
