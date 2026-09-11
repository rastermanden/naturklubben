-- Hjertesager på profilen: små mærker ved navnet, som medlemmet selv vælger
-- (🇺🇦 Ukraine, 🏳️‍🌈 regnbueflag, 💉 vaccineret). De vises på medlemslisten
-- og i chatten sammen med pronominerne.
--
-- Sættet er lukket og gemmes som slugs, ikke emoji: så kan appen tegne dem
-- ens overalt og skifte tegnet uden at røre data. Nye mærker tilføjes ved at
-- udvide constrainten i en ny migration.

-- Hjælper til constrainten: en check må ikke bruge en subquery, så dubletter
-- måles i en immutable funktion.
create function public.distinct_count(items text[])
returns integer
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select count(distinct item)::integer from unnest(items) as item
$$;

grant execute on function public.distinct_count(text[])
  to anon, authenticated, service_role;

alter table public.profiles
  add column causes text[] not null default '{}'
  constraint profiles_causes_known
    check (
      causes <@ array['ukraine', 'regnbue', 'vaccine']::text[]
      and cardinality(causes) = public.distinct_count(causes)
    );

-- Tabel-update er trukket tilbage fra authenticated (#96), så profilens
-- redigerbare felter er en eksplicit kolonneliste.
grant update (causes)
  on table public.profiles
  to authenticated;

insert into public.feature_announcements (slug, title, body, path)
values (
  'profil-hjertesager',
  'Vis, hvad du står for, ved dit navn',
  'På din profil kan du nu sætte små mærker ved dit navn: 🇺🇦 for Ukraine, 🏳️‍🌈 regnbueflaget og 💉 for vaccineret. De vises på medlemslisten og i chatten -- vælg dem, der passer på dig, eller ingen.',
  'profil'
)
on conflict (slug) do nothing;
