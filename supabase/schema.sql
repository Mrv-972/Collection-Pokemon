

create table if not exists profils (
  id      uuid primary key references auth.users on delete cascade,
  pseudo  text unique not null,
  contact text,
  ne_le   date,
  cree_le timestamptz not null default now()
);
alter table profils add column if not exists ne_le date;

alter table profils add column if not exists ville       text;
alter table profils add column if not exists code_postal text;
alter table profils add column if not exists departement text;
alter table profils add column if not exists latitude    double precision;
alter table profils add column if not exists longitude   double precision;

create table if not exists cartes (
  utilisateur_id uuid not null references auth.users on delete cascade,
  carte_id       text not null,
  obtenue        boolean not null default false,
  recherchee     boolean not null default false,
  echangeable    boolean not null default false,
  maj_le         timestamptz not null default now(),
  primary key (utilisateur_id, carte_id)
);

create index if not exists cartes_recherchees  on cartes (carte_id) where recherchee;
create index if not exists cartes_echangeables on cartes (carte_id) where echangeable;

create table if not exists conversations (
  id       uuid primary key default gen_random_uuid(),
  membre_a uuid not null references auth.users on delete cascade,
  membre_b uuid not null references auth.users on delete cascade,
  cree_le  timestamptz not null default now(),
  unique (membre_a, membre_b),
  check (membre_a < membre_b)
);

create table if not exists messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references conversations on delete cascade,
  auteur_id       uuid not null references auth.users on delete cascade,
  texte           text not null check (length(btrim(texte)) between 1 and 2000),
  envoye_le       timestamptz not null default now()
);

create index if not exists messages_par_conversation on messages (conversation_id, envoye_le);

create table if not exists blocages (
  bloqueur_id uuid not null references auth.users on delete cascade,
  bloque_id   uuid not null references auth.users on delete cascade,
  cree_le     timestamptz not null default now(),
  primary key (bloqueur_id, bloque_id),
  check (bloqueur_id <> bloque_id)
);

create table if not exists signalements (
  id           bigint generated always as identity primary key,
  signaleur_id uuid not null references auth.users on delete cascade,
  signale_id   uuid not null references auth.users on delete cascade,
  message_id   bigint references messages on delete set null,
  motif        text not null check (length(btrim(motif)) between 1 and 1000),
  cree_le      timestamptz not null default now()
);

create table if not exists lectures (
  utilisateur_id     uuid not null references auth.users on delete cascade,
  conversation_id    uuid not null references conversations on delete cascade,
  dernier_message_lu bigint not null default 0,
  primary key (utilisateur_id, conversation_id)
);

alter table lectures add column if not exists archivee_apres bigint;
alter table lectures add column if not exists effacee_jusqua bigint;

alter table profils       enable row level security;
alter table cartes        enable row level security;
alter table conversations enable row level security;
alter table messages      enable row level security;
alter table blocages      enable row level security;
alter table signalements  enable row level security;
alter table lectures      enable row level security;

create or replace function est_bloque(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from blocages
    where (bloqueur_id = a and bloque_id = b)
       or (bloqueur_id = b and bloque_id = a)
  );
$$;

drop policy if exists "profils lisibles par les membres" on profils;
create policy "profils lisibles par les membres"
  on profils for select to authenticated using (true);

drop policy if exists "chacun crée son profil" on profils;
create policy "chacun crée son profil"
  on profils for insert to authenticated
  with check (
    auth.uid() = id
    and ne_le is not null
    and ne_le <= current_date - interval '15 years'
  );

drop policy if exists "chacun modifie son profil" on profils;
create policy "chacun modifie son profil"
  on profils for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and ne_le is not null
    and ne_le <= current_date - interval '15 years'
  );

revoke select on profils from anon, authenticated;
grant  select (id, pseudo, contact, departement, cree_le) on profils to authenticated;

