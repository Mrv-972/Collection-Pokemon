-- Photo de profil, avatar et paramètres du membre.
-- ================================================
--
-- Prérequis : schema.sql, administration.sql, rgpd.sql et
-- securite-profils.sql déjà exécutés. Ce script peut être relancé sans
-- dommage.
--
-- Ce qu'il ajoute :
--
--   1. un AVATAR choisi dans une galerie de Pokémon : immédiat, sans
--      risque, puisque la liste est la nôtre ;
--   2. une PHOTO envoyée par le membre. Elle ne devient visible des autres
--      qu'après validation par l'administrateur. Le navigateur la passe
--      d'abord à un filtre automatique, qui écarte l'essentiel des images
--      inappropriées ; mais un filtre installé chez le visiteur se
--      contourne, c'est donc la validation qui fait foi. Tant qu'elle n'a
--      pas eu lieu, la photo reste dans un dépôt PRIVÉ, que seuls son
--      auteur et l'administrateur peuvent lire ;
--   3. les PARAMÈTRES : notifications des nouveaux messages, thème clair ou
--      sombre. Ils suivent le membre d'un appareil à l'autre.

-- --- 1. les colonnes -------------------------------------------------------
alter table profils add column if not exists avatar              text;
alter table profils add column if not exists photo_url           text;
alter table profils add column if not exists photo_en_attente    text;
alter table profils add column if not exists photo_statut        text not null default 'aucune';
alter table profils add column if not exists photo_motif         text;
alter table profils add column if not exists pref_notif_messages boolean not null default true;
alter table profils add column if not exists pref_theme          text not null default 'auto';

-- Des valeurs bornées : un avatar est une clé courte de notre galerie, un
-- statut et un thème prennent l'une des valeurs prévues.
alter table profils drop constraint if exists avatar_forme;
alter table profils add  constraint avatar_forme
  check (avatar is null or avatar ~ '^[a-z0-9-]{1,40}$');
alter table profils drop constraint if exists photo_statut_valeurs;
alter table profils add  constraint photo_statut_valeurs
  check (photo_statut in ('aucune', 'en_attente', 'validee', 'refusee'));
alter table profils drop constraint if exists pref_theme_valeurs;
alter table profils add  constraint pref_theme_valeurs
  check (pref_theme in ('auto', 'clair', 'sombre'));
-- La photo en attente ne peut désigner qu'un fichier du dossier du membre :
-- sans cette règle, il pourrait faire valider le fichier d'un autre.
alter table profils drop constraint if exists photo_en_attente_chez_soi;
alter table profils add  constraint photo_en_attente_chez_soi
  check (photo_en_attente is null or photo_en_attente like id::text || '/%');

-- --- 2. qui lit, qui écrit -------------------------------------------------
-- Les autres membres voient l'avatar et la photo VALIDÉE ; jamais la photo
-- en attente, ni le motif d'un refus, ni les paramètres.
grant select (avatar, photo_url) on profils to authenticated;

-- Le membre modifie son avatar, propose une photo, règle ses paramètres.
-- Il ne peut PAS écrire photo_url ni photo_statut : ce serait publier une
-- photo sans validation. Ces deux colonnes ne bougent que par le
-- déclencheur ci-dessous et par les fonctions de l'administrateur.
grant update (avatar, photo_en_attente, pref_notif_messages, pref_theme)
  on profils to authenticated;

-- Proposer une photo la met en attente ; la retirer de l'attente ramène au
-- statut d'avant. Le statut se déduit ainsi de ce que le membre fait, sans
-- qu'il puisse l'écrire lui-même.
--
-- Seulement pour les écritures d'un membre : les fonctions de
-- l'administrateur, qui posent elles-mêmes « validée » ou « refusée » et
-- son motif, ne doivent pas être recalculées par-dessus.
create or replace function suivre_photo_en_attente()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.photo_en_attente is distinct from old.photo_en_attente then
    new.photo_motif := null;
    new.photo_statut := case
      when new.photo_en_attente is not null then 'en_attente'
      when new.photo_url is not null then 'validee'
      else 'aucune'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists suivre_photo_en_attente on profils;
create trigger suivre_photo_en_attente
  before update on profils
  for each row execute function suivre_photo_en_attente();

-- --- 3. mon profil, colonnes privées comprises -------------------------------
-- Même fonction qu'avant, avec les nouvelles colonnes. Le site lit les
-- champs par leur nom : l'ordre n'a pas d'importance.
drop function if exists mon_profil();
create function mon_profil()
returns table (
  pseudo              text,
  contact             text,
  ne_le               date,
  ville               text,
  code_postal         text,
  departement         text,
  latitude            double precision,
  longitude           double precision,
  avatar              text,
  photo_url           text,
  photo_en_attente    text,
  photo_statut        text,
  photo_motif         text,
  pref_notif_messages boolean,
  pref_theme          text
)
language sql
security definer
stable
set search_path = public
as $$
  select p.pseudo, p.contact, p.ne_le, p.ville, p.code_postal,
         p.departement, p.latitude, p.longitude,
         p.avatar, p.photo_url, p.photo_en_attente, p.photo_statut,
         p.photo_motif, p.pref_notif_messages, p.pref_theme
  from profils p
  where p.id = auth.uid();
