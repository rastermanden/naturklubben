-- Tilføjer chat_color til profiler, så brugere kan vælge en farve til chatten.
alter table public.profiles
  add column if not exists chat_color text not null default '#16a34a';
