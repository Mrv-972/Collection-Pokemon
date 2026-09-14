// Accès aux conversations entre membres.
//
// Les nouveaux messages sont récupérés par interrogations régulières plutôt
// que par une connexion permanente : c'est le même chemin que le reste du
// site, donc bien plus simple à diagnostiquer, et suffisant pour des
// échanges entre collectionneurs. Supabase sait faire de la vraie
// notification instantanée le jour où le besoin se fera sentir.

const DELAI_RAFRAICHISSEMENT = 4000;

async function listerConversations(){
  const db = await clientSupabase();
  const { data, error } = await db.rpc('mes_conversations');
  if(error) throw error;
  return data ?? [];
}

// Retrouve la conversation avec un membre, ou l'ouvre si c'est la première.
async function ouvrirConversation(autreId){
  const db = await clientSupabase();
  const { data, error } = await db.rpc('ouvrir_conversation', { autre: autreId });
  if(error) throw error;
  return data;
}

async function lireMessages(conversationId, depuisId = 0){
  const db = await clientSupabase();
  const { data, error } = await db.from('messages')
    .select('id, auteur_id, texte, envoye_le')
    .eq('conversation_id', conversationId)
    .gt('id', depuisId)
    // Sur le numéro et non sur l'heure : deux messages de la même seconde
    // s'ordonneraient au hasard, alors que l'appelant retient le dernier
    // numéro reçu pour savoir où il en est.
    .order('id', { ascending: true });
  if(error) throw error;
  return data ?? [];
}

async function envoyerMessage(conversationId, texte){
  const db = await clientSupabase();
  const { data, error } = await db.from('messages')
    .insert({ conversation_id: conversationId, auteur_id: membre.id, texte: texte.trim() })
    .select('id, auteur_id, texte, envoye_le')
    .single();
  if(error) throw error;
  return data;
}

// Répète une tâche tant que la page est visible : inutile d'interroger la
// base pour un onglet que personne ne regarde.
function suivreEnContinu(tache){
  let arrete = false;
  const tour = async () => {
    if(arrete) return;
    if(document.visibilityState === 'visible'){
      try{ await tache(); }catch(err){ console.warn('Rafraîchissement impossible', err); }
    }
    if(!arrete) setTimeout(tour, DELAI_RAFRAICHISSEMENT);
  };
  setTimeout(tour, DELAI_RAFRAICHISSEMENT);
  return () => { arrete = true; };
}

function heureLisible(iso){
  const date = new Date(iso);
  const aujourdhui = new Date().toDateString() === date.toDateString();
  return aujourdhui
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Les messages sont écrits par d'autres membres : ils sont insérés comme du
// texte, jamais comme du code, pour qu'un message ne puisse pas agir sur la
// page de son destinataire.
function texteEchappe(texte){
  const boite = document.createElement('div');
  boite.textContent = texte;
  return boite.innerHTML;
}

// --------------------------------------------- ranger et faire le ménage --

// Archiver et supprimer ne valent que pour moi. Une conversation a deux
// propriétaires : je peux la retirer de ma liste, jamais de celle d'en face.

async function archiverConversation(conversationId, archiver = true){
  const db = await clientSupabase();
  const { error } = await db.rpc('archiver_conversation', {
    conversation: conversationId,
    archiver,
  });
  if(error) throw error;
}

async function supprimerConversation(conversationId){
  const db = await clientSupabase();
  const { error } = await db.rpc('supprimer_conversation', { conversation: conversationId });
  if(error) throw error;
}

// Le pseudo d'un membre, quand on n'a que son identifiant : c'est le cas
// d'une discussion supprimée qu'on rouvre depuis la page Échanges.
async function pseudoDe(membreId){
  const db = await clientSupabase();
  const { data } = await db.from('profils').select('pseudo').eq('id', membreId).maybeSingle();
  return data?.pseudo ?? null;
}

// ------------------------------------------------ blocage et signalement --

async function bloquerMembre(autreId){
  const db = await clientSupabase();
  const { error } = await db.from('blocages')
    .insert({ bloqueur_id: membre.id, bloque_id: autreId });
  if(error) throw error;
}

async function debloquerMembre(autreId){
  const db = await clientSupabase();
  const { error } = await db.from('blocages')
    .delete().eq('bloqueur_id', membre.id).eq('bloque_id', autreId);
  if(error) throw error;
}

async function aiJeBloque(autreId){
  const db = await clientSupabase();
  const { data } = await db.from('blocages')
    .select('bloque_id').eq('bloqueur_id', membre.id).eq('bloque_id', autreId).maybeSingle();
  return !!data;
}

async function signalerMembre(autreId, motif, messageId = null){
  const db = await clientSupabase();
  const { error } = await db.from('signalements').insert({
    signaleur_id: membre.id,
    signale_id: autreId,
    message_id: messageId,
    motif: motif.trim(),
  });
  if(error) throw error;
}

// ------------------------------------------------------------ non-lus --

// Mémorise jusqu'où le membre a lu dans une conversation.
async function marquerLu(conversationId, dernierMessageId){
  if(!dernierMessageId) return;
  const db = await clientSupabase();
  const { error } = await db.from('lectures').upsert({
    utilisateur_id: membre.id,
    conversation_id: conversationId,
    dernier_message_lu: dernierMessageId,
  });
  if(error) throw error;
}

// Les membres que j'ai bloqués, avec leur pseudo. Le lien entre un blocage
// et un profil ne peut pas être déduit automatiquement (le blocage désigne
// un compte, pas un profil) : on rapproche donc les deux en deux temps.
async function listerBlocages(){
  const db = await clientSupabase();
  const { data: blocages, error } = await db.from('blocages')
    .select('bloque_id, cree_le').eq('bloqueur_id', membre.id);
  if(error) throw error;
  if(!blocages?.length) return [];

  const { data: profils } = await db.from('profils')
    .select('id, pseudo').in('id', blocages.map(b => b.bloque_id));
  const pseudos = Object.fromEntries((profils ?? []).map(p => [p.id, p.pseudo]));

  return blocages.map(b => ({
    id: b.bloque_id,
    pseudo: pseudos[b.bloque_id] ?? 'Membre supprimé',
    cree_le: b.cree_le,
  }));
}
