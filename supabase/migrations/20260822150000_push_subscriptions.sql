-- push_subscriptions: Web Push-abonnementer, så medlemmer kan få en notifikation
-- på telefonen, når der kommer en ny besked i chatten (#14).
--
-- Én række per browser/installation, ikke per bruger: samme medlem kan have
-- appen installeret på både telefon og computer og skal have besked begge
-- steder. `endpoint` er push-tjenestens (FCM/Mozilla/Apple) unikke URL for
-- netop den installation og er derfor den naturlige nøgle.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  -- Nøglematerialet fra PushSubscription.getKey(), base64url-kodet. Bruges af
  -- chat-push-edge-functionen til at kryptere payloaden (RFC 8291).
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Et abonnement er personligt: kun ejeren kan se og røre sine egne rækker.
-- Edge-functionen læser på tværs af alle brugere med Secret key og omgår RLS.
create policy "Users can read own push subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own push subscriptions"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own push subscriptions"
  on public.push_subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own push subscriptions"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

create function public.touch_push_subscription_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.touch_push_subscription_updated_at();
