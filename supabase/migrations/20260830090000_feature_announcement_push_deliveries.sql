-- Nyheder om nye funktioner: hver enhed skal have den samme nyhed én gang.
--
-- Outboxen fra 20260829160000 tæller leveringen på nyheden og ikke på
-- modtageren. Fejler ét eneste push -- en enhed, hvis push-tjeneste svarer 403
-- eller 500, et endpoint fra en tjeneste, vi ikke understøtter -- ryger hele
-- nyheden tilbage som 'failed', og næste forsøg sender den forfra til *alle*
-- abonnementer. Også dem, der fik den første gang.
--
-- Det viser sig som en gentagelse, netop når en ny funktion lander: klienten
-- kalder kun functionen, så længe der findes en nyhed under syv dage gammel,
-- så en ældre nyhed, der aldrig nåede 'sent', ligger stille, indtil den næste
-- nyhed vækker udsendelsen -- og så kommer de to af sted sammen.
--
-- Loggen her flytter regnskabet ned på det enkelte abonnement: functionen
-- springer de abonnementer over, der allerede har fået nyheden, så et forsøg
-- nummer to kun rammer dem, der stadig mangler den.

create table public.feature_announcement_push_deliveries (
  announcement_id uuid not null
    references public.feature_announcements (id) on delete cascade,
  -- Abonnementet og ikke medlemmet: har man både telefon og computer, skal et
  -- genforsøg kunne nå den ene enhed uden at vække den anden igen. Referencen
  -- rydder samtidig op af sig selv -- forsvinder abonnementet (medlemmet slår
  -- notifikationer fra, sletter sin konto, eller push-tjenesten melder
  -- endpointet dødt), forsvinder dets leveringer med det.
  subscription_id uuid not null
    references public.push_subscriptions (id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (announcement_id, subscription_id)
);

alter table public.feature_announcement_push_deliveries
  enable row level security;

-- Ingen policies og ingen grants: leveringsloggen er driftsdata på linje med
-- push_vapid_keys, og kun functionens Secret key rører den. Et medlem har
-- ingen grund til at kunne se, hvis enheder der har fået en notifikation.
revoke all on table public.feature_announcement_push_deliveries
  from anon, authenticated;

-- De nyheder, der allerede har været ude mindst én gang, har ingen log over,
-- hvem der fik dem. Uden det ville deres næste forsøg gøre præcis det, denne
-- migration skal fjerne: sende dem forfra til alle. De lukkes derfor her. De
-- er nået frem til de enheder, der kunne nås, og resten er ikke værd at vække
-- klubben en ekstra gang for -- nyheden står stadig under /nyheder.
update public.feature_announcements
set push_status = 'skipped',
    push_error =
      'Lukket ved indførelsen af leveringsloggen: nyheden havde allerede '
      || 'været sendt mindst én gang.'
where push_status in ('pending', 'sending', 'failed')
  and push_attempts > 0;

notify pgrst, 'reload schema';
