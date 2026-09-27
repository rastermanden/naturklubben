-- Link fra en begivenhed i kalenderen til dens billeder (#261). Ren
-- frontend-ændring: viewet gallery_event_photo_counts har allerede grant til
-- authenticated og RLS via security_invoker -- kun nyheden til medlemmerne.

insert into public.feature_announcements (slug, title, body, path)
values (
  'kalender-billeder-fra-turen',
  'Se billederne fra en tur direkte i kalenderen',
  'Har nogen lagt billeder op fra en tur, står der nu "Se billeder" på turen i kalenderen. Et tryk, og du er i turens album i galleriet.',
  'kalender'
)
on conflict (slug) do nothing;
