// Planche de vignettes, pour REGARDER des visuels qu'on ne peut pas
// atteindre d'ici.
// ===================================================================
//
// Les serveurs d'images des cartes ne répondent qu'aux exécuteurs de
// GitHub. Pour juger d'un rattachement à l'œil — la carte est-elle bien
// en français ? est-ce bien la même illustration que la version
// anglaise ? —, l'outil assemble les visuels demandés en une seule image
// et l'écrit dans le journal, en texte (base64), découpée en lignes
// « PLANCHE <n> <morceau> ». Il suffit de recoller les morceaux.
//
//   node outils/planche-visuels.mjs "étiquette=adresse" "étiquette=adresse" …

import sharp from 'sharp';

const IDENTITE = {
  'User-Agent': 'PokeClasseur/1.0 (verification de visuels ; ' +
                'github.com/Mrv-972/Collection-Pokemon)',
};
const LARGEUR = 220, HAUTEUR = 307, PAR_LIGNE = 4, LEGENDE = 22;

const demandes = process.argv.slice(2).flatMap(a => a.split(/\s+/)).filter(Boolean)
  .map(a => { const i = a.indexOf('='); return { etiquette: a.slice(0, i), adresse: a.slice(i + 1) }; });

// « --brut » : chaque image telle quelle, en pleine résolution, pour
// l'étudier ailleurs (régler une lecture de texte, par exemple).
const brut = process.env.BRUT === '1';

const cases = [];
for(const d of demandes){
  let image;
  try{
    const r = await fetch(d.adresse, { headers: IDENTITE });
    let taille = '';
    if(r.ok && !brut){
      const tampon = Buffer.from(await r.clone().arrayBuffer());
      const m = await sharp(tampon).metadata().catch(() => ({}));
      taille = `${m.width ?? '?'}×${m.height ?? '?'} ${tampon.length} octets`;
    }
    console.log(`${d.etiquette} : ${r.status} ${r.headers.get('content-type') ?? ''} ${taille} ${d.adresse}`);
    if(r.ok && brut){
      const octets = Buffer.from(await r.arrayBuffer()).toString('base64');
      octets.match(/.{1,6000}/g).forEach((m, i) => console.log(`IMAGE ${d.etiquette} ${String(i).padStart(3, '0')} ${m}`));
      continue;
    }
    if(r.ok) image = await sharp(Buffer.from(await r.arrayBuffer()))
      .resize(LARGEUR, HAUTEUR, { fit: 'contain', background: '#222' }).toBuffer();
  }catch(err){ console.log(`${d.etiquette} : ÉCHEC ${err.message}`); }
  if(!image) image = await sharp({ create: { width: LARGEUR, height: HAUTEUR, channels: 3, background: '#600' } }).png().toBuffer();
  const legende = Buffer.from(`<svg width="${LARGEUR}" height="${LEGENDE}"><rect width="100%" height="100%" fill="#111"/>` +
    `<text x="6" y="16" font-family="sans-serif" font-size="14" fill="#fff">${d.etiquette.replace(/[<&]/g, '')}</text></svg>`);
  cases.push(image, legende);
}

if(brut) process.exit(0);
const lignes = Math.ceil(demandes.length / PAR_LIGNE);
const composition = [];
demandes.forEach((_, i) => {
  const x = (i % PAR_LIGNE) * LARGEUR, y = Math.floor(i / PAR_LIGNE) * (HAUTEUR + LEGENDE);
  composition.push({ input: cases[2 * i], left: x, top: y + LEGENDE }, { input: cases[2 * i + 1], left: x, top: y });
});
const planche = await sharp({ create: { width: PAR_LIGNE * LARGEUR, height: lignes * (HAUTEUR + LEGENDE),
  channels: 3, background: '#000' } }).composite(composition).jpeg({ quality: 70 }).toBuffer();

const texte = planche.toString('base64');
const morceaux = texte.match(/.{1,6000}/g);
morceaux.forEach((m, i) => console.log(`PLANCHE ${String(i).padStart(3, '0')} ${m}`));
console.log(`planche : ${planche.length} octets, ${morceaux.length} morceaux`);