drop policy if exists "chacun gère ses cartes" on cartes;
create policy "chacun gère ses cartes"
  on cartes for all to authenticated
  using (auth.uid() = utilisateur_id)
  with check (auth.uid() = utilisateur_id);

drop policy if exists "cartes proposées ou recherchées visibles" on cartes;
create policy "cartes proposées ou recherchées visibles"
  on cartes for select to authenticated
  using (recherchee or echangeable);

drop policy if exists "mes conversations" on conversations;
create policy "mes conversations"
  on conversations for select to authenticated
  using (auth.uid() in (membre_a, membre_b));

drop policy if exists "ouvrir une conversation" on conversations;
create policy "ouvrir une conversation"
  on conversations for insert to authenticated
  with check (auth.uid() in (membre_a, membre_b));

drop policy if exists "lire mes messages" on messages;
create policy "lire mes messages"
  on messages for select to authenticated
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and auth.uid() in (c.membre_a, c.membre_b)
    )
    and messages.id > coalesce((
      select l.effacee_jusqua from lectures l
      where l.conversation_id = messages.conversation_id
        and l.utilisateur_id = auth.uid()
    ), 0)
  );

drop policy if exists "écrire dans mes conversations" on messages;
create policy "écrire dans mes conversations"
  on messages for insert to authenticated
  with check (auth.uid() = auteur_id and exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth.uid() in (c.membre_a, c.membre_b)
      and not est_bloque(c.membre_a, c.membre_b)
  ));

drop policy if exists "je gère mes blocages" on blocages;
create policy "je gère mes blocages"
  on blocages for all to authenticated
  using (auth.uid() = bloqueur_id)
  with check (auth.uid() = bloqueur_id);

drop policy if exists "je signale" on signalements;
create policy "je signale"
  on signalements for insert to authenticated
  with check (auth.uid() = signaleur_id and signale_id <> auth.uid());

drop policy if exists "je relis mes signalements" on signalements;
create policy "je relis mes signalements"
  on signalements for select to authenticated
  using (auth.uid() = signaleur_id);

drop policy if exists "je gère mes lectures" on lectures;
create policy "je gère mes lectures"
  on lectures for all to authenticated
  using (auth.uid() = utilisateur_id)
  with check (auth.uid() = utilisateur_id);

drop function if exists mon_profil();
create function mon_profil()
returns table (
  pseudo      text,
  contact     text,
  ne_le       date,
  ville       text,
  code_postal text,
  departement text,
  latitude    double precision,
  longitude   double precision
)
language sql
security definer
stable
set search_path = public
as $$
  select p.pseudo, p.contact, p.ne_le, p.ville, p.code_postal,
         p.departement, p.latitude, p.longitude
  from profils p
  where p.id = auth.uid();
$$;

