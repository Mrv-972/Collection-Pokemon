-- L'onglet Communauté : questions / réponses, idées d'amélioration, forums.
-- ==========================================================================
--
-- Prérequis : schema.sql, administration.sql, rgpd.sql, securite-profils.sql,
-- profil-photo-parametres.sql et communaute.sql déjà exécutés. Ce script peut
-- être relancé sans dommage.
--
-- Trois espaces, une seule mécanique : un SUJET (une question, une idée, un
-- sujet de forum) et ses RÉPONSES. Tout le monde peut lire, même sans
-- compte : une communauté se découvre avant de s'y inscrire. Seul un membre
-- connecté écrit, et seulement en son nom.
--
-- Supprimer son compte efface aussi ce qu'on a publié ici (et donc les
-- réponses des autres sous ses propres sujets) : c'est la promesse de
-- rgpd.sql, « toutes ses données ».

-- --- 1. les tables ----------------------------------------------------------
create table if not exists sujets (
  id               bigint generated always as identity primary key,
  espace           text not null check (espace in ('question', 'amelioration', 'forum')),
  -- Un sujet de forum appartient à une catégorie ; les autres, non.
  categorie        text check (categorie in ('general', 'pocket', 'physique', 'echanges', 'collection', 'detente')),
  auteur_id        uuid not null default auth.uid() references auth.users on delete cascade,
  titre            text not null check (length(btrim(titre)) between 3 and 120),
  corps            text not null check (length(btrim(corps)) between 1 and 5000),
  -- Le suivi d'une idée, que seul l'administrateur fait avancer.
  statut           text check (statut in ('proposee', 'etudiee', 'prevue', 'faite', 'refusee')),
  reponse_acceptee bigint,
  epingle          boolean not null default false,
  verrouille       boolean not null default false,
  nb_reponses      integer not null default 0,
  nb_votes         integer not null default 0,
  cree_le          timestamptz not null default now(),
  modifie_le       timestamptz,
  activite_le      timestamptz not null default now(),
  check ((espace = 'forum') = (categorie is not null)),
  check ((espace = 'amelioration') = (statut is not null))
);
create index if not exists sujets_par_espace on sujets (espace, activite_le desc);
create index if not exists sujets_par_auteur on sujets (auteur_id);

create table if not exists reponses (
  id         bigint generated always as identity primary key,
  sujet_id   bigint not null references sujets on delete cascade,
  auteur_id  uuid not null default auth.uid() references auth.users on delete cascade,
  corps      text not null check (length(btrim(corps)) between 1 and 5000),
  cree_le    timestamptz not null default now(),
  modifie_le timestamptz
);
create index if not exists reponses_par_sujet on reponses (sujet_id, id);
create index if not exists reponses_par_auteur on reponses (auteur_id);

alter table sujets drop constraint if exists sujets_reponse_acceptee_fk;
alter table sujets add constraint sujets_reponse_acceptee_fk
  foreign key (reponse_acceptee) references reponses (id) on delete set null;

-- Un soutien par membre et par sujet : « moi aussi » sur une question,
-- « je soutiens » sur une idée.
create table if not exists votes (
  sujet_id  bigint not null references sujets on delete cascade,
  membre_id uuid not null default auth.uid() references auth.users on delete cascade,
  cree_le   timestamptz not null default now(),
  primary key (sujet_id, membre_id)
);
create index if not exists votes_par_membre on votes (membre_id);

-- --- 2. qui lit, qui écrit ----------------------------------------------------
alter table sujets   enable row level security;
alter table reponses enable row level security;
alter table votes    enable row level security;

-- Supabase accorde tout, par défaut, sur les tables : on repart de rien et on
-- n'ouvre que le nécessaire, colonne par colonne pour l'écriture.
revoke all on sujets, reponses, votes from anon, authenticated;
grant select on sujets, reponses to anon, authenticated;
grant insert (espace, categorie, titre, corps) on sujets to authenticated;
grant update (titre, corps) on sujets to authenticated;
grant delete on sujets to authenticated;
grant insert (sujet_id, corps) on reponses to authenticated;
grant update (corps) on reponses to authenticated;
grant delete on reponses to authenticated;
grant select, insert (sujet_id), delete on votes to authenticated;

