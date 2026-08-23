-- push_vapid_keys: klubbens VAPID-nøglepar til Web Push (RFC 8292).
--
-- Hvorfor i databasen og ikke kun som function-secrets: at sætte et repo-secret
-- er et manuelt dashboard-trin, og projektets kerneprincip er, at alt ud over
-- engangsopsætningen i #2/#3 skal kunne ske ved at skrive kode og pushe (se
-- CLAUDE.md). Uden nøglerne svarede `chat-push` 503, og appen sagde
-- "Push-notifikationer er ikke konfigureret på serveren endnu" -- uden nogen
-- vej frem, der ikke gik gennem et dashboard.
--
-- Med denne tabel genererer `chat-push` selv et nøglepar første gang, det får
-- brug for et, og gemmer det her. Sætter nogen alligevel VAPID_PUBLIC_KEY/
-- VAPID_PRIVATE_KEY som function-secrets, vinder de -- tabellen er fallbacken,
-- ikke en overstyring.
--
-- Præcis én række: `id` er en boolean med en check-constraint, der kun tillader
-- true. Det gør `on conflict (id) do nothing` til den låsefri måde at afgøre et
-- kapløb mellem to samtidige kald, der begge nåede at generere et nøglepar --
-- taberen læser bare vinderens række bagefter.
create table public.push_vapid_keys (
  id boolean primary key default true,
  -- Offentlig P-256-nøgle, rå (0x04 || x || y), base64url. Udleveres til
  -- klienten af functionens GET-endpoint.
  public_key text not null,
  -- Privat nøgle: `d`-komponenten fra JWK'en, base64url. Forlader aldrig
  -- Edge Function-miljøet -- ingen anden end service-role kan læse rækken.
  private_key text not null,
  created_at timestamptz not null default now(),
  constraint push_vapid_keys_singleton check (id)
);

-- RLS slået til uden en eneste policy: hverken anon eller authenticated kan
-- røre tabellen. Kun Edge Functionens Secret key (service-role) omgår RLS.
-- Grants trækkes tilbage oveni, så en fremtidig policy heller ikke ved et uheld
-- kan åbne for læsning af den private nøgle.
alter table public.push_vapid_keys enable row level security;

revoke all on public.push_vapid_keys from anon, authenticated;
