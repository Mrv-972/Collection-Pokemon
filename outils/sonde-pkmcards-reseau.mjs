import { chromium } from 'playwright';

const RACINE = 'https://www.pkmcards.fr';
const IDENTITE = 'PokeClasseur/1.0 (reperage ; ' +
                 'github.com/Mrv-972/Collection-Pokemon ; mrv972.contact@gmail.com)';

const nav = await chromium.launch();
const contexte = await nav.newContext({
  userAgent: IDENTITE,
  locale: 'fr-FR',
  viewport: { width: 1280, height: 900 },
});
const page = await contexte.newPage();

await contexte.route('**/*', route => {
  const t = route.request().resourceType();
  if(t === 'image' || t === 'media' || t === 'font') return route.abort();
  route.continue();
});

const demandes = [];
page.on('request', r => {
  const t = r.resourceType();
  if(t === 'xhr' || t === 'fetch')
    demandes.push({ methode: r.method(), url: r.url(), corps: (r.postData() ?? '').slice(0, 400) });
});

const compterCartes = () => page.evaluate(() =>
  document.querySelectorAll('a[href^="/cards/"]').length);

console.log('Ouverture de la liste…');
await page.goto(`${RACINE}/cards/liste-cartes-francaises`,
  { waitUntil: 'networkidle', timeout: 60000 });
console.log(`cartes visibles au départ : ${await compterCartes()}`);

console.log('\n=============== commandes de pagination ===============');
const commandes = await page.evaluate(() =>
  [...document.querySelectorAll('button, a, [role=button]')]
    .map(e => ({
      balise: e.tagName.toLowerCase(),
      texte: (e.textContent ?? '').trim().slice(0, 40),
      href: e.getAttribute('href'),
      attributs: [...e.attributes].map(a => a.name)
        .filter(n => /^(wire|x|hx|data|@|:)/.test(n)),
    }))
    .filter(e => /suivant|next|plus|charger|voir|page|\d+$/i.test(e.texte)
              || e.attributs.some(a => /page|load|more/i.test(a)))
    .slice(0, 30));
for(const c of commandes) console.log('  ' + JSON.stringify(c));

console.log('\n=============== on descend ===============');
let avant = await compterCartes();
for(let i = 0; i < 5; i++){
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
  const apres = await compterCartes();
  console.log(`  descente ${i+1} : ${avant} -> ${apres}`);
  if(apres === avant) break;
  avant = apres;
}

console.log('\n=============== on clique ===============');
for(const mot of ['Suivant', 'Next', 'Charger', 'Voir plus', '2']){
  const b = page.locator(`button:has-text("${mot}"), a:has-text("${mot}")`).first();
  if(!(await b.count())) { console.log(`  « ${mot} » : absent`); continue; }
  try{
    await b.click({ timeout: 5000 });
    await page.waitForTimeout(3000);
    console.log(`  « ${mot} » cliqué -> ${await compterCartes()} cartes, adresse ${page.url()}`);
    break;
  }catch(err){ console.log(`  « ${mot} » : ${err.message.split('\n')[0]}`); }
}

console.log('\n=============== requêtes émises ===============');
if(!demandes.length) console.log('  aucune : tout le contenu arrive avec la page.');
for(const d of demandes.slice(0, 25)){
  console.log(`  ${d.methode} ${d.url}`);
  if(d.corps) console.log(`       corps: ${d.corps}`);
}

await nav.close();