drop policy if exists "sujets lisibles par tous" on sujets;
create policy "sujets lisibles par tous" on sujets for select to anon, authenticated using (true);
drop policy if exists "je publie un sujet" on sujets;
create policy "je publie un sujet" on sujets for insert to authenticated
  with check (auteur_id = auth.uid());
drop policy if exists "je modifie mon sujet" on sujets;
create policy "je modifie mon sujet" on sujets for update to authenticated
  using (auteur_id = auth.uid() and not verrouille) with check (auteur_id = auth.uid());
drop policy if exists "je retire mon sujet, l'administrateur aussi" on sujets;
create policy "je retire mon sujet, l'administrateur aussi" on sujets for delete to authenticated
  using (auteur_id = auth.uid() or est_admin());

drop policy if exists "réponses lisibles par tous" on reponses;
create policy "réponses lisibles par tous" on reponses for select to anon, authenticated using (true);
drop policy if exists "je réponds" on reponses;
create policy "je réponds" on reponses for insert to authenticated
  with check (auteur_id = auth.uid());
drop policy if exists "je modifie ma réponse" on reponses;
create policy "je modifie ma réponse" on reponses for update to authenticated
  using (auteur_id = auth.uid()) with check (auteur_id = auth.uid());
drop policy if exists "je retire ma réponse, l'administrateur aussi" on reponses;
create policy "je retire ma réponse, l'administrateur aussi" on reponses for delete to authenticated
  using (auteur_id = auth.uid() or est_admin());

drop policy if exists "je vois mes soutiens" on votes;
create policy "je vois mes soutiens" on votes for select to authenticated using (membre_id = auth.uid());
drop policy if exists "je soutiens" on votes;
create policy "je soutiens" on votes for insert to authenticated with check (membre_id = auth.uid());
drop policy if exists "je retire mon soutien" on votes;
create policy "je retire mon soutien" on votes for delete to authenticated using (membre_id = auth.uid());

-- --- 3. garde-fous à l'écriture -----------------------------------------------
-- Pour les seules écritures d'un membre (pas celles des fonctions de la base,
-- qui tiennent les compteurs) :
--   — il faut avoir terminé son inscription (un pseudo) ;
--   — pas de rafale : trois sujets par dizaine de minutes, huit réponses par
--     tranche de deux minutes, de quoi décourager un robot sans gêner
--     personne ;
--   — un sujet verrouillé ne reçoit plus de réponse.
-- Ces fonctions s'exécutent avec les droits de l'appelant (pas de
-- « security definer ») : c'est ce qui permet de reconnaître, par
-- current_user, l'écriture d'un membre.
create or replace function communaute_avant_sujet()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from profils where id = auth.uid()) then
      raise exception 'Choisis d''abord ton pseudo dans « Mon profil ».' using errcode = 'P0001';
    end if;
    if (select count(*) from sujets where auteur_id = auth.uid() and cree_le > now() - interval '10 minutes') >= 3 then
      raise exception 'Tu as publié plusieurs sujets coup sur coup : attends quelques minutes.' using errcode = 'P0001';
    end if;
    new.statut := case when new.espace = 'amelioration' then 'proposee' end;
    new.cree_le := now();
    new.activite_le := now();
  elsif new.titre is distinct from old.titre or new.corps is distinct from old.corps then
    new.modifie_le := now();
  end if;
  return new;
end;
$$;
drop trigger if exists communaute_avant_sujet on sujets;
create trigger communaute_avant_sujet before insert or update on sujets
  for each row execute function communaute_avant_sujet();

create or replace function communaute_avant_reponse()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from profils where id = auth.uid()) then
      raise exception 'Choisis d''abord ton pseudo dans « Mon profil ».' using errcode = 'P0001';
    end if;
    if (select verrouille from sujets where id = new.sujet_id) then
      raise exception 'Ce sujet est verrouillé : il ne reçoit plus de réponse.' using errcode = 'P0001';
    end if;
    if (select count(*) from reponses where auteur_id = auth.uid() and cree_le > now() - interval '2 minutes') >= 8 then
      raise exception 'Doucement : attends un peu avant de répondre à nouveau.' using errcode = 'P0001';
    end if;
    new.cree_le := now();
  elsif new.corps is distinct from old.corps then
    new.modifie_le := now();
  end if;
  return new;
