// Prévenir par e-mail les membres qui l'ont demandé.
// ==================================================
//
// Lancé toutes les vingt minutes par .github/workflows/notifier-par-email.yml.
// La base dit à qui écrire (supabase/communaute.sql, emails_a_envoyer) :
//
//   — des messages attendent depuis au moins dix minutes, arrivés depuis le
//     dernier e-mail, et pas plus d'un e-mail toutes les six heures ;
//   — une fois par semaine au plus, s'il y a plus de collectionneurs avec qui
//     échanger que la dernière fois.
//
// Les adresses e-mail ne sortent de la base que par cette voie, avec la clé
// « service » rangée dans les secrets du dépôt. Sans ces secrets, le script
// ne fait rien et le dit : le site marche sans les e-mails.
//
//   node outils/notifier-par-email.mjs           envoie
//   node outils/notifier-par-email.mjs --essai   montre ce qui partirait, sans rien envoyer
//
// Secrets attendus (Settings → Secrets and variables → Actions) :
//   SUPABASE_CLE_SERVICE   clé « service_role » (ou « secret ») du projet Supabase
//   EMAIL_ADRESSE          l'adresse qui envoie (une adresse Gmail, par exemple)
//   EMAIL_MOT_DE_PASSE     son « mot de passe d'application »
//   EMAIL_SERVEUR          facultatif, smtp.gmail.com par défaut
//   EMAIL_PORT             facultatif, 465 par défaut

import { readFile } from 'node:fs/promises';

const essai = process.argv.includes('--essai');
const SITE = (process.env.SITE_URL || 'https://mrv-972.github.io/Collection-Pokemon/').replace(/\/?$/, '/');

const config = await readFile('supabase-config.js', 'utf8');
const SUPABASE_URL = process.env.SUPABASE_URL || /SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)?.[1];
const cle = process.env.SUPABASE_CLE_SERVICE?.trim();
const expediteur = process.env.EMAIL_ADRESSE?.trim();
const motDePasse = process.env.EMAIL_MOT_DE_PASSE?.replace(/\s+/g, '');

const manquants = [
  !cle && 'SUPABASE_CLE_SERVICE',
  !essai && !expediteur && 'EMAIL_ADRESSE',
  !essai && !motDePasse && 'EMAIL_MOT_DE_PASSE',
].filter(Boolean);
if(manquants.length){
  console.log(`Notifications par e-mail pas encore configurées : il manque ${manquants.join(', ')}.`);
  console.log('Rien à faire. Voir LISEZMOI-administration.md, « Notifications par e-mail ».');
  process.exit(0);
}

// La nouvelle clé « secret » de Supabase (sb_secret_…) va dans l'en-tête
// apikey seul ; l'ancienne clé service_role, un jeton JWT, aussi dans
// Authorization.
const entetes = { apikey: cle, 'Content-Type': 'application/json' };
if(cle.startsWith('eyJ')) entetes.Authorization = `Bearer ${cle}`;

