

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