end;
$$;
drop trigger if exists communaute_avant_reponse on reponses;
create trigger communaute_avant_reponse before insert or update on reponses
  for each row execute function communaute_avant_reponse();

-- Les compteurs et la date de dernière activité, tenus par la base : un
-- membre ne peut pas les écrire, et ils restent justes.
create or replace function communaute_compter_reponses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update sujets set nb_reponses = nb_reponses + 1, activite_le = now() where id = new.sujet_id;
  else
    update sujets set nb_reponses = greatest(nb_reponses - 1, 0) where id = old.sujet_id;
  end if;
  return null;
end;
$$;
drop trigger if exists communaute_compter_reponses on reponses;
create trigger communaute_compter_reponses after insert or delete on reponses
  for each row execute function communaute_compter_reponses();

create or replace function communaute_compter_votes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update sujets set nb_votes = nb_votes + 1 where id = new.sujet_id;
  else
    update sujets set nb_votes = greatest(nb_votes - 1, 0) where id = old.sujet_id;
  end if;
  return null;
end;
$$;
drop trigger if exists communaute_compter_votes on votes;
create trigger communaute_compter_votes after insert or delete on votes
  for each row execute function communaute_compter_votes();

-- --- 4. lire : listes et fils ------------------------------------------------
-- Les fonctions joignent le pseudo et l'image de l'auteur : la table des
-- profils n'est lisible que des membres, or un visiteur doit pouvoir lire
-- la communauté. Rien d'autre du profil ne sort.
drop function if exists liste_sujets(text, text, text, text, integer, integer);
create function liste_sujets(p_espace text, p_categorie text default null, p_tri text default 'activite',
                             p_filtre text default null, p_limite integer default 30, p_decalage integer default 0)
returns table (id bigint, espace text, categorie text, titre text, extrait text, statut text,
               resolue boolean, epingle boolean, verrouille boolean, nb_reponses integer, nb_votes integer,
               cree_le timestamptz, activite_le timestamptz, auteur_id uuid, pseudo text, avatar text,
               photo_url text, a_vote boolean)
language sql
security definer
stable
set search_path = public
as $$
  select s.id, s.espace, s.categorie, s.titre, left(s.corps, 220), s.statut,
         s.reponse_acceptee is not null, s.epingle, s.verrouille, s.nb_reponses, s.nb_votes,
         s.cree_le, s.activite_le, s.auteur_id, p.pseudo, p.avatar, p.photo_url,
         exists (select 1 from votes v where v.sujet_id = s.id and v.membre_id = auth.uid())
  from sujets s
  left join profils p on p.id = s.auteur_id
  where (p_espace is null or s.espace = p_espace)
    and (p_categorie is null or s.categorie = p_categorie)
    and case p_filtre
          when 'sans-reponse' then s.nb_reponses = 0
          when 'resolues'     then s.reponse_acceptee is not null
          when 'miens'        then s.auteur_id = auth.uid()
          when 'proposee' then s.statut = 'proposee'
          when 'etudiee'  then s.statut = 'etudiee'
          when 'prevue'   then s.statut = 'prevue'
          when 'faite'    then s.statut = 'faite'
          when 'refusee'  then s.statut = 'refusee'
          else true
        end
  order by s.epingle desc,
           case when p_tri = 'votes' then s.nb_votes end desc nulls last,
           case when p_tri = 'recents' then s.cree_le end desc nulls last,
           s.activite_le desc
  limit least(greatest(coalesce(p_limite, 30), 1), 100)
  offset greatest(coalesce(p_decalage, 0), 0);
$$;
grant execute on function liste_sujets(text, text, text, text, integer, integer) to anon, authenticated;

