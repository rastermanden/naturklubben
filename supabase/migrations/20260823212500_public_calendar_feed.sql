-- Public calendar subscriptions expose only the fields needed by calendar apps.
-- Column grants keep descriptions private even if anon queries events directly;
-- the security-invoker view ensures RLS remains the source of row visibility.
create policy "Anon can read public event fields"
  on public.events for select
  to anon
  using (true);

grant select (id, title, location, start_at, end_at)
  on table public.events
  to anon;

create view public.calendar_feed_events
with (security_barrier = true, security_invoker = true)
as
select
  id,
  title,
  location,
  start_at,
  end_at
from public.events;

revoke all on table public.calendar_feed_events from public, anon, authenticated;
grant select on table public.calendar_feed_events to anon;

comment on view public.calendar_feed_events is
  'Public, data-minimized event fields used by the iCalendar subscription feed.';
