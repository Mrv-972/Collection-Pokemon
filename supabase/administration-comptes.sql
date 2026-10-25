

create table if not exists journal_admin (
  id            bigint generated always as identity primary key,
  fait_le       timestamptz not null default now(),
  admin_id      uuid   not null,
  admin_pseudo  text,
  action        text   not null,
  cible_id      uuid,
  cible_pseudo  text,
  motif         text
);

alter table journal_admin enable row level security;

drop policy if exists "journal lisible par les admins" on journal_admin;
create policy "journal lisible par les admins"
  on journal_admin for select to authenticated using (est_admin());

grant select on journal_admin to authenticated;

create or replace function public.admin_liste_comptes()
returns table (
  id               uuid,
  pseudo           text,
  email            text,
  inscrit_le       timestamptz,
  derniere_visite  timestamptz,
  email_confirme   boolean,
  est_admin        boolean,
  cgu_acceptees_le timestamptz,
  cgu_version      text,
  ville            text,
  nb_cartes        bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  return query
    select
      u.id,
      p.pseudo,
      u.email::text,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at is not null,
      coalesce(p.est_admin, false),
      p.cgu_acceptees_le,
      p.cgu_version,
      p.ville,
      (select count(*) from public.cartes c where c.utilisateur_id = u.id)
    from auth.users u
    left join public.profils p on p.id = u.id
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_liste_comptes() from public;
grant execute on function public.admin_liste_comptes() to authenticated;

create or replace function public.admin_supprimer_compte(cible uuid, motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi           uuid := auth.uid();
  pseudo_admin  text;
  pseudo_cible  text;
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  if moi is null then
    raise exception 'Aucune session : impossible de supprimer un compte.';
  end if;

  if cible = moi then
    raise exception 'Un administrateur ne peut pas supprimer son propre compte depuis cette page. Passe par « Mon compte ».';
  end if;

  if not exists (select 1 from auth.users where id = cible) then
    raise exception 'Ce compte n''existe pas ou plus.';
  end if;

  select p.pseudo into pseudo_admin from public.profils p where p.id = moi;
  select p.pseudo into pseudo_cible from public.profils p where p.id = cible;

  insert into public.journal_admin (admin_id, admin_pseudo, action, cible_id, cible_pseudo, motif)
  values (moi, pseudo_admin, 'suppression de compte', cible, pseudo_cible, nullif(btrim(motif), ''));

  delete from auth.users where id = cible;
end;
$$;

revoke all on function public.admin_supprimer_compte(uuid, text) from public;
grant execute on function public.admin_supprimer_compte(uuid, text) to authenticated;

notify pgrst, 'reload schema';

create or replace function public.admin_discussions_du_membre(membre uuid)
returns table (
  conversation_id uuid,
  avec_id         uuid,
  avec_pseudo     text,
  nb_messages     bigint,
  dernier_le      timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  return query
    select
      c.id,
      case when c.membre_a = membre then c.membre_b else c.membre_a end,
      p.pseudo,
      (select count(*) from public.messages m where m.conversation_id = c.id),
      (select max(m.envoye_le) from public.messages m where m.conversation_id = c.id)
    from public.conversations c
    left join public.profils p
      on p.id = case when c.membre_a = membre then c.membre_b else c.membre_a end
    where c.membre_a = membre or c.membre_b = membre
    order by 5 desc nulls last;
end;
$$;

revoke all on function public.admin_discussions_du_membre(uuid) from public;
grant execute on function public.admin_discussions_du_membre(uuid) to authenticated;

create or replace function public.admin_lire_discussion(conversation uuid, motif text)
returns table (
  id            bigint,
  auteur_id     uuid,
  auteur_pseudo text,
  texte         text,
  envoye_le     timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi          uuid := auth.uid();
  pseudo_admin text;
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  if moi is null then
    raise exception 'Aucune session : impossible d''ouvrir une discussion.';
  end if;

  if motif is null or length(btrim(motif)) < 10 then
    raise exception 'Un motif d''au moins dix caractères est exigé pour ouvrir une discussion.';
  end if;

  if not exists (select 1 from public.conversations c where c.id = conversation) then
    raise exception 'Cette discussion n''existe pas ou plus.';
  end if;

  select p.pseudo into pseudo_admin from public.profils p where p.id = moi;

  insert into public.journal_admin (admin_id, admin_pseudo, action, cible_id, cible_pseudo, motif)
  values (moi, pseudo_admin, 'lecture d''une discussion', conversation, null, btrim(motif));

  return query
    select m.id, m.auteur_id, p.pseudo, m.texte, m.envoye_le
    from public.messages m
    left join public.profils p on p.id = m.auteur_id
    where m.conversation_id = conversation
    order by m.envoye_le;
end;
$$;

revoke all on function public.admin_lire_discussion(uuid, text) from public;
grant execute on function public.admin_lire_discussion(uuid, text) to authenticated;

create or replace function public.admin_journal(depuis int default 200)
returns setof public.journal_admin
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;
  return query
    select * from public.journal_admin order by fait_le desc limit depuis;
end;
$$;

revoke all on function public.admin_journal(int) from public;
grant execute on function public.admin_journal(int) to authenticated;

notify pgrst, 'reload schema';
