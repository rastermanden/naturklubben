# Kodegennemgang — 23. august 2026

Gennemgang af hele appen på `main` @ `07d7a27`: arkitektur, styrker, fund og roadmap.
Alt herunder er efterprøvet i koden; filhenvisningerne er præcise.

| Mål             | Værdi                          |
| --------------- | ------------------------------ |
| Linjer TS & SQL | 18.909                         |
| Tests           | 163, alle grønne               |
| Migrationer     | 33                             |
| Edge Functions  | 6                              |
| JS-bundle       | 613 kB (172 kB gzip), én chunk |
| `npm audit`     | 0 sårbarheder                  |

## Indhold

- [Hvad appen er](#hvad-appen-er)
- [Sådan hænger lagene sammen](#sådan-hænger-lagene-sammen)
- [Det der holder](#det-der-holder)
- [Fund](#fund)
- [Roadmap](#roadmap)
- [Det korte svar](#det-korte-svar)

## Hvad appen er

En medlemsapp for Naturklubben: offentlig forside og aktivitetsside, og bag login
kalender med tilmelding, billedgalleri med serveroptimering, gruppechat med svar,
reaktioner, søgning og push-notifikationer, medlemsliste, adminpanel med
invitationsliste og rollestyring, prøvemedlemskabsansøgning, samt selvbetjent
kontosletning og en datapolitik.

Frontenden er Vite + React 19 + TypeScript 6 + Tailwind 4, udgivet statisk på GitHub
Pages. Backenden er Supabase: Postgres med row level security som eneste
autorisationslag, Auth, Storage i tre buckets, Realtime til chat og galleri, og seks
Deno-baserede Edge Functions. Der findes ingen egen server.

Hele udviklingsmodellen hviler på ét princip fra `CLAUDE.md`: intet trin må kræve en
lokal Docker-stak eller en manuelt kørt deploy-kommando. Alt sker ved at skrive kode,
committe og åbne en PR. Det princip er faktisk holdt hele vejen igennem — og det er
også dét, der forklarer de fleste af fundene længere nede.

## Sådan hænger lagene sammen

Fire lag, hver med sin egen deploy-vej. De to nederste er interessante, fordi de er
dér, autorisationen bor.

**Lag 1 — klienten** (`deploy.yml` → `gh-pages`)
React Router med `ProtectedRoute`/`AdminRoute`, TanStack Query som eneste cache, og en
håndskrevet service worker der både precacher app-shellen og håndterer `push`. En
genereret `404.html` giver SPA-fallback på GitHub Pages, som ellers ikke har nogen.

**Lag 2 — Edge Functions** (`deploy-functions.yml`)
`optimize-image` (WASM-resize + EXIF-rotation), `chat-push` (Web Push med
selvgenererede VAPID-nøgler), `delete-account`, `submit-probation-application`,
`probation-notifications` og `calendar-feed`. Alle bruger Secret key og omgår RLS, så
autorisationen ligger i deres egen kode.

**Lag 3 — databasen** (Supabase GitHub-integration)
33 migrationer, kørt automatisk på en Preview Branch pr. PR og på produktion ved merge.
Skriveadgang er systematisk trukket tilbage fra `authenticated` og erstattet af snævre
`security definer`-RPC'er med advisory locks og attempt-fencing. Det er den stærkeste
del af kodebasen.

**Lag 4 — konfigurationen** (`sync-auth-config.yml`)
Supabases Site URL og redirect-allowlist holdes som kode og skubbes idempotent ved hver
push til `main`. Det lukker den klassiske fælde, hvor et bekræftelseslink i en mail
lander på en 404, fordi nogen har ændret en indstilling i dashboardet.

## Det der holder

Værd at sige højt, fordi det er de steder, hvor man ellers ville have gættet på et
problem og ikke fundet noget.

**Autorisationsmodellen.** Ingen tabel kan skrives direkte fra klienten, hvor det
betyder noget. `set_admin_role` tager en advisory lock _før_ autorisationstjekket, så en
netop nedgraderet admin ikke kan snige en ventende ændring igennem, og den nægter at
fjerne den sidste administrator. Billedoptimering bruger attempt-fencing, så en langsom
worker ikke overskriver et nyere forsøg.

**Kontosletning.** Fem nummererede stadier med stabile fejlkoder, gennemtænkt idempotens
hen over Storage/Postgres/Auth-grænserne, og en reservation der gør sidste-admin-tjekket
sikkert mod to samtidige selvsletninger. Dokumenteret i kommentarer, der forklarer
_hvorfor_ rækkefølgen ikke må byttes om.

**Tilgængelighed.** Skip-link, fokusstyring i dialoger (`useDialogFocus`),
rutenavigation der annonceres for skærmlæsere, kontrasttjek på brugervalgte chatfarver,
`motion-safe` på skeletter, 44px touch-mål. Der er arbejdet bevidst med det, ikke bare
tilføjet `aria-label`.

**Kommentarerne.** De forklarer konsekvent hvilken fejl der blev observeret, og hvorfor
koden nu ser sådan ud — fx hvorfor PostgREST-embeddet skal bruge kolonnenavnet frem for
constraint-navnet. Det er institutionel hukommelse, ikke støj.

**Preview-kæden.** Rører en PR `supabase/`, bygges preview'et mod PR'ens egen
databasebranch — og fejler hellere end at bygge stille mod produktion. Rører den ikke,
siges det højt i job-opsummeringen.

## Fund

Sorteret efter hvor meget det gør ondt, ikke efter hvor svært det er at rette. Hvert
fund er oprettet som et issue med et severity-label.

| #   | Fund                                   | Label      | Issue |
| --- | -------------------------------------- | ---------- | ----- |
| 1   | Kalenderabonnementet virker ikke       | `blocker`  | #118  |
| 2   | Billeder fastlåst i `processing`       | `blocker`  | #115  |
| 3   | Ingen migration køres i CI             | `risiko`   | #119  |
| 4   | Fem af seks functions typechecker ikke | `risiko`   | #120  |
| 5   | Admin kan ikke fjerne andres billeder  | `risiko`   | #121  |
| 6   | Ingen error boundary                   | `risiko`   | #122  |
| 7   | Ét bundle på 613 kB                    | `friktion` | #123  |
| 8   | Galleriet henter alt, hver gang        | `friktion` | #124  |
| 9   | Manglende indeks                       | `friktion` | #125  |
| 10  | iCal-generatoren findes to gange       | `friktion` | #126  |
| 11  | Query-klienten er tom                  | `finish`   | #127  |
| 12  | Ingen vedligeholdsmekanik              | `finish`   | #128  |
| 13  | Delekort og dataudlevering mangler     | `finish`   | #129  |

### Blocker

#### 1. Kalenderabonnementet virker ikke — af to uafhængige grunde

Kalendersiden viser knappen "Abonnér på kalender", som peger på
`webcal://…/functions/v1/calendar-feed`. En kalender-app, der abonnerer på den URL, kan
ikke sende en Authorization-header — og `calendar-feed` deployes _uden_
`--no-verify-jwt` og står ikke i `config.toml`. Gatewayen svarer 401, og abonnementet
fejler.

Kom man forbi gatewayen, ville det stadig ikke virke: functionen læser `events` med
anon-nøglen, men `events` har kun en select-policy `to authenticated`. Der findes ingen
anon-policy på tabellen. Resultatet ville være en tom VCALENDAR. Oveni læser den
`SUPABASE_ANON_KEY`, som er navnet på det gamle JWT-nøglesystem, projektet ellers er
migreret væk fra.

_Sådan lukkes det:_ Beslut først, om feedet er offentligt eller medlemsspecifikt.
Offentligt: udstil en anon-læsbar view over `events` med kun titel, tid og sted, deploy
med `--no-verify-jwt`, og læs publishable key. Medlemsspecifikt: giv hvert medlem et
feed-token i stien. Indtil ét af de to er på plads, bør knappen skjules — en knap, der
altid fejler, er værre end ingen knap.

Filer: `supabase/functions/calendar-feed/index.ts:138`, `supabase/config.toml`,
`.github/workflows/deploy-functions.yml`, `src/pages/CalendarPage.tsx:261`

#### 2. Billeder, der sætter sig fast i "processing", heler aldrig sig selv

Dør `optimize-image` midt i arbejdet — timeout, hukommelse, et format `imagescript` ikke
kan afkode — når den aldrig at kalde `complete_photo_optimization`. Rækken bliver
stående som `processing`, og efter ti minutter viser galleriet badget "Optimering
stoppet" for altid. Det er det, der er meldt som #115.

Databasen er allerede klar til at løse det: `claim_photo_optimization` accepterer
eksplicit et forældet `processing`-claim, der er over ti minutter gammelt. Det er kun
klienten, der ikke spørger — `pendingPhotosToOptimize` vælger udelukkende status
`pending`, og der findes en test, der cementerer netop den udeladelse. Ejeren kan trykke
"prøv igen" manuelt, men et gammelt billede har sjældent en ejer, der kigger forbi.

_Sådan lukkes det:_ Lad auto-heleren også tage forældede `processing`-rækker med (samme
ti-minutters grænse som RPC'en bruger), og opdatér testen tilsvarende. Suppler med en
migration, der nulstiller allerede fastlåste rækker til `pending` — samme mønster som
`20260823180000_reset_legacy_photo_optimization.sql` brugte til #100.

Filer: `src/features/gallery/optimizationStatus.ts:41`,
`src/features/gallery/pendingPhotosToOptimize.test.ts:47`,
`supabase/migrations/20260823161000_gallery_upload_status.sql:117`

### Risiko

#### 3. Ingen migration bliver nogensinde kørt i CI

Migrationerne "testes" med regex over deres egen SQL-tekst —
`expect(sql).toMatch(/create or replace function …/)`. Det fanger, at en bestemt linje
står i filen. Det fanger ikke en syntaksfejl, en policy der åbner mere end tilsigtet, en
manglende `grant`, eller en funktion der returnerer forkert. Testene knækker desuden,
hvis nogen omformaterer SQL'en uden at ændre betydningen. Den eneste rigtige validering
sker på Supabases Preview Branch — efter PR'en er åbnet, og kun hvis PR'en rører
`supabase/`.

Det er en direkte konsekvens af no-Docker-princippet, men princippet handler om hvad en
_bidragyder_ skal have installeret. En Postgres-service-container i en GitHub-runner
kræver intet af nogen.

_Sådan lukkes det:_ Kør `supabase/postgres` som service container i `ci.yml`, bootstrap
et minimalt `auth`/`storage`-skema plus `supabase_realtime`-publikationen, afspil alle
migrationer i rækkefølge, og assertér RLS med pgTAP: log ind som medlem A, prøv at slette
medlem B's besked, forvent afvisning.

Filer: `supabase/functions/chat-history-search/migration.test.ts`,
`.github/workflows/ci.yml`

#### 4. Fem af seks Edge Functions typechecker aldrig

`ci.yml` kører `deno check` på præcis én fil: `delete-account/index.ts`.
`optimize-image` (532 linjer), `chat-push`, `probation-notifications`, `calendar-feed`
og `submit-probation-application` går urørte gennem CI og bliver først afvist ved deploy
— eller slet ikke, hvis fejlen er i en gren, der kun rammes ved kørsel. Samme sted: alle
functions importerer `https://esm.sh/@supabase/supabase-js@2` med flydende minorversion,
så produktionsadfærden kan ændre sig uden en eneste commit.

_Sådan lukkes det:_ Udvid til `deno check supabase/functions/*/index.ts` — det er én
linjes ændring. Pin importerne til en eksakt version (og gerne `npm:`-specifiers, som
Edge Runtime understøtter), og lad `deno.lock` være committet.

Filer: `.github/workflows/ci.yml:33`, `supabase/functions/*/index.ts`

#### 5. En administrator kan ikke fjerne et andet medlems billede

Moderationsrettighederne er inkonsistente. En admin kan slette enhver begivenhed
("Admins can delete any event") og soft-slette enhver chatbesked (`soft_delete_message`
tjekker `public.is_admin()`). Men galleriet har ingen tilsvarende vej: insert/update/
delete er trukket tilbage fra `authenticated`, og alle RPC'er — `upsert_photo_upload`,
`claim_photo_deletion` — matcher hårdt på `uploaded_by = auth.uid()`. Uploaderen er den
eneste, der kan fjerne noget.

For en klub, hvor der bliver taget billeder af flere end fotografen, er det den forkerte
standard — og det er også en GDPR-vinkel: et medlem, der beder om at få et billede af
sig selv fjernet, kan i dag kun få det, hvis uploaderen selv gør det.

_Sådan lukkes det:_ Lad `claim_photo_deletion` acceptere en admin på samme måde som
`soft_delete_message` gør, og log handlingen i en tabel svarende til
`admin_role_changes`.

Filer: `supabase/migrations/20260823161000_gallery_upload_status.sql:230`,
`supabase/migrations/20260823194500_message_soft_deletion.sql`

#### 6. Ingen error boundary — og en service worker, der husker den hvide side

Der findes ikke en eneste `ErrorBoundary` i `src/`. Kaster en komponent under render,
forsvinder hele React-træet, og brugeren får en blank side uden tekst, uden knap, uden
vej tilbage. Det er værre her end i en almindelig webapp, fordi app-shellen er
precachet: den installerede PWA åbner samme tilstand igen næste gang. Der er heller ingen
fejlrapportering, så ingen ville opdage det.

_Sådan lukkes det:_ Én boundary omkring `<App />` med en dansk fejlside, en
genindlæs-knap og en "ryd cache og genstart"-udvej, plus en pr. rute så et
galleri-nedbrud ikke tager chatten med.

Filer: `src/main.tsx`, `src/sw.ts:48`

### Friktion

#### 7. Hele appen er ét bundle på 613 kB

Buildet advarer selv: `613,08 kB │ gzip: 172,24 kB` i én chunk, og service workeren
precacher 677 KiB. Der er ingen `React.lazy` nogen steder. Den offentlige forside — den,
et nyt medlem møder først, typisk på mobil — henter altså chat, galleri, kalender,
adminpanel og hele Supabase-klienten, før den kan vise et eneste ord. Og fordi alt ligger
i én chunk, invalideres hele precachen ved hver eneste deploy.

_Sådan lukkes det:_ Rutebaseret `React.lazy` + `Suspense` i `App.tsx`. Alle de tunge
sider ligger allerede bag `ProtectedRoute`, så opdelingen falder naturligt langs den
grænse, der er der i forvejen.

Filer: `src/App.tsx`, `vite.config.ts`

#### 8. Galleriet henter hvert eneste billede, hver gang

`fetchPhotos` henter alle rækker uden `limit` og uden paginering, med et embed af
`events` oveni. Realtime-abonnementet invaliderer hele listen ved _enhver_ ændring på
`photos` — så en enkelt upload får alle åbne klienter til at hente hele galleriet igen.
Chatten er til sammenligning ordentligt pagineret med keyset-cursors; galleriet er ikke.

_Sådan lukkes det:_ Samme `useInfiniteQuery`-mønster som `useMessages`, med keyset på
`(created_at, id)`, og lad realtime-handleren opdatere den enkelte række i cachen frem
for at invalidere alt.

Filer: `src/features/gallery/usePhotos.ts:11`

#### 9. De indeks, forespørgslerne faktisk beder om, findes ikke

Der findes ti indeks i skemaet, og ingen af dem dækker de tungeste opslag. Chatten
sorterer på `(created_at desc, id desc)` uden et matchende indeks, og
`get_chat_message_context` kører en korreleret `exists` pr. række mod samme usorterede
tabel. Kalenderen filtrerer på `start_at` uden indeks. Galleriet sorterer på
`photos.created_at` og filtrerer på `uploaded_by` og `event_id` — heller ikke noget. Ved
klubbens nuværende størrelse mærkes det ikke; ved nogle tusinde beskeder gør det.

_Sådan lukkes det:_ Én migration: `messages (created_at desc, id desc)`,
`events (start_at)`, `photos (created_at desc)`, `photos (uploaded_by)`,
`photos (event_id)`.

Filer: `supabase/migrations/20260823201000_chat_history_search.sql:82`,
`src/features/chat/useMessages.ts:113`

#### 10. iCal-generatoren findes to gange, og de er allerede drevet fra hinanden

`src/features/calendar/ical.ts` og `supabase/functions/calendar-feed/index.ts`
indeholder den samme `foldLine`, `escapeText` og `formatIcalDate` — linje for linje. Men
functionen udsender `REFRESH-INTERVAL` og `X-PUBLISHED-TTL`, som klienten ikke gør. Det
er en kopi, der er begyndt at drive. Kun klientens version har tests.

Beslægtet, samme sted: `events` har ingen constraint på, at `end_at` skal ligge efter
`start_at`, og `EventForm` validerer det heller ikke. En begivenhed, der slutter før den
begynder, kan gemmes i dag.

_Sådan lukkes det:_ Læg iCal-byggeren i en delt fil, som både Vite og Deno kan importere,
og lad testene dække begge. Tilføj `check (end_at is null or end_at >= start_at)` i en
migration.

Filer: `src/features/calendar/ical.ts`, `supabase/functions/calendar-feed/index.ts:16`,
`supabase/migrations/20260821170002_events.sql`

### Finish

#### 11. Query-klienten er tom, og der er ingen fælles fejlhåndtering

`export const queryClient = new QueryClient()` — ingen `retry`-politik, ingen
`staleTime`-standard, ingen `onError`. Hvert kald genopfinder sin egen retry- og
fejladfærd, og derfor ser fejlbeskederne forskellige ud fra side til side.
Standardværdien forsøger desuden tre gange på alt — også på et 403 fra RLS, hvor det
aldrig hjælper.

_Sådan lukkes det:_ Sæt fornuftige defaults ét sted: ingen retry på 4xx, en delt
`staleTime`, og en `QueryCache` med en `onError`, der logger.

Filer: `src/lib/queryClient.ts`

#### 12. Repoet har ingen vedligeholdsmekanik

`.github/` indeholder kun `workflows/`: ingen Dependabot eller Renovate, ingen
PR-skabelon, ingen issue-skabeloner, ingen CODEOWNERS. Afhængighederne er faktisk friske
i dag — `npm audit` melder nul sårbarheder — men intet holder dem der.

Mindre i samme kategori: alle Edge Functions svarer
`Access-Control-Allow-Origin: '*'`. Autentificeringen er bearer-token, ikke cookies, så
det er ikke en CSRF-åbning — men at begrænse til appens eget origin koster én konstant.

_Sådan lukkes det:_ `.github/dependabot.yml` for npm og github-actions, ugentligt. En
kort PR-skabelon med "hvad blev afprøvet på preview'et". Og en delt `corsHeaders` med
appens origin.

Filer: `.github/`, `supabase/functions/*/index.ts`

#### 13. Forsiden deler dårligt, og der er ingen dataudlevering

`index.html` har titel og description, men ingen `og:`- eller `twitter:`-tags. Deles
linket til klubben i en besked eller på et socialt medie — og det er præcis dét, den
offentlige forside er til for — vises der intet billede og ingen ordentlig overskrift.

Og GDPR-siden: kontosletning er implementeret grundigt, og datapolitikken findes. Retten
til dataportabilitet gør ikke. Et medlem kan i dag slette alt, men ikke få en kopi af
sine egne beskeder og billeder først.

_Sådan lukkes det:_ Fire meta-tags og et delebillede i `public/`. Og en
`export-account`-function, der samler profil, beskeder, billedhenvisninger og
tilmeldinger i én JSON — den kan genbruge samme genlogin-tjek som `delete-account`.

Filer: `index.html`, `src/pages/DataPolicyPage.tsx`

## Roadmap

Tre horisonter. Den første er det, der er i stykker eller billigt; den anden er det, der
gør de næste seks måneder lettere; den tredje er produkt frem for vedligehold.
Størrelserne er grove — en "time" er én fokuseret PR.

### Nu — det, der er i stykker

| Opgave                                     | Hvorfor                                                                          | Størrelse |
| ------------------------------------------ | -------------------------------------------------------------------------------- | --------- |
| Hel de fastlåste billedoptimeringer (#115) | Lukker #115 rigtigt frem for kosmetisk                                           | ~2 timer  |
| Afgør kalenderfeedets skæbne (#118)        | Enten offentlig anon-view + `--no-verify-jwt`, eller feed-token pr. medlem       | ~4 timer  |
| `deno check` på alle functions (#120)      | Én linje i `ci.yml`; fjerner et helt sæt fejl, der i dag først findes ved deploy | ~15 min   |
| De fem manglende indeks (#125)             | Én migration; billig nu, irriterende senere                                      | ~30 min   |
| Error boundary + lazy loading (#122, #123) | Fjerner den hvide side og halverer nogenlunde første load                        | ~3 timer  |

### Næste — det, der gør resten lettere

| Opgave                                            | Hvorfor                                                                 | Størrelse |
| ------------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| Kør migrationerne i CI mod rigtig Postgres (#119) | Erstatter regex-testene med noget, der kan fejle af de rigtige grunde   | ~1–2 dage |
| Adminmoderation af billeder (#121)                | Bringer galleriet på niveau med chat og kalender; lukker en GDPR-vinkel | ~4 timer  |
| Paginér galleriet (#124)                          | Genbrug keyset-mønsteret fra `useMessages`                              | ~1 dag    |
| Pin Edge Function-importerne (#120)               | Produktionen bør ikke kunne ændre sig uden en commit                    | ~1 time   |
| Query-defaults og fejlrapportering (#127)         | Ens fejlopførsel på tværs af sider                                      | ~3 timer  |
| Dependabot, PR-skabelon, delebillede (#128, #129) | Vedligeholdsmekanik og en forside, der ser rigtig ud, når linket deles  | ~2 timer  |

### Senere — produkt, ikke vedligehold

| Opgave                           | Hvorfor                                                              | Størrelse |
| -------------------------------- | -------------------------------------------------------------------- | --------- |
| Dataudlevering (#129)            | Den manglende halvdel af GDPR-arbejdet                               | ~1 dag    |
| Notifikationer ud over chatten   | Push-infrastrukturen står klar og bruges kun til chat                | ~1 dag    |
| Album og kommentarer i galleriet | `event_id` findes allerede på hvert billede                          | ~2 dage   |
| Offline-kø til chatten           | En besked skrevet uden dækning i skoven burde sendes senere          | ~2 dage   |
| Vælg ét sprog i koden            | Kommentarer og commit-beskeder skifter i dag mellem dansk og engelsk | løbende   |

## Det korte svar

Fundamentet er solidt. Autorisationsmodellen, kontosletningen og
tilgængelighedsarbejdet er lavet af nogen, der har tænkt over kapløb og kanttilfælde, og
kommentarerne gør det muligt at fortsætte uden at genopdage de samme fejl.

Det, der mangler, falder i to bunker. Den ene er små ting, der er blevet stående: et
kalenderfeed der aldrig har virket, billeder der ikke heler, indeks der ikke blev
skrevet. Den bunke kan ryddes på en uge.

Den anden er én ting: testene stopper ved databasens dør. Den mest gennemarbejdede del
af systemet — RLS-policies, RPC'er, advisory locks — er også den eneste, der aldrig
bliver kørt i CI. Lukkes det hul, holder resten sig selv.
