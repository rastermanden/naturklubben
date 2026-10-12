-- Nyhed om kort- og artsvisningen i naturloggen (#220): observationer, der
-- har en position, kan ses på et kort med pan- og zoom, og under Arter er
-- der en artsoversigt med antal pr. art plus hvad "årets første" fund var.
insert into public.feature_announcements (slug, title, body, path)
values (
  'naturlog-kort-artsoversigt',
  'Kort og årets første i naturloggen',
  'Observationer med en position kan nu ses på et kort. Under Arter er der en artsoversigt med antal pr. art -- og hvad årets første fund var.',
  'naturlog'
)
on conflict (slug) do nothing;