-- Un sujet et toutes ses réponses, d'un seul appel.
drop function if exists fil_sujet(bigint);
create function fil_sujet(p_sujet bigint)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'sujet', to_jsonb(s) || jsonb_build_object(
      'pseudo', p.pseudo, 'avatar', p.avatar, 'photo_url', p.photo_url,
      'a_vote', exists (select 1 from votes v where v.sujet_id = s.id and v.membre_id = auth.uid())),
    'reponses', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object('pseudo', q.pseudo, 'avatar', q.avatar, 'photo_url', q.photo_url)
                       order by r.id)
      from reponses r left join profils q on q.id = r.auteur_id
      where r.sujet_id = s.id), '[]'::jsonb))
  from sujets s
  left join profils p on p.id = s.auteur_id
  where s.id = p_sujet;
$$;
grant execute on function fil_sujet(bigint) to anon, authenticated;

-- Les catégories du forum, avec leur nombre de sujets et leur dernière
-- activité.
drop function if exists categories_forum();
create function categories_forum()
returns table (categorie text, nb_sujets integer, derniere_activite timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select categorie, count(*)::int, max(activite_le)
  from sujets where espace = 'forum'
  group by categorie;
$$;
grant execute on function categories_forum() to anon, authenticated;

-- --- 5. gestes particuliers ---------------------------------------------------
-- L'auteur d'une question désigne la réponse qui l'a aidé (ou retire ce
-- choix, avec null).
drop function if exists accepter_reponse(bigint, bigint);
create function accepter_reponse(p_sujet bigint, p_reponse bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from sujets where id = p_sujet and espace = 'question' and auteur_id = auth.uid()) then
    raise exception 'Seul l''auteur de la question peut choisir la meilleure réponse.' using errcode = '42501';
  end if;
  if p_reponse is not null and not exists (select 1 from reponses where id = p_reponse and sujet_id = p_sujet) then
    raise exception 'Cette réponse n''appartient pas à cette question.' using errcode = '22023';
  end if;
  update sujets set reponse_acceptee = p_reponse where id = p_sujet;
end;
$$;
grant execute on function accepter_reponse(bigint, bigint) to authenticated;

