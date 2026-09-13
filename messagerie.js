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
    .order('envoye_le', { ascending: true });
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
