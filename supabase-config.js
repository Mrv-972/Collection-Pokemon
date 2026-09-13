// Coordonnées de la base Supabase du projet.
//
// Ces deux valeurs sont conçues pour être publiques et figurer dans le code
// d'un site : elles ne donnent accès à rien par elles-mêmes. Ce sont les
// règles d'accès (RLS) définies dans supabase/schema.sql qui protègent les
// données — sans elles, cette clé suffirait à tout lire et tout modifier.
// Ne mets JAMAIS ici la clé "service_role" (ni une clé "sb_secret_"), qui
// contourne justement ces règles.

const SUPABASE_URL = 'https://dkywumizlbjcliqpkpyx.supabase.co';

// Clé publique historique (format JWT), reconnue par toutes les versions de
// la bibliothèque Supabase. Son équivalent moderne pour ce projet est
// sb_publishable_vVI9rfGt9rJyH0Qq6X6Mww_8Py-kk5T, interchangeable avec
// celle-ci si besoin.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRreXd1bWl6bGJqY2xpcXBrcHl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMjAyNzgsImV4cCI6MjEwNDg5NjI3OH0.fkPOQG1XquUb6W1tt19-sQTBUQg3rzMc5qODAjQhL7Q';