-- L'administrateur épingle, verrouille, fait avancer une idée. Un argument
-- laissé à null ne change rien.
drop function if exists moderer_sujet(bigint, boolean, boolean, text);
create function moderer_sujet(p_sujet bigint, p_epingle boolean default null,
                              p_verrouille boolean default null, p_statut text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not est_admin() then raise exception 'Réservé à l''administrateur.' using errcode = '42501'; end if;
  update sujets set
    epingle    = coalesce(p_epingle, epingle),
    verrouille = coalesce(p_verrouille, verrouille),
    statut     = case when espace = 'amelioration' then coalesce(p_statut, statut) else statut end
  where id = p_sujet;
end;
$$;
grant execute on function moderer_sujet(bigint, boolean, boolean, text) to authenticated;

-- --- 6. signaler un sujet ou une réponse ----------------------------------------
alter table signalements add column if not exists sujet_id   bigint references sujets on delete cascade;
alter table signalements add column if not exists reponse_id bigint references reponses on delete cascade;
grant insert (sujet_id, reponse_id) on signalements to authenticated;
alter table signalements drop constraint if exists signalements_objet_valeurs;
alter table signalements add  constraint signalements_objet_valeurs
  check (objet in ('membre', 'message', 'profil', 'photo', 'pseudo', 'avis', 'sujet', 'reponse'));

-- La personne signalée est l'auteur du contenu, quoi qu'envoie le
-- navigateur : un signalement ne peut pas viser quelqu'un d'autre.
create or replace function signalement_auteur_du_contenu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reponse_id is not null then
    select auteur_id, sujet_id into new.signale_id, new.sujet_id from reponses where id = new.reponse_id;
    new.objet := 'reponse';
  elsif new.sujet_id is not null then
    select auteur_id into new.signale_id from sujets where id = new.sujet_id;
    new.objet := 'sujet';
  end if;
  return new;
end;
$$;
drop trigger if exists signalement_auteur_du_contenu on signalements;
create trigger signalement_auteur_du_contenu before insert on signalements
  for each row execute function signalement_auteur_du_contenu();

-- Le tiroir de l'administrateur montre, en plus, le contenu signalé.
drop function if exists signalements_a_traiter();
create function signalements_a_traiter()
returns table (id bigint, objet text, motif text, cree_le timestamptz,
               signaleur text, signale_id uuid, signale text, signale_photo text,
               message_texte text, sujet_id bigint, reponse_id bigint, contenu_titre text)
language sql
security definer
stable
set search_path = public
as $$
  -- Le message signalé est montré tel quel : son destinataire l'a déjà lu
  -- et le soumet lui-même à l'administrateur. Le reste de la discussion
  -- ne s'ouvre que par le tiroir des comptes, motif consigné au journal.
  select s.id, s.objet, s.motif, s.cree_le, a.pseudo, s.signale_id, b.pseudo, b.photo_url,
         coalesce(m.texte, r.corps, case when s.reponse_id is null then su.corps end),
         s.sujet_id, s.reponse_id, su.titre
  from signalements s
  left join profils a on a.id = s.signaleur_id
  left join profils b on b.id = s.signale_id
  left join messages m on m.id = s.message_id
  left join reponses r on r.id = s.reponse_id
  left join sujets su on su.id = s.sujet_id
  where est_admin() and s.traite_le is null
  order by s.cree_le desc;
$$;
grant execute on function signalements_a_traiter() to authenticated;

-- --- 7. les badges de la communauté --------------------------------------------
-- Calculés, comme ceux de la collection (communaute.sql, badges_de), à partir
-- de ce que la base sait elle-même. Ce qu'un membre fait pour lui-même ne
-- compte pas : répondre à ses propres questions, choisir sa propre réponse,
-- soutenir sa propre idée. Sans quoi ces badges s'obtiendraient seul.
drop function if exists badges_communaute(uuid);
create function badges_communaute(membre uuid)
returns table (badge text)
language sql
security definer
stable
set search_path = public
as $$
  with faits as (
    select
      (select count(*) from sujets where auteur_id = membre)
        + (select count(*) from reponses where auteur_id = membre) as messages,
      (select count(distinct r.sujet_id) from reponses r join sujets s on s.id = r.sujet_id
        where r.auteur_id = membre and s.espace = 'question' and s.auteur_id <> membre) as questions_aidees,
      (select count(*) from sujets s join reponses r on r.id = s.reponse_acceptee
        where r.auteur_id = membre and s.auteur_id <> membre) as meilleures_reponses,
      (select coalesce(max(n), 0) from (
         select count(*) as n from sujets s
         join votes v on v.sujet_id = s.id and v.membre_id <> membre
         where s.auteur_id = membre and s.espace = 'amelioration'
         group by s.id) idees) as soutiens_meilleure_idee,
      (select count(*) from sujets
        where auteur_id = membre and espace = 'amelioration' and statut in ('prevue', 'faite')) as idees_retenues
  )
  select b from faits, lateral (values
    (case when messages >= 1 then 'premier-message' end),
    (case when messages >= 50 then 'pilier-du-forum' end),
    (case when questions_aidees >= 10 then 'serviable' end),
    (case when meilleures_reponses >= 1 then 'bonne-reponse' end),
    (case when meilleures_reponses >= 5 then 'expert' end),
    (case when soutiens_meilleure_idee >= 10 then 'idee-populaire' end),
    (case when idees_retenues >= 1 then 'idee-retenue' end)
  ) as v(b)
  where auth.uid() is not null and b is not null;
$$;
grant execute on function badges_communaute(uuid) to authenticated;

-- --- 8. les nouvelles réponses ------------------------------------------------
-- Un membre suit les sujets qu'il a ouverts et ceux où il a répondu. Une
-- réponse y est « nouvelle » si elle vient d'un autre et qu'elle est arrivée
-- après sa dernière visite du sujet — ou après sa propre dernière réponse :
-- ce qui précède, il l'a forcément lu pour répondre. C'est ce que compte la
-- pastille de l'onglet Communauté.
create table if not exists vues_sujets (
  membre_id            uuid not null references auth.users on delete cascade,
  sujet_id             bigint not null references sujets on delete cascade,
  derniere_reponse_vue bigint not null default 0,
  primary key (membre_id, sujet_id)
);
alter table vues_sujets enable row level security;
-- Personne n'y écrit directement : seulement par marquer_sujet_lu().
revoke all on vues_sujets from anon, authenticated;

drop function if exists sujets_suivis();
create function sujets_suivis()
returns table (sujet_id bigint, espace text, categorie text, titre text,
               non_lues integer, derniere_reponse timestamptz, dernier_auteur text)
language sql
security definer
stable
set search_path = public
as $$
  with suivis as (
    select s.id,
           greatest(coalesce(v.derniere_reponse_vue, 0),
                    coalesce((select max(r.id) from reponses r where r.sujet_id = s.id and r.auteur_id = auth.uid()), 0)) as lu_jusqua
    from sujets s
    left join vues_sujets v on v.sujet_id = s.id and v.membre_id = auth.uid()
    where auth.uid() is not null
      and (s.auteur_id = auth.uid()
           or exists (select 1 from reponses r where r.sujet_id = s.id and r.auteur_id = auth.uid()))
  )
  select s.id, s.espace, s.categorie, s.titre, count(r.id)::int, max(r.cree_le),
         (select p.pseudo from reponses r2 join profils p on p.id = r2.auteur_id
           where r2.sujet_id = s.id and r2.auteur_id <> auth.uid() order by r2.id desc limit 1)
  from suivis f
  join sujets s on s.id = f.id
  join reponses r on r.sujet_id = s.id and r.auteur_id <> auth.uid() and r.id > f.lu_jusqua
  group by s.id
  order by max(r.cree_le) desc;
$$;
grant execute on function sujets_suivis() to authenticated;

drop function if exists reponses_non_lues();
create function reponses_non_lues()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(non_lues), 0)::int from sujets_suivis();
$$;
grant execute on function reponses_non_lues() to authenticated;

