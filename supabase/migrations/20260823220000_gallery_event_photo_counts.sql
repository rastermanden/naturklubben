-- Galleriets begivenhedsfilter (#149): dropdown'en skal kun vise begivenheder,
-- der rent faktisk har billeder, sammen med hvor mange. En security-invoker-view
-- (samme mønster som calendar_feed_events) sikrer, at RLS på photos/events
-- stadig afgør, hvad den kaldende bruger kan se -- inner joinet udelader i sig
-- selv begivenheder uden billeder.
create view public.gallery_event_photo_counts
with (security_barrier = true, security_invoker = true)
as
select
  e.id as event_id,
  e.title,
  count(p.id) as photo_count
from public.events e
join public.photos p on p.event_id = e.id
group by e.id, e.title;

revoke all on public.gallery_event_photo_counts from public, anon, authenticated;
grant select on public.gallery_event_photo_counts to authenticated;

comment on view public.gallery_event_photo_counts is
  'Events with at least one photo and their photo count -- powers the gallery event filter dropdown (#149).';
