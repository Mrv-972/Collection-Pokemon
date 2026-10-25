
alter table corrections drop constraint if exists corrections_genre_check;

alter table corrections add constraint corrections_genre_check
  check (genre in ('visuel', 'carte', 'extension', 'logo-extension', 'logo-serie'));

notify pgrst, 'reload schema';