-- Le membre ouvre un sujet qu'il suit : tout y est lu. La fonction renvoie
-- où il en était avant, pour que la page signale les réponses nouvelles ;
-- rien (null) pour un sujet qu'il ne suit pas.
drop function if exists marquer_sujet_lu(bigint);
create function marquer_sujet_lu(p_sujet bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  avant bigint;
begin
  if auth.uid() is null or not exists (
       select 1 from sujets s where s.id = p_sujet and (s.auteur_id = auth.uid()
         or exists (select 1 from reponses r where r.sujet_id = s.id and r.auteur_id = auth.uid()))) then
    return null;
  end if;
  select greatest(coalesce((select derniere_reponse_vue from vues_sujets where membre_id = auth.uid() and sujet_id = p_sujet), 0),
                  coalesce((select max(id) from reponses where sujet_id = p_sujet and auteur_id = auth.uid()), 0))
    into avant;
  insert into vues_sujets (membre_id, sujet_id, derniere_reponse_vue)
  values (auth.uid(), p_sujet, coalesce((select max(id) from reponses where sujet_id = p_sujet), 0))
  on conflict (membre_id, sujet_id) do update
    set derniere_reponse_vue = greatest(vues_sujets.derniere_reponse_vue, excluded.derniere_reponse_vue);
  return avant;
end;
$$;
grant execute on function marquer_sujet_lu(bigint) to authenticated;

notify pgrst, 'reload schema';

-- --- vérification ------------------------------------------------------------
-- En dernier, seule commande affichée par l'éditeur SQL. Attendu :
-- true, true, false, false, true, true.
select has_table_privilege('anon', 'sujets', 'SELECT')                          as visiteurs_lisent,
       has_column_privilege('authenticated', 'sujets', 'titre', 'INSERT')       as membres_publient,
       has_column_privilege('authenticated', 'sujets', 'epingle', 'UPDATE')     as membres_epinglent,
       has_column_privilege('authenticated', 'sujets', 'nb_votes', 'UPDATE')    as membres_faussent_les_votes,
       has_function_privilege('authenticated', 'badges_communaute(uuid)', 'EXECUTE') as badges_de_la_communaute,
       has_function_privilege('authenticated', 'reponses_non_lues()', 'EXECUTE')     as pastille_des_reponses;
