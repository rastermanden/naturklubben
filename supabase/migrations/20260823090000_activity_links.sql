-- Aktiviteter kan henvise videre til en relevant side, fx klubbens egen valuta.
-- Linket ligger som data på aktiviteten (ikke hårdkodet i frontenden), så flere
-- aktiviteter kan få et link uden en ny kodeændring.
alter table public.activities
  add column if not exists link_url text,
  add column if not exists link_label text;

-- Et link giver kun mening med en label at vise det under, og omvendt.
alter table public.activities
  drop constraint if exists activities_link_complete;

alter table public.activities
  add constraint activities_link_complete
  check ((link_url is null) = (link_label is null));

-- Aktiviteterne om mønter og metal handler begge om klubbens valuta.
update public.activities
set link_url = 'https://bral.dk',
    link_label = 'Læs om valutaen på bral.dk'
where title in (
  'Design af Mønter',
  'Udvikling af brænder til Aluminium'
);
