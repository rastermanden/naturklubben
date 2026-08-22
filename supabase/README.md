# Supabase

Se `CLAUDE.md` i repo-roden for de overordnede spilleregler: migrations skrives og
committes som SQL-filer her, valideres via Supabase Preview Branching på PR'en, og
deployes automatisk til produktion ved merge til `main` -- aldrig manuelt.

## Skema

| Tabel                    | Formål                                                                                                                           | RLS                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`               | 1:1 med `auth.users`. Oprettes automatisk ved signup via `handle_new_user`-trigger. Har `is_admin`-flag.                         | Alle autentificerede kan læse; kun ejeren kan opdatere egen række.                                                                          |
| `activities`             | Offentligt indhold om klubbens aktiviteter (#10).                                                                                | Alle (også anonyme) kan læse; kun admins kan skrive.                                                                                        |
| `events`                 | Kalenderbegivenheder (#11).                                                                                                      | Kun autentificerede kan læse/oprette; kun ejer kan opdatere/slette egne.                                                                    |
| `photos`                 | Metadata for uploadede billeder -- selve filerne ligger i Storage (#12).                                                         | Kun autentificerede kan læse/oprette; kun ejer kan opdatere/slette egne. `optimized_path`/`thumbnail_path` sættes af edge-functionen i #13. |
| `messages`               | Gruppechat, ét fælles rum (#14). Del af `supabase_realtime`-publikationen.                                                       | Kun autentificerede kan læse/skrive; kun afsender kan slette egne.                                                                          |
| `push_subscriptions`     | Web Push-abonnementer, én række per browser/installation. Bruges af `chat-push` til at sende notifikationer om nye chatbeskeder. | Kun ejeren kan læse/skrive sine egne rækker. Edge-functionen læser på tværs med Secret key.                                                 |
| `allowed_emails`         | Allowlist over e-mails, der må oprette en bruger. Håndhæves af `check_allowed_email`-triggeren på `auth.users`.                  | Kun admins kan læse/skrive (via `public.is_admin()`); almindelige medlemmer har ingen adgang.                                               |
| `probation_applications` | Åbne ansøgninger om prøvemedlemskab. Admin kan godkende dem direkte ind i `allowed_emails`.                                      | Alle kan indsende; kun admins kan læse og behandle ansøgningerne.                                                                           |

## Storage buckets

Oprettet manuelt i #2:

- `photos-original` (privat) -- kun autentificerede medlemmer kan læse/skrive egne uploads.
- `photos-optimized` (public) -- alle kan læse. Kun `optimize-image`-edge-functionen
  (Secret key, omgår RLS) kan skrive -- der er bevidst ingen insert-policy for andre.

## Edge Functions

- `optimize-image` (#13): kaldes fra klienten (`useUploadPhotos`) lige efter en upload.
  Henter originalen fra `photos-original`, laver en web-str­ørrelse (maks. 1600px bredde)
  og en thumbnail (maks. 400px bredde) som JPEG via `imagescript`, uploader begge til
  `photos-optimized`, og opdaterer `photos`-rækkens `optimized_path`/`thumbnail_path`.
  (JPEG i stedet for WebP: imagescript distribueres til Deno via deno.land/x, hvis
  registry for dette modul stoppede med at indeksere nye tags efter `1.3.0` -- den
  version har ingen `encodeWEBP`, kun `encodeJPEG`.)
  Fejler den (fx før den er deployet endnu, eller på et ugyldigt billede), forbliver
  originalen synlig i galleriet via en signeret URL -- uploadet blokeres ikke.
- `chat-push` (#14): sender Web Push-notifikationer, når nogen skriver i chatten.
  Kaldes af afsenderens egen klient lige efter beskeden er indsat (samme mønster som
  `optimize-image` efter en upload). Klienten sender kun besked-id'et med -- functionen
  slår selv indholdet op og afviser (403) en besked, kalderen ikke selv har skrevet, samt
  beskeder ældre end 5 minutter, så et gentaget kald ikke kan bruges til at spamme.
  Den sender til alle abonnementer undtagen afsenderens egne og sletter automatisk
  rækker, hvor push-tjenesten svarer 404/410 (appen afinstalleret, abonnementet roteret).
  Et `GET` mod samme function returnerer `{ publicKey }` -- den VAPID-nøgle, klienten skal
  abonnere med. Den hentes derfra i stedet for at bygges ind i frontenden, så nøglerne kun
  findes ét sted og kan roteres uden et nyt frontend-build.
  Selve protokollen (RFC 8291-kryptering + RFC 8292/VAPID-signering) er implementeret
  direkte oven på WebCrypto i `webpush.ts` -- `web-push` fra npm er bygget til Node
  (`node:crypto`/`node:https`) og er ikke et sikkert kort i Edge Runtime.
- Deployes **ikke** manuelt -- `.github/workflows/deploy-functions.yml` kører
  `supabase functions deploy` ikke-interaktivt ved push til `main`, når noget under
  `supabase/functions/` ændres. Kræver `SUPABASE_ACCESS_TOKEN` og `SUPABASE_PROJECT_REF`
  som GitHub-secrets (se #2). Secret key skal **ikke** sættes manuelt som
  function-secret -- variabelnavne der starter med `SUPABASE_` er reserverede og
  auto-injiceres af platformen i alle Edge Functions (`supabase secrets set` afviser
  dem eksplicit).

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

`profiles.is_admin` styrer, hvem der kan redigere `activities` og administrere
allowlisten `allowed_emails` (siden `/admin` i appen).

- Flaget kan **ikke** sættes af brugeren selv: triggeren `profiles_protect_admin_flag`
  afviser en ændring af `is_admin`, medmindre den, der ændrer det, allerede er admin --
  eller kalder uden en bruger-session (service-role, SQL-editoren, Table Editor og
  migrations).
- Den første admin er klubbens ejer, som sættes i migrationerne
  `20260822130000_admin_allowed_emails.sql` (forfremmer en eksisterende bruger) og
  `20260822140000_admin_from_allowlist.sql` (dækker tilfældet, hvor brugeren først
  oprettes bagefter).
- Skal en anden være admin, er der to veje -- begge kræver SQL-editoren eller Table
  Editor, for der er bevidst ingen UI til at gøre andre til admin:
  1. Findes brugeren allerede: sæt `is_admin` på profil-rækken.
  2. Har personen ikke oprettet sig endnu: sæt `is_admin` på deres række i
     `allowed_emails`. `handle_new_user`-triggeren læser flaget og sætter det på
     profilen, når de opretter sig. Panelet viser et Admin-mærkat på de rækker.

## Allowlist til signup

`allowed_emails` afgør, hvem der kan oprette en bruger. Triggeren `check_allowed_email`
på `auth.users` afviser en signup med `Email not allowed`, hvis adressen ikke står på
listen (klienten oversætter fejlen til en dansk besked i `src/features/auth/authErrors.ts`).

Admins vedligeholder listen på `/admin` i appen. At fjerne en adresse spærrer kun for
_nye_ oprettelser -- en allerede oprettet bruger i `auth.users` bliver ikke slettet af
det og kan fortsat logge ind.

## Ansøgninger om prøvemedlemskab

Offentlige besøgende kan sende en ansøgning fra `/proevemedlemskab`. Den gemmes i
`probation_applications`, som kun admins kan læse i `/admin`.

Når en admin godkender en ansøgning, kalder klienten SQL-funktionen
`approve_probation_application()`, som atomisk:

1. tilføjer ansøgerens e-mail til `allowed_emails`, og
2. markerer ansøgningen som godkendt.

Afvisning bruger `reject_probation_application()`, som markerer ansøgningen som
afvist, så personen kan sende en ny ansøgning senere.

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

`chat-push` skal have et VAPID-nøglepar for at kunne sende. Det sættes som function-secrets
af `deploy-functions.yml` ud fra repo-secrets -- aldrig fra nogens terminal:

| Repo-secret / variable | Hvad                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`     | Offentlig P-256-nøgle, base64url (65 bytes). Udleveres til klienten af functionens `GET`. |
| `VAPID_PRIVATE_KEY`    | Privat nøgle, base64url (32 bytes). Forlader aldrig Edge Function-miljøet.                |
| `VAPID_SUBJECT` (var)  | Kontakt-URL, fx `mailto:...`. RFC 8292 kræver et kontaktpunkt. Har en default.            |

Mangler nøglerne, springer workflowet secret-steppet over med en advarsel, og `chat-push`
svarer 503 -- chatten virker uændret, der kommer bare ingen notifikationer.

Roteres nøgleparret, skal alle medlemmer slå notifikationer til igen: browseren nægter at
genabonnere med en ny nøgle, så klienten smider det gamle abonnement væk først.

### Hvad der ikke virker hvor

- **iOS/iPadOS**: Safari giver først en webapp adgang til push, når den ligger på
  hjemmeskærmen. I en almindelig Safari-fane findes `PushManager` slet ikke, og
  UI'et beder i stedet om at få appen lagt på hjemmeskærmen.
- **PR-previews**: service workeren bygges kun i produktionsbuildet (se `vite.config.ts`),
  så notifikationer kan ikke afprøves på et preview-link -- kun på den udgivne app.
