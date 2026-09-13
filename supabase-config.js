// Coordonnées de la base Supabase, à récupérer dans ton tableau de bord
// Supabase : Project Settings → API.
//
// La "clé anon" est conçue pour être publique et figurer dans le code d'un
// site : elle ne donne accès à rien par elle-même, ce sont les règles
// d'accès (RLS) du fichier supabase/schema.sql qui protègent les données.
// En revanche, ne mets JAMAIS ici la clé "service_role", qui elle contourne
// toutes ces règles.

const SUPABASE_URL = 'https://REMPLACER.supabase.co';
const SUPABASE_ANON_KEY = 'REMPLACER';
