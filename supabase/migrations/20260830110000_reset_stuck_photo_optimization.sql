-- Billeder, der er faldet fast i 'processing' -- optimize-image kan dø midt i
-- arbejdet (timeout, hukommelse, flere samtidige uploads fra samme batch, se
-- docs/kodegennemgang-2026-08-23.md fund #2) uden nogensinde at nå
-- complete_photo_optimization. Rækken bliver stående som "Optimerer…" for
-- evigt, indtil ejeren selv trykker "prøv igen" -- hvilket sjældent sker for
-- et gammelt billede, ingen kigger på igen.
--
-- claim_photo_optimization betragter allerede et 'processing'-claim, der er
-- over ti minutter gammelt, som forældet og reclaim-bart. Denne migration gør
-- blot det samme proaktivt for allerede fastlåste rækker, så de retter sig
-- selv med det samme i stedet for at vente på, at nogen besøger galleriet.
-- Rammer aldrig et billede, der rent faktisk optimeres lige nu.
update public.photos
set optimization_status = 'pending',
    optimization_started_at = null,
    optimization_completed_at = null,
    optimization_error = null
where optimization_status = 'processing'
  and (
    optimization_started_at is null
    or optimization_started_at <= now() - interval '10 minutes'
  );