drop function if exists distance_km(uuid, uuid);
create function distance_km(a uuid, b uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select round(
    6371 * 2 * asin(least(1.0, sqrt(
        power(sin(radians(pb.latitude - pa.latitude) / 2), 2)
      + cos(radians(pa.latitude)) * cos(radians(pb.latitude))
        * power(sin(radians(pb.longitude - pa.longitude) / 2), 2)
    )))
  )::integer
  from profils pa, profils pb
  where pa.id = a
    and pb.id = b
    and pa.latitude is not null and pa.longitude is not null
    and pb.latitude is not null and pb.longitude is not null;
$$;

drop function if exists echanges_possibles();
drop function if exists echanges_possibles(integer);
create function echanges_possibles(distance_max integer default null)
returns table (
  membre_id    uuid,
  pseudo       text,
  contact      text,
  departement  text,
  distance     integer,
  il_me_donne  text[],
  je_lui_donne text[]
)
language sql
stable
as $$
  with moi as (
    select carte_id, recherchee, echangeable
    from cartes
    where utilisateur_id = auth.uid()
  ),
  il_me_donne as (
    select c.utilisateur_id, array_agg(c.carte_id order by c.carte_id) as cartes
    from cartes c
    join moi on moi.carte_id = c.carte_id
    where c.utilisateur_id <> auth.uid()
      and c.echangeable
      and moi.recherchee
    group by c.utilisateur_id
  ),
  je_lui_donne as (
    select c.utilisateur_id, array_agg(c.carte_id order by c.carte_id) as cartes
    from cartes c
    join moi on moi.carte_id = c.carte_id
    where c.utilisateur_id <> auth.uid()
      and c.recherchee
      and moi.echangeable
    group by c.utilisateur_id
  )
  select
    p.id,
    p.pseudo,
    p.contact,
    p.departement,
    distance_km(auth.uid(), p.id),
    coalesce(d.cartes, '{}'::text[]),
    coalesce(r.cartes, '{}'::text[])
  from profils p
  left join il_me_donne  d on d.utilisateur_id = p.id
  left join je_lui_donne r on r.utilisateur_id = p.id
  where p.id <> auth.uid()
    and (d.cartes is not null or r.cartes is not null)
    and not est_bloque(auth.uid(), p.id)
    and (distance_max is null or distance_km(auth.uid(), p.id) <= distance_max);
$$;

drop function if exists ouvrir_conversation(uuid);
create function ouvrir_conversation(autre uuid)
returns uuid
language plpgsql
as $$
declare
  a       uuid := least(auth.uid(), autre);
  b       uuid := greatest(auth.uid(), autre);
  id_conv uuid;
begin
  if auth.uid() is null or autre is null or autre = auth.uid() then
    raise exception 'Conversation impossible';
  end if;
  select id into id_conv from conversations where membre_a = a and membre_b = b;
  if id_conv is null then
    insert into conversations (membre_a, membre_b) values (a, b) returning id into id_conv;
  end if;
  return id_conv;
end;
$$;

drop function if exists mes_conversations();
create function mes_conversations()
returns table (
  conversation_id uuid,
  autre_id        uuid,
  pseudo          text,
  dernier_message text,
  dernier_envoi   timestamptz,
  non_lus         integer,
  archivee        boolean
)
language sql
stable
as $$
  select
    c.id,
    case when c.membre_a = auth.uid() then c.membre_b else c.membre_a end,
    p.pseudo,
    m.texte,
    m.envoye_le,
    coalesce(nl.nombre, 0)::integer,
    l.archivee_apres is not null and coalesce(m.id, 0) <= l.archivee_apres
  from conversations c
  join profils p
    on p.id = case when c.membre_a = auth.uid() then c.membre_b else c.membre_a end
  left join lectures l
    on l.conversation_id = c.id and l.utilisateur_id = auth.uid()
  left join lateral (
    select id, texte, envoye_le
    from messages
    where conversation_id = c.id
    order by id desc
    limit 1
  ) m on true
  left join lateral (
    select count(*) as nombre
    from messages
    where conversation_id = c.id
      and auteur_id <> auth.uid()
      and id > coalesce(l.dernier_message_lu, 0)
  ) nl on true
  where auth.uid() in (c.membre_a, c.membre_b)
    and not est_bloque(c.membre_a, c.membre_b)
    and (l.effacee_jusqua is null or m.id is not null)
  order by coalesce(m.envoye_le, c.cree_le) desc;
$$;

drop function if exists borne_conversation(uuid);
create function borne_conversation(conversation uuid)
returns bigint
language plpgsql
as $$
declare
  borne bigint;
begin
  if not exists (
    select 1 from conversations c
    where c.id = conversation and auth.uid() in (c.membre_a, c.membre_b)
  ) then
    raise exception 'Conversation inconnue';
  end if;

  select coalesce(max(m.id), 0) into borne
  from messages m where m.conversation_id = conversation;

  return greatest(borne, coalesce((
    select l.effacee_jusqua from lectures l
    where l.conversation_id = conversation and l.utilisateur_id = auth.uid()
  ), 0));
end;
$$;

drop function if exists archiver_conversation(uuid, boolean);
create function archiver_conversation(conversation uuid, archiver boolean)
returns void
language plpgsql
as $$
declare
  borne bigint := borne_conversation(conversation);
begin
  insert into lectures (utilisateur_id, conversation_id, archivee_apres)
  values (auth.uid(), conversation, case when archiver then borne else null end)
  on conflict (utilisateur_id, conversation_id)
  do update set archivee_apres = excluded.archivee_apres;
end;
$$;

drop function if exists supprimer_conversation(uuid);
create function supprimer_conversation(conversation uuid)
returns void
language plpgsql
as $$
declare
  borne bigint := borne_conversation(conversation);
begin
  insert into lectures (utilisateur_id, conversation_id, effacee_jusqua, dernier_message_lu, archivee_apres)
  values (auth.uid(), conversation, borne, borne, null)
  on conflict (utilisateur_id, conversation_id)
  do update set
    effacee_jusqua = greatest(coalesce(lectures.effacee_jusqua, 0), excluded.effacee_jusqua),
    dernier_message_lu = greatest(lectures.dernier_message_lu, excluded.dernier_message_lu),
    archivee_apres = null;
end;
$$;

drop function if exists total_non_lus();
create function total_non_lus()
returns integer
language sql
stable
as $$
  select coalesce(count(*), 0)::integer
  from messages m
  join conversations c on c.id = m.conversation_id
  left join lectures l
    on l.conversation_id = c.id and l.utilisateur_id = auth.uid()
  where auth.uid() in (c.membre_a, c.membre_b)
    and m.auteur_id <> auth.uid()
    and m.id > coalesce(l.dernier_message_lu, 0)
    and not est_bloque(c.membre_a, c.membre_b);
$$;

alter table profils add column if not exists est_admin boolean not null default false;

create or replace function est_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.est_admin from profils p where p.id = auth.uid()), false);
$$;

