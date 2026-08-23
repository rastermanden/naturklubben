# Supabase

Se `CLAUDE.md` i repo-roden for de overordnede spilleregler: migrations skrives og
committes som SQL-filer her, valideres via Supabase Preview Branching på PR'en, og
deployes automatisk til produktion ved merge til `main` -- aldrig manuelt.

## Skema

| Tabel                                      | Formål                                                                                                                           | RLS                                                                                                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                 | 1:1 med `auth.users`. Oprettes automatisk ved signup via `handle_new_user`-trigger. Har `is_admin`-flag.                         | Alle autentificerede kan læse; ejeren kan kun opdatere profilfelterne. `is_admin` kan kun ændres via `set_admin_role()`.                                                                                          |
| `activities`                               | Offentligt indhold om klubbens aktiviteter (#10).                                                                                | Alle (også anonyme) kan læse; kun admins kan skrive.                                                                                                                                                              |
| `events`                                   | Kalenderbegivenheder (#11).                                                                                                      | Kun autentificerede kan læse/oprette; kun ejer kan opdatere/slette egne.                                                                                                                                          |
| `photos`                                   | Metadata og vedvarende optimeringsstatus for uploadede billeder -- selve filerne ligger i Storage (#12/#89).                     | Autentificerede kan læse. Oprettelse/genforsøg går gennem `upsert_photo_upload`; direkte INSERT/UPDATE/DELETE er revoked, så klienten ikke kan skrive serverejede status/outputfelter eller omgå sikker sletning. |
| `messages`                                 | Gruppechat, ét fælles rum (#14). Del af `supabase_realtime`-publikationen.                                                       | Kun autentificerede kan læse/skrive; kun afsender kan slette egne.                                                                                                                                                |
| `push_subscriptions`                       | Web Push-abonnementer, én række per browser/installation. Bruges af `chat-push` til at sende notifikationer om nye chatbeskeder. | Kun ejeren kan læse/skrive sine egne rækker. Edge-functionen læser på tværs med Secret key.                                                                                                                       |
| `allowed_emails`                           | Allowlist over e-mails, der må oprette en bruger. Håndhæves af `check_allowed_email`-triggeren på `auth.users`.                  | Kun admins kan læse/skrive (via `public.is_admin()`); almindelige medlemmer har ingen adgang.                                                                                                                     |
| `admin_role_changes`                       | Uforanderligt revisionsspor med aktør, medlem, gammel/ny rolle og tidspunkt.                                                     | Kun admins kan læse; ingen klientrolle kan indsætte, ændre eller slette.                                                                                                                                          |
| `probation_applications`                   | Åbne ansøgninger om prøvemedlemskab. Admin kan godkende dem direkte ind i `allowed_emails`.                                      | Alle kan indsende; kun admins kan læse og behandle ansøgningerne.                                                                                                                                                 |
| `probation_application_push_subscriptions` | Ansøgerens private Web Push-endpoint, knyttet til én ansøgning indtil afgørelsen er sendt.                                       | Ingen policies og ingen grants -- kun `probation-notifications` med Secret key kan læse rækken.                                                                                                                   |
| `push_vapid_keys`                          | Klubbens VAPID-nøglepar til Web Push. Én række, oprettet af `chat-push` selv første gang.                                        | Ingen policies og ingen grants -- kun Edge Functionens Secret key kan læse rækken.                                                                                                                                |

## Storage buckets

Oprettet manuelt i #2:

- `photos-original` (privat) -- kun autentificerede medlemmer kan læse/skrive egne uploads.
  INSERT/UPDATE er både ejer- og mappeafgrænset til `<auth.uid()>/...`; UPDATE findes kun,
  fordi et sikkert genforsøg med samme tilfældige sti kræver Storage `upsert`.
- `photos-optimized` (public) -- alle kan læse. Kun `optimize-image`-edge-functionen
  (Secret key, omgår RLS) kan skrive -- der er bevidst ingen insert-policy for andre.

## Edge Functions

- `optimize-image` (#13): kaldes fra klienten (`useUploadPhotos`) lige efter en upload.
  Klienten sender kun photo-id; functionen validerer bearer-token og afviser alle andre
  end uploaderen. Den claimer `pending`/`failed` arbejde (eller `processing`, der har
  været fastlåst i ti minutter) med én atomisk `UPDATE ... RETURNING`, henter originalen
  fra `photos-original`, laver en web-str­ørrelse (maks. 1600px bredde)
  og en thumbnail (maks. 400px bredde) som JPEG via `imagescript`, uploader begge til
  attempt-specifikke, deterministiske stier i `photos-optimized`, og opdaterer
  `photos`-rækken til `ready`.
  Hvert claim øger et forsøgsnummer; både `ready` og `failed` completion kræver samme
  nummer, så en gammel worker aldrig kan overskrive et nyere resultat. Delvise output kan
  genforsøges idempotent med upsert, og en worker rydder kun sine egne attempt-output ved
  fejl eller tabt completion-race. Mangler originalen, bliver rækken terminalt `failed`
  med en tydelig fejl i stedet for at stå som aktiv.
  Sletning går gennem samme function: et atomisk `deleting`-claim fencer aktive/stale
  workers, functionen fjerner originalen og alle attempt-output med Secret key, og først
  derefter slettes rækken. Klienten har derfor hverken direkte DELETE-grant på `photos`
  eller sletterettighed i den offentlige bucket.
  (JPEG i stedet for WebP: imagescript distribueres til Deno via deno.land/x, hvis
  registry for dette modul stoppede med at indeksere nye tags efter `1.3.0` -- den
  version har ingen `encodeWEBP`, kun `encodeJPEG`.)
  Fejler den, forbliver originalen synlig i galleriet via en signeret URL, og uploaderen
  kan genforsøge fra galleriet. `photos` er med i Realtime; klienten poller desuden kun,
  mens et ikke-fastlåst arbejde er aktivt, og stopper igen ved terminal status/unmount.
- `chat-push` (#14): sender Web Push-notifikationer, når nogen skriver i chatten.
  Kaldes af afsenderens egen klient lige efter beskeden er indsat (samme mønster som
  `optimize-image` efter en upload). Klienten sender kun besked-id'et med -- functionen
  slår selv indholdet op og afviser (403) en besked, kalderen ikke selv har skrevet, samt
  beskeder ældre end 5 minutter, så et gentaget kald ikke kan bruges til at spamme.
  Den sender til alle abonnementer undtagen afsenderens egne og sletter automatisk
  rækker, hvor push-tjenesten svarer 404/410 (appen afinstalleret, abonnementet roteret).
  Et `GET` mod samme function returnerer `{ publicKey }` -- den VAPID-nøgle, klienten skal
  abonnere med. Den hentes derfra i stedet for at bygges ind i frontenden, så nøglerne kun
  findes ét sted og kan roteres uden et nyt frontend-build. Findes nøgleparret ikke endnu,
  genererer functionen det selv og gemmer det i `push_vapid_keys` (se `vapid.ts`) -- der er
  ingen manuel opsætning.
  Selve protokollen (RFC 8291-kryptering + RFC 8292/VAPID-signering) er implementeret
  direkte oven på WebCrypto i `webpush.ts` -- `web-push` fra npm er bygget til Node
  (`node:crypto`/`node:https`) og er ikke et sikkert kort i Edge Runtime.
- `probation-notifications` (#82): leverer Web Push til admins ved nye
  prøvemedlemskabsansøgninger og til ansøgeren ved godkendelse/afvisning. Funktionen
  modtager kun et ansøgnings-id og en tilfældig, servergenereret notification-token
  (eller en admins JWT); navn, afgørelse og push-endpoints slås op server-side med
  Secret key. Postgres køer kaldet efter commit med `pg_net`, og `pg_cron` genforsøger
  midlertidige fejl. Funktionen deployes derfor med `--no-verify-jwt`, men hvert POST
  laver sin egen token/admin-kontrol, før en leveringsstatus kan tages til behandling.
- Fælles VAPID- og Web Push-kode ligger i `supabase/functions/_shared/`, så chat og
  prøvemedlemskaber bruger præcis samme afsendernøgle og krypteringskode.
- Deployes **ikke** manuelt -- `.github/workflows/deploy-functions.yml` kører
  `supabase functions deploy` ikke-interaktivt ved push til `main`, når noget under
  `supabase/functions/` ændres. Kræver `SUPABASE_ACCESS_TOKEN` og `SUPABASE_PROJECT_REF`
  som GitHub-secrets (se #2). Secret key skal **ikke** sættes manuelt som
  function-secret -- variabelnavne der starter med `SUPABASE_` er reserverede og
  auto-injiceres af platformen i alle Edge Functions (`supabase secrets set` afviser
  dem eksplicit).

### Preview-validering af galleri-status

Databasekonkurrence og grants kræver den rigtige Postgres-motor og dækkes derfor på
PR'ens Supabase Preview Branch, ikke med en lokal mockdatabase:

1. Opret to preview-brugere, upload ét billede som bruger A, og notér photo-id'et.
2. Kald `PATCH /rest/v1/photos?id=eq.<id>` med bruger A's token og fx
   `{"optimization_status":"ready","optimization_attempts":99}`. Kaldet skal afvises,
   fordi `authenticated` ikke har direkte UPDATE-grant.
3. Kald `optimize-image` for samme id med bruger B's token. Svaret skal være 403, og
   status/forsøgsnummer må være uændret.
4. Sæt rækken til `failed` i Preview Branch SQL editoren, start to samtidige
   `optimize-image`-kald som bruger A, og kontrollér, at attempts kun stiger én gang.
   Det andet kald skal svare `processing`/202 eller observere det færdige resultat.
5. Simulér attempt-fencing i SQL editoren: sæt rækken til `processing` med attempt 10,
   og kald `complete_photo_optimization` med attempt 9. Funktionen skal returnere
   `false`, og rækken skal være uændret. Gentag både med success og failure; kun attempt
   10 må ændre rækken.
6. Slet originalobjektet, sæt rækken `failed`, og genforsøg som bruger A. Rækken skal
   ende `failed` med beskeden om, at originalfilen mangler; den må ikke blive stående
   `processing`.

## Migrations

Filnavngivning: `<timestamp>_<beskrivelse>.sql` i `supabase/migrations/`. Se `CLAUDE.md`
for hele arbejdsgangen (skriv → commit → PR → Preview Branch-validering → merge →
automatisk produktionsdeploy).

**Timestampet skal være unikt på tværs af alle migrations.** Supabase sporer anvendte
migrations på versionsnummeret alene (primærnøgle i
`supabase_migrations.schema_migrations`), så deler to filer nummer, bliver den, der
merges sidst, sprunget over ved deploy -- uden fejl nogen steder. Det skete for
`probation_applications`, som derfor aldrig blev oprettet i produktion. To PR'er, der
laves parallelt, kan nemt ramme samme minut, så vælg et nyt nummer, hvis en anden fil
allerede har det. CI (`ci.yml`) fejler på dubletter.

## Admin-adgang

`profiles.is_admin` styrer, hvem der kan redigere `activities` og bruge siden `/admin`.

- En klient kan ikke opdatere `profiles.is_admin` eller `allowed_emails.is_admin`
  direkte. Autentificerede brugere har kun kolonnebegrænset UPDATE på de almindelige
  profilfelter og kolonnebegrænset INSERT på allowlisten.
- Eksisterende admins ændrer roller med `set_admin_role(target_user_id, make_admin)`.
  Den `SECURITY DEFINER`-funktion serialiserer alle rolleændringer, kontrollerer aktørens
  rolle efter låsen og afviser atomisk at fjerne den sidste admin. Derfor kan samtidige
  nedgraderinger ikke efterlade klubben uden en administrator.
- Samme transaktion opdaterer en eventuel matchende `allowed_emails.is_admin` og skriver
  en række i `admin_role_changes`. Audit-rækkerne kan læses af admins i panelet, men
  ingen klientrolle kan skrive eller slette dem.
- Den første admin er klubbens ejer, som sættes i migrationerne
  `20260822130000_admin_allowed_emails.sql` (forfremmer en eksisterende bruger) og
  `20260822140000_admin_from_allowlist.sql` (dækker tilfældet, hvor brugeren først
  oprettes bagefter).
- Eksisterende medlemmer administreres i appens admin-panel. Bootstrap af en admin, der
  endnu ikke har oprettet sig, kan fortsat ske i en migration ved at sætte
  `allowed_emails.is_admin`; `handle_new_user` kopierer flaget til profilen ved signup.

## Allowlist til signup

`allowed_emails` afgør, hvem der kan oprette en bruger. Triggeren `check_allowed_email`
på `auth.users` afviser en signup med `Email not allowed`, hvis adressen ikke står på
listen (klienten oversætter fejlen til en dansk besked i `src/features/auth/authErrors.ts`).

Admins vedligeholder listen på `/admin` i appen. At fjerne en adresse spærrer kun for
_nye_ oprettelser -- en allerede oprettet bruger i `auth.users` bliver ikke slettet af
det og kan fortsat logge ind.

## Ansøgninger om prøvemedlemskab

Offentlige besøgende kan sende en ansøgning fra `/proevemedlemskab`. Indsendelsen
beder først om Web Push-tilladelse, så svaret kan nå ansøgeren uden en ekstern
mailudbyder. Ansøgning, push-abonnement og notification-token gemmes atomisk via
`submit_probation_application()`; kun admins kan læse ansøgningen i `/admin`.

Når en admin godkender en ansøgning, kalder klienten SQL-funktionen
`approve_probation_application()`, som atomisk:

1. tilføjer ansøgerens e-mail til `allowed_emails`, og
2. markerer ansøgningen som godkendt.

Afvisning bruger `reject_probation_application()`, som markerer ansøgningen som
afvist, så personen kan sende en ny ansøgning senere.

Begge afgørelser sætter samtidig `decision_notification_status = 'pending'`.
Tilsvarende starter en ny ansøgning med `admin_notification_status = 'pending'`.
Det er en holdbar outbox på selve ansøgningen:

1. RPC'en køer et `pg_net`-kald til `probation-notifications` i samme
   databasetransaktion. HTTP-kaldet starter først efter commit.
2. Edge Functionen tager status atomisk som `sending`, sender push og afslutter som
   `sent` eller `failed`. Et stigende forsøgsnummer forhindrer et gammelt,
   timeoutet kald i at overskrive resultatet fra et nyere forsøg.
3. Et `pg_cron`-job, oprettet af migrationen, genkøer uløste leveringer hvert femte
   minut (højst ti leveringsforsøg). Et forsøg, der døde i `sending`, køes igen
   efter 15 minutter og kan derefter tages af claim-funktionen.
4. Klienten kalder også functionen efter RPC'en for at vise resultatet med det samme.
   Claim-funktionen gør det samtidige databasekald og klientkald idempotent.
5. Fejl ændrer aldrig den egentlige ansøgningsstatus. Admin-panelet beholder afgjorte
   ansøgninger med uløste leveringer og viser en genforsøgsknap; ansøgerens
   kvitteringsside gør det samme for den første admin-notifikation.

Admins slår push til direkte på `/admin`. Der kræves ingen ny nøgle eller udbyder:
`probation-notifications` genbruger det selv-genererende VAPID-nøglepar fra
`push_vapid_keys`.

Ansøgerens push-endpoint accepteres kun, hvis det er HTTPS og tilhører de kendte
browser-push-tjenester fra Google, Mozilla, Apple eller Microsoft. Den samme
allowlist håndhæves igen umiddelbart før Edge Functionen kalder endpointet, så et
manipuleret abonnement ikke kan bruges til server-side requests mod vilkårlige
adresser.

### Hvorfor Web Push og ikke e-mail

Supabase Auths indbyggede mail kan kun sende auth-handlinger som bekræftelse,
password reset, magic link og invitation. Den kan ikke sende en vilkårlig
godkendt/afvist-besked til en person, som endnu ikke er bruger. SMTP eller en
mail-API ville derfor kræve en ny ekstern konto og et manuelt oprettet secret, i
strid med projektets kode-only-princip. Web Push bruger den allerede deployede,
selvkonfigurerende infrastruktur og eksponerer hverken Secret key, privat
VAPID-nøgle eller andre server-secrets i frontenden.

Konsekvensen er, at browseren skal understøtte Web Push og have tilladelse, før
ansøgningen kan sendes. På iPhone/iPad kræver Safari, at appen først er lagt på
hjemmeskærmen. PR-previews har ingen service worker og kan derfor validere
migration/RLS/UI, men ikke selve push-leveringen; den prøves på den udgivne PWA.

## Auth-URL'er: hvor links i mails lander

Supabase afgør ud fra to projektindstillinger, hvor et link i en bekræftelses- eller
nulstillingsmail må sende folk hen:

| Indstilling                      | Værdi                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Site URL                         | `https://rastermanden.github.io/naturklubben`                                |
| Redirect URLs (`uri_allow_list`) | `https://rastermanden.github.io/naturklubben/**`, `http://localhost:5173/**` |

De sættes **ikke** i hånden i dashboardet: `.github/workflows/sync-auth-config.yml`
skubber dem til Management API'et ved hver push til `main` (og kan køres manuelt med
_Run workflow_). Kaldet er idempotent og retter derfor også op på sig selv, hvis nogen
ændrer felterne i dashboardet. Adressen kan overstyres med repo-variablen `APP_URL`.
Workflowet bruger de samme `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF`-secrets som
function-deployet.

Hvorfor det er nødvendigt: klienten beder selv om at komme tilbage til
`.../naturklubben/velkommen` (`emailRedirectTo` i `src/pages/SignupPage.tsx`), men
Supabase ignorerer et `emailRedirectTo`, der ikke matcher listen, og bruger Site URL i
stedet. Stod Site URL til roden af domænet, endte alle nye medlemmer på GitHubs
"There isn't a GitHub Pages site here"-404 i stedet for en kvittering.

Wildcarden `/naturklubben/**` dækker også PR-previewenes kopier af appen
(`/naturklubben/pr-preview/pr-<nr>/velkommen`), så signup-flowet kan afprøves på et
preview-link -- mod previewets egen database.

De to sider, links kan lande på:

- `/velkommen` (`src/pages/WelcomePage.tsx`) -- bekræftet e-mail. Sessionen kommer med i
  URL'ens fragment, og siden viser enten en velkomst eller en forklaring på, at linket er
  udløbet/brugt.
- `/ny-adgangskode` (`src/pages/ResetPasswordPage.tsx`) -- vælg en ny adgangskode efter
  "Glemt adgangskode".

Begge stier findes ikke som filer på GitHub Pages. Derfor udgiver buildet en `404.html`
(se `spaFallback` i `vite.config.ts`), som sender browseren videre til app'ens
`index.html` med stien -- og med query og fragment i behold, for det er dér, sessionen
ligger. `src/lib/spaRedirect.ts` pakker stien ud igen, før React Router læser adressen.

## Notifikationer på nye chatbeskeder

Flowet, ende til ende:

1. Medlemmet slår notifikationer til på `/chat`. Browseren opretter et
   `PushSubscription` med den VAPID-nøgle, `chat-push` udleverer, og klienten gemmer
   endpoint + nøgler i `push_subscriptions`.
2. Nogen sender en besked. Klienten indsætter rækken og kalder bagefter `chat-push` med
   besked-id'et.
3. `chat-push` krypterer et smugkig af beskeden til hver abonnent og POSTer det til
   deres push-tjeneste.
4. Service workeren (`src/sw.ts`) modtager `push`, viser notifikationen, og
   `notificationclick` åbner eller fokuserer chatten.

Fejler trin 2-4, går man kun glip af _notifikationen_ -- beskeden selv er gemt og kommer
stadig live ind via Realtime.

### VAPID-nøgler

`chat-push` skal have et VAPID-nøglepar for at kunne sende (RFC 8292). Der er ingen
opsætning at lave -- **functionen genererer selv nøgleparret første gang, den får brug for
det**, og gemmer det i `push_vapid_keys`. Det sker allerede ved det `GET`-kald, klienten
laver, når nogen slår notifikationer til, så det første medlem, der trykker på knappen,
konfigurerer i praksis serveren.

Det er bevidst: at oprette et repo-secret er et manuelt dashboard-trin, og projektets
kerneprincip er, at alt ud over engangsopsætningen i #2/#3 skal kunne ske ved at skrive
kode og pushe (se `CLAUDE.md`). Tidligere svarede functionen 503, og appen sagde "Push-
notifikationer er ikke konfigureret på serveren endnu" -- uden nogen vej frem, der ikke gik
gennem et dashboard.

Den private nøgle ligger i en tabel med RLS slået til, ingen policies og ingen grants til
`anon`/`authenticated`: kun Edge Functionens Secret key kan læse den.

Vil man alligevel styre nøglerne udefra, vinder function-secrets over tabellen. Sættes de
som repo-secrets, skubber `deploy-functions.yml` dem videre -- aldrig fra nogens terminal:

| Repo-secret / variable | Hvad                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`     | Offentlig P-256-nøgle, base64url (65 bytes). Udleveres til klienten af functionens `GET`. |
| `VAPID_PRIVATE_KEY`    | Privat nøgle, base64url (32 bytes). Forlader aldrig Edge Function-miljøet.                |
| `VAPID_SUBJECT` (var)  | Kontakt-URL, fx `mailto:...`. RFC 8292 kræver et kontaktpunkt. Har en default.            |

En 503 fra `chat-push` betyder nu, at databasen ikke kunne svare (fx før migrationen er
deployet) -- ikke at nogen har glemt at konfigurere noget. Chatten virker uændret imens,
der kommer bare ingen notifikationer.

Roteres nøgleparret -- ved at slette rækken i `push_vapid_keys` eller sætte
function-secrets -- skal alle medlemmer slå notifikationer til igen: browseren nægter at
genabonnere med en ny nøgle, så klienten smider det gamle abonnement væk først.

### Hvad der ikke virker hvor

- **iOS/iPadOS**: Safari giver først en webapp adgang til push, når den ligger på
  hjemmeskærmen. I en almindelig Safari-fane findes `PushManager` slet ikke, og
  UI'et beder i stedet om at få appen lagt på hjemmeskærmen.
- **PR-previews**: service workeren bygges kun i produktionsbuildet (se `vite.config.ts`),
  så notifikationer kan ikke afprøves på et preview-link -- kun på den udgivne app.
