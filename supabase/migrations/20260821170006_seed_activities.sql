-- Eksempel-aktiviteter så aktivitetssiden (#10) ikke er tom ved første deploy.
-- Ret/udbyg gerne indholdet direkte i Table Editor efter deploy -- denne seed er
-- kun et startpunkt.
insert into public.activities (title, description, icon, sort_order)
values
  (
    'Naturvandring',
    'Guidede ture i lokalområdets skove og enge, hvor vi kigger på planter, svampe og dyreliv.',
    'footprints',
    1
  ),
  (
    'Fugletårn',
    'Fælles fugleture til udkigstårne og vådområder -- kikkert kan lånes på stedet.',
    'binoculars',
    2
  ),
  (
    'Affaldsindsamling',
    'Vi rydder op langs stier og kyster nogle gange om året -- en hyggelig og nyttig ting at gøre sammen.',
    'trash-2',
    3
  )
on conflict do nothing;