$$;
grant execute on function mon_profil() to authenticated;

-- Retirer sa photo validée : le membre ne peut pas écrire photo_url
-- lui-même, cette fonction le fait pour lui — et seulement pour lui.
drop function if exists retirer_ma_photo();
create function retirer_ma_photo()
returns void
language sql
security definer
set search_path = public
as $$
  update profils
     set photo_url = null, photo_en_attente = null,
         photo_statut = 'aucune', photo_motif = null
   where id = auth.uid();
$$;
grant execute on function retirer_ma_photo() to authenticated;

-- --- 4. la validation, réservée à l'administrateur --------------------------
drop function if exists photos_en_attente();
create function photos_en_attente()
returns table (id uuid, pseudo text, photo_en_attente text, photo_url text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.pseudo, p.photo_en_attente, p.photo_url
  from profils p
  where est_admin() and p.photo_statut = 'en_attente'
  order by p.pseudo;
$$;
grant execute on function photos_en_attente() to authenticated;

-- L'administrateur a recopié la photo dans le dépôt public : elle devient
-- celle du membre. L'adresse doit désigner ce dépôt et le dossier de CE
-- membre, pour qu'une erreur de manipulation ne puisse pas attribuer la
-- photo de l'un au profil de l'autre.
drop function if exists valider_photo(uuid, text);
create function valider_photo(membre uuid, adresse text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not est_admin() then
    raise exception 'Réservé à l''administrateur.' using errcode = '42501';
  end if;
  if adresse !~ ('/storage/v1/object/public/avatars/' || membre::text || '/') then
    raise exception 'Adresse de photo inattendue.' using errcode = '22023';
  end if;
  update profils
     set photo_url = adresse, photo_en_attente = null,
         photo_statut = 'validee', photo_motif = null
   where id = membre;
end;
$$;
grant execute on function valider_photo(uuid, text) to authenticated;

drop function if exists refuser_photo(uuid, text);
create function refuser_photo(membre uuid, motif text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not est_admin() then
    raise exception 'Réservé à l''administrateur.' using errcode = '42501';
  end if;
  update profils
     set photo_en_attente = null, photo_statut = 'refusee',
         photo_motif = left(coalesce(motif, ''), 300)
   where id = membre;
end;
$$;
grant execute on function refuser_photo(uuid, text) to authenticated;

-- --- 5. le stockage des photos ----------------------------------------------
-- Deux dépôts. « avatars-attente » est PRIVÉ : une photo y attend sa
-- validation, lisible de son seul auteur et de l'administrateur.
-- « avatars » est public : n'y entrent que les photos validées, et seul
-- l'administrateur y dépose. Taille et formats sont bornés par le serveur
-- lui-même, pas seulement par le site.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars-attente', 'avatars-attente', false, 1048576, array['image/webp', 'image/jpeg', 'image/png']),
       ('avatars',         'avatars',         true,  1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Chaque membre n'agit que dans SON dossier : « <son identifiant>/… ».
drop policy if exists "photo en attente : le membre dépose chez lui" on storage.objects;
create policy "photo en attente : le membre dépose chez lui"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars-attente' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photo en attente : le membre remplace chez lui" on storage.objects;
create policy "photo en attente : le membre remplace chez lui"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars-attente' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars-attente' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photo en attente : lue par son auteur et l'administrateur" on storage.objects;
create policy "photo en attente : lue par son auteur et l'administrateur"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars-attente' and ((storage.foldername(name))[1] = auth.uid()::text or est_admin()));

drop policy if exists "photo en attente : retirée par son auteur ou l'administrateur" on storage.objects;
create policy "photo en attente : retirée par son auteur ou l'administrateur"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars-attente' and ((storage.foldername(name))[1] = auth.uid()::text or est_admin()));

drop policy if exists "photos validées lisibles par tous" on storage.objects;
create policy "photos validées lisibles par tous"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "photos validées : seul l'administrateur dépose" on storage.objects;
create policy "photos validées : seul l'administrateur dépose"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and est_admin());

drop policy if exists "photos validées : retirées par leur membre ou l'administrateur" on storage.objects;
create policy "photos validées : retirées par leur membre ou l'administrateur"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or est_admin()));

notify pgrst, 'reload schema';

-- --- vérification ------------------------------------------------------------
-- En dernier : l'éditeur SQL de Supabase n'affiche que le résultat de la
-- dernière commande. Les deux premières colonnes doivent répondre « true »,
-- les deux suivantes « false ».
select has_column_privilege('authenticated', 'profils', 'avatar', 'UPDATE')      as peut_choisir_avatar,
       has_column_privilege('authenticated', 'profils', 'pref_theme', 'UPDATE')  as peut_regler_theme,
       has_column_privilege('authenticated', 'profils', 'photo_url', 'UPDATE')   as peut_publier_sa_photo,
       has_column_privilege('authenticated', 'profils', 'photo_statut', 'UPDATE') as peut_ecrire_statut;
