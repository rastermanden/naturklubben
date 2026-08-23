-- BøsseTennisGolf har sin egen side med regler og praktisk info. Ny migration
-- frem for en rettelse i 20260823090000: Supabase kører kun *nye* migrationsfiler
-- på en preview branch, så en ændring i den eksisterende fil ville ikke slå
-- igennem på PR-preview'et.
update public.activities
set link_url = 'https://rastermanden.github.io/btg/',
    link_label = 'Se BøsseTennisGolf-siden'
where title = 'BøsseTennisGolf';