create table if not exists corrections (
  id           bigserial primary key,
  univers      text not null default 'pocket' check (univers in ('pocket', 'physique')),
  genre        text not null check (genre in ('visuel', 'carte', 'extension')),
  cible        text not null,
  donnees      jsonb not null default '{}'::jsonb,
  image_chemin text,
  cree_le      timestamptz not null default now(),
  cree_par     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  unique (univers, genre, cible)
);

alter table corrections enable row level security;

drop policy if exists "corrections lisibles par tous" on corrections;
create policy "corrections lisibles par tous"
  on corrections for select to anon, authenticated using (true);

drop policy if exists "seul l'administrateur ajoute une correction" on corrections;
create policy "seul l'administrateur ajoute une correction"
  on corrections for insert to authenticated with check (est_admin());

drop policy if exists "seul l'administrateur modifie une correction" on corrections;
create policy "seul l'administrateur modifie une correction"
  on corrections for update to authenticated using (est_admin()) with check (est_admin());

drop policy if exists "seul l'administrateur supprime une correction" on corrections;
create policy "seul l'administrateur supprime une correction"
  on corrections for delete to authenticated using (est_admin());

insert into storage.buckets (id, name, public)
values ('corrections', 'corrections', true)
on conflict (id) do nothing;

drop policy if exists "visuels de correction lisibles par tous" on storage.objects;
create policy "visuels de correction lisibles par tous"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'corrections');

drop policy if exists "seul l'administrateur dépose un visuel" on storage.objects;
create policy "seul l'administrateur dépose un visuel"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'corrections' and est_admin());

drop policy if exists "seul l'administrateur remplace un visuel" on storage.objects;
create policy "seul l'administrateur remplace un visuel"
  on storage.objects for update to authenticated
  using (bucket_id = 'corrections' and est_admin())
  with check (bucket_id = 'corrections' and est_admin());

drop policy if exists "seul l'administrateur retire un visuel" on storage.objects;
create policy "seul l'administrateur retire un visuel"
  on storage.objects for delete to authenticated
  using (bucket_id = 'corrections' and est_admin());

notify pgrst, 'reload schema';
