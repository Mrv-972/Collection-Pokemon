
alter table profils add column if not exists avatar              text;
alter table profils add column if not exists photo_url           text;
alter table profils add column if not exists photo_en_attente    text;
alter table profils add column if not exists photo_statut        text not null default 'aucune';
alter table profils add column if not exists photo_motif         text;
alter table profils add column if not exists pref_notif_messages boolean not null default true;
alter table profils add column if not exists pref_theme          text not null default 'auto';

alter table profils drop constraint if exists avatar_forme;
alter table profils add  constraint avatar_forme
  check (avatar is null or avatar ~ '^[a-z0-9-]{1,40}$');
alter table profils drop constraint if exists photo_statut_valeurs;
alter table profils add  constraint photo_statut_valeurs
  check (photo_statut in ('aucune', 'en_attente', 'validee', 'refusee'));
alter table profils drop constraint if exists pref_theme_valeurs;
alter table profils add  constraint pref_theme_valeurs
  check (pref_theme in ('auto', 'clair', 'sombre'));
alter table profils drop constraint if exists photo_en_attente_chez_soi;
alter table profils add  constraint photo_en_attente_chez_soi
  check (photo_en_attente is null or photo_en_attente like id::text || '/%');

grant select (avatar, photo_url) on profils to authenticated;

grant update (avatar, photo_en_attente, pref_notif_messages, pref_theme)
  on profils to authenticated;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars-attente', 'avatars-attente', false, 1048576, array['image/webp', 'image/jpeg', 'image/png']),
       ('avatars',         'avatars',         true,  1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

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

select has_column_privilege('authenticated', 'profils', 'avatar', 'UPDATE')      as peut_choisir_avatar,
       has_column_privilege('authenticated', 'profils', 'pref_theme', 'UPDATE')  as peut_regler_theme,
       has_column_privilege('authenticated', 'profils', 'photo_url', 'UPDATE')   as peut_publier_sa_photo,
       has_column_privilege('authenticated', 'profils', 'photo_statut', 'UPDATE') as peut_ecrire_statut;
