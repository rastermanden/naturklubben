-- Invarianter, der skal holde for hele skemaet. En ny tabel eller funktion, der
-- glemmer dem, fejler her i stedet for at slippe uset i produktion.
begin;

set local search_path = public, tests;

select plan(4);

select is_empty(
  $$select c.relname
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity$$,
  'alle tabeller i public har row level security slået til'
);

-- En security definer-funktion uden fast search_path kan narres til at kalde
-- en anden brugers objekter med definerens rettigheder.
select is_empty(
  $$select n.nspname || '.' || p.proname
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and (
        p.proconfig is null
        or not exists (
          select 1
          from unnest(p.proconfig) as config
          where config like 'search\_path=%'
        )
      )$$,
  'hver security definer-funktion har en låst search_path'
);

-- Anonyme må læse offentligt indhold, men aldrig skrive noget som helst.
select is_empty(
  $$select schemaname || '.' || tablename || ': ' || policyname
    from pg_policies
    where schemaname in ('public', 'storage')
      and cmd <> 'SELECT'
      and ('anon' = any(roles) or 'public' = any(roles))$$,
  'ingen politik giver anonyme skriveadgang'
);

select set_eq(
  $$select tablename
    from pg_publication_tables
    where pubname = 'supabase_realtime'$$,
  $$values ('messages'), ('photos'), ('message_reactions')$$,
  'realtime-publikationen indeholder præcis de tabeller, klienten abonnerer på'
);

select * from finish(true);

rollback;