async function rpc(nom, corps = {}){
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nom}`, {
    method: 'POST', headers: entetes, body: JSON.stringify(corps),
  });
  const texte = await r.text();
  if(!r.ok) throw new Error(`${nom} : ${r.status} ${texte.slice(0, 300)}`);
  return texte ? JSON.parse(texte) : null;
}

// ------------------------------------------------------------ messages ----

const echapper = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function gabarit({ pseudo, titre, texte, bouton, lien }){
  const reglages = `${SITE}parametres.html`;
  return {
    text: `Bonjour ${pseudo},\n\n${texte}\n\n${bouton} : ${lien}\n\n—\n` +
          `Tu reçois cet e-mail parce que tu as activé les notifications par e-mail sur PokéClasseur.\n` +
          `Pour ne plus en recevoir : ${reglages}\n`,
    html: `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#F4F0E6">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px;font-family:Arial,Helvetica,sans-serif;color:#1E2127">
    <p style="font-family:Georgia,serif;font-style:italic;font-size:22px;margin:0 0 22px">Poké<span style="color:#6B5005">Classeur</span></p>
    <div style="background:#FFFDF8;border:1px solid #E2D8C2;border-radius:12px;padding:24px">
      <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 12px">${echapper(titre)}</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Bonjour ${echapper(pseudo)},<br>${echapper(texte)}</p>
      <a href="${lien}" style="display:inline-block;background:#1F6F63;color:#EDF5F3;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px">${echapper(bouton)}</a>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#5D6168;margin:18px 4px 0">
      Tu reçois cet e-mail parce que tu as activé les notifications par e-mail sur PokéClasseur.
      <a href="${reglages}" style="color:#5D6168">Ne plus en recevoir</a>.</p>
  </div></body></html>`,
  };
}

function emailMessages(l){
  const n = l.non_lus;
  return {
    subject: n > 1 ? `${n} messages t'attendent sur PokéClasseur` : 'Un message t\'attend sur PokéClasseur',
    ...gabarit({
      pseudo: l.pseudo,
      titre: n > 1 ? `${n} nouveaux messages` : 'Un nouveau message',
      texte: n > 1 ? `${n} messages t'attendent dans tes discussions.` : 'un collectionneur t\'a écrit.',
      bouton: 'Lire mes messages',
      lien: `${SITE}discussions.html`,
    }),
  };
}

function emailEchanges(l){
  const n = l.partenaires;
  return {
    subject: n > 1 ? `${n} collectionneurs peuvent échanger avec toi` : 'Un collectionneur peut échanger avec toi',
    ...gabarit({
      pseudo: l.pseudo,
      titre: 'De nouveaux échanges possibles',
      texte: n > 1
        ? `${n} collectionneurs ont des cartes que tu recherches, ou recherchent celles que tu proposes.`
        : 'un collectionneur a une carte que tu recherches, ou recherche une carte que tu proposes.',
      bouton: 'Voir les échanges possibles',
      lien: `${SITE}echanges.html`,
    }),
  };
}

// ------------------------------------------------------------- envoi ----

const nodemailer = (await import('nodemailer')).default;
const transport = essai
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({
      host: process.env.EMAIL_SERVEUR || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_PORT || 465),
      secure: Number(process.env.EMAIL_PORT || 465) === 465,
      auth: { user: expediteur, pass: motDePasse },
    });

if(!essai){
  try{ await transport.verify(); }
  catch(err){
    console.error(`Connexion au serveur d'e-mail refusée : ${err.message}`);
    console.error("Vérifie EMAIL_ADRESSE et EMAIL_MOT_DE_PASSE (un mot de passe d'application, pas celui du compte).");
    process.exit(1);
  }
}

const liste = await rpc('emails_a_envoyer');
const aEnvoyer = liste.filter(l => l.envoyer_messages || l.envoyer_echanges);
console.log(`${liste.length} membre(s) ont activé les e-mails ; ${aEnvoyer.length} à prévenir maintenant.`);

let envoyes = 0, echecs = 0;
for(const l of aEnvoyer){
  const envois = [
    l.envoyer_messages && ['messages', emailMessages(l)],
    l.envoyer_echanges && ['echanges', emailEchanges(l)],
  ].filter(Boolean);
  for(const [genre, contenu] of envois){
    try{
      const info = await transport.sendMail({
        from: { name: 'PokéClasseur', address: expediteur || 'essai@exemple.invalid' },
        to: l.email, ...contenu,
      });
      if(essai){
        console.log(`[essai] ${genre} → ${l.pseudo} : « ${contenu.subject} »`);
        if(process.argv.includes('--detail')) console.log(JSON.parse(info.message).text);
        continue;
      }
      await rpc('marquer_email_envoye', { membre: l.membre, genre, partenaires: genre === 'echanges' ? l.partenaires : null });
      envoyes++;
    }catch(err){
      // Une adresse refusée ne doit pas priver les autres de leur e-mail.
      echecs++;
      console.warn(`Échec (${genre}) pour ${l.pseudo} : ${err.message}`);
    }
  }
}
console.log(essai ? 'Essai terminé : rien n\'a été envoyé.' : `${envoyes} e-mail(s) envoyé(s), ${echecs} échec(s).`);
