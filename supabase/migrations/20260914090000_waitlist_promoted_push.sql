-- Push-notifikation, når et medlem rykker op fra ventelisten (#236).
--
-- Ventelisten (#222) fortæller allerede den oprykkede i chatten med en
-- mention (announceWaitlist.ts). Nu hvor push ud over chatten har typer med
-- eget til/fra pr. medlem (#216), skal en oprykning også kunne sende en push
-- -- medmindre medlemmet har slået typen fra.
--
-- Recipienterne afgøres ikke af klientens egen liste: calendar-push snævrer
-- selv listen ind til de id'er, der reelt sidder på en attending-plads til
-- begivenheden lige nu (_shared/waitlistPromotionRecipients.ts), og nægter at
-- sende, hvis kalderen ikke selv har noget med begivenheden at gøre (er
-- arrangør, admin, eller selv har svaret på den). Se calendar-push/index.ts.
--
-- Ingen nye tabeller eller sekvenser oprettes her, så der er ingen nye grants
-- at eksplicitere (#209) -- notification_preferences og push_deliveries har
-- allerede deres grants fra 20260913150000_push_notification_types.sql;
-- denne migration udvider kun deres kind-constraints og genskriver
-- set_notification_preference med samme signatur og samme grants.

alter table public.notification_preferences
  drop constraint if exists notification_preferences_kind_check,
  add constraint notification_preferences_kind_check
    check (
      kind in (
        'event_created', 'event_reminder', 'badge_nomination_review',
        'waitlist_promoted'
      )
    );

alter table public.push_deliveries
  drop constraint if exists push_deliveries_kind_check,
  add constraint push_deliveries_kind_check
    check (
      kind in (
        'event_created', 'event_reminder', 'badge_nomination_review',
        'waitlist_promoted'
      )
    );

-- Ingen række betyder stadig "ja tak" (selectPushRecipients i
-- _shared/pushRecipients.ts): typen er slået til for alle -- også dem, der
-- var medlem før denne migration -- uden at nogen række skal indsættes her.
create or replace function public.set_notification_preference(
  p_kind text,
  p_enabled boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_kind is null
    or p_kind not in (
      'event_created', 'event_reminder', 'badge_nomination_review',
      'waitlist_promoted'
    )
  then
    raise exception 'Unknown notification kind' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'enabled is required' using errcode = '22023';
  end if;

  insert into public.notification_preferences (user_id, kind, enabled)
  values (actor, p_kind, p_enabled)
  on conflict (user_id, kind) do update
    set enabled = excluded.enabled,
        updated_at = now();
end;
$$;

revoke all on function public.set_notification_preference(text, boolean)
  from public;
grant execute on function public.set_notification_preference(text, boolean)
  to authenticated;

insert into public.feature_announcements (slug, title, body, path)
values (
  'venteliste-push',
  'Besked når du rykker op fra ventelisten',
  'Står du på venteliste til en tur, og bliver der plads til dig, kan appen nu også sende dig en notifikation om det -- ikke kun en besked i chatten. Vælg selv til eller fra på din profil under "Notifikationer".',
  'kalender'
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
