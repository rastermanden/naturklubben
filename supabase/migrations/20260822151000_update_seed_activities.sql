-- Opdater de oprindelige eksempel-aktiviteter til mere relevante forslag og
-- tilføj et par ekstra emner, så både eksisterende og nye miljøer viser dem.
delete from public.activities
where title in (
  'Naturvandring',
  'Fugletårn',
  'Affaldsindsamling',
  'Design af Mønter',
  'Udvikling af brænder til Aluminium',
  'Madkoordinering',
  'BøsseTennisGolf',
  'Hornfisk'
);

insert into public.activities (title, description, icon, sort_order)
values
  (
    'Design af Mønter',
    'Vi udvikler idéer og udtryk til klubbens egne mønter og finpudser design sammen.',
    'footprints',
    1
  ),
  (
    'Udvikling af brænder til Aluminium',
    'Vi tester løsninger og materialer til en brænder, der kan bruges i arbejdet med aluminium.',
    'binoculars',
    2
  ),
  (
    'Madkoordinering',
    'Vi planlægger indkøb, menuer og fordeling af madopgaver til fælles arrangementer.',
    null,
    3
  ),
  (
    'BøsseTennisGolf',
    'Vi arrangerer BøsseTennisGolf med plads til både konkurrence, grin og skæve regler.',
    'footprints',
    4
  ),
  (
    'Hornfisk',
    'Vi mødes om hornfisketure, grej og gode historier fra kysten.',
    'binoculars',
    5
  );
