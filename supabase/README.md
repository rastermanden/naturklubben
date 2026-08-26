# Supabase

Se `CLAUDE.md` i repo-roden for de overordnede spilleregler: migrations skrives og
committes som SQL-filer her, valideres via Supabase Preview Branching på PR'en, og
deployes automatisk til produktion ved merge til `main` -- aldrig manuelt.

## Skema

| Tabel                                      | Formål                                                                                                                                                  | RLS                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                 | 1:1 med `auth.users`. Oprettes automatisk ved signup via `handle_new_user`-trigger. Har `is_admin`-flag og en kortvarig serverstyret slettereservation. | Alle autentificerede kan læse; ejeren kan kun opdatere profilfelter uden en aktiv slettereservation. `is_admin` ændres via `set_admin_role()`.                                                                      |
| `activities`                               | Offentligt indhold om klubbens aktiviteter (#10).                                                                                                       | Alle (også anonyme) kan læse; kun admins kan skrive.                                                                                                                                                                |
| `events`                                   | Kalenderbegivenheder (#11). Opretterreferencen nulstilles ved kontosletning, så fælles historik bevares anonymt.                                        | Autentificerede kan læse/oprette; kun ejer kan opdatere/slette egne, mens admins kan slette alle. Anon kan kun læse titel, tid og sted via kolonnegrants; `calendar_feed_events` samler netop de offentlige felter. |
| `photos`                                   | Metadata og vedvarende optimeringsstatus for uploadede billeder -- selve filerne ligger i Storage (#12/#89).                                            | Autentificerede kan læse. Oprettelse/genforsøg går gennem `upsert_photo_upload`; direkte INSERT/UPDATE/DELETE er revoked, så klienten ikke kan skrive serverejede status/outputfelter eller omgå sikker sletning.   |
| `messages`                                 | Gruppechat, ét fælles rum (#14), med valgfri svarreference (#84). Afsenderreferencen nulstilles ved kontosletning. Del af `supabase_realtime`.          | Kun autentificerede kan læse/skrive; afsender kan slette egne, og admins kan slette alle.                                                                                                                           |
| `push_subscriptions`                       | Web Push-abonnementer, én række per browser/installation. Bruges af `chat-push` til at sende notifikationer om nye chatbeskeder.                        | Kun ejeren kan læse/skrive sine egne rækker. Edge-functionen læser på tværs med Secret key.                                                                                                                         |
| `allowed_emails`                           | Allowlist over e-mails, der må oprette en bruger. Håndhæves af `check_allowed_email`-triggeren på `auth.users`.                                         | Kun admins kan læse/skrive (via `public.is_admin()`); almindelige medlemmer har ingen adgang.                                                                                                                       |
| `admin_role_changes`                       | Uforanderligt revisionsspor med aktør, medlem, gammel/ny rolle og tidspunkt.                                                                            | Kun admins kan læse; ingen klientrolle kan indsætte, ændre eller slette.                                                                                                                                            |
| `probation_applications`                   | Åbne ansøgninger om prøvemedlemskab. Admin kan godkende dem direkte ind i `allowed_emails`.                                                             | Ingen offentlig insert-policy; kun den service-role-beskyttede submit-RPC kan oprette, og kun admins kan læse/behandle.                                                                                             |
| `probation_application_push_subscriptions` | Ansøgerens private Web Push-endpoint, knyttet til én ansøgning indtil afgørelsen er sendt.                                                              | Ingen policies og ingen grants -- kun `probation-notifications` med Secret key kan læse rækken.                                                                                                                     |
| `push_vapid_keys`                          | Klubbens VAPID-nøglepar til Web Push. Én række, oprettet af `chat-push` selv første gang.                                                               | Ingen policies og ingen grants -- kun Edge Functionens Secret key kan læse rækken.                                                                                                                                  |
| `private.probation_submission_attempts`    | Kortlivede HMAC-hashes til server-side rate limiting; indeholder aldrig rå IP, subnet eller e-mail.                                                     | `private` eksponeres ikke gennem Data API'et; ingen grants til `anon`/`authenticated`.                                                                                                                              |

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
  #86's database-trigger blokerer alle claim/completion-writes under en aktiv
  kontoslettereservation; et output fra en overhalet worker ryddes derfor igen.
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
- `calendar-feed` (#11): offentligt iCalendar-feed til eksterne kalender-apps, som ikke
  kan sende en bruger-JWT. Gateway-verifikation er derfor slået fra. Funktionen bruger
  projektets Publishable key og kan via anon-rollen kun læse den dataminimerede
  `calendar_feed_events`-view med titel, tidspunkt og sted -- aldrig beskrivelse eller
  andre medlemsdata.
- `probation-notifications` (#82): leverer Web Push til admins ved nye
  prøvemedlemskabsansøgninger og til ansøgeren ved godkendelse/afvisning. Funktionen
  modtager kun et ansøgnings-id og en tilfældig, servergenereret notification-token
  (eller en admins JWT); navn, afgørelse og push-endpoints slås op server-side med
  Secret key. Postgres køer kaldet efter commit med `pg_net`, og `pg_cron` genforsøger
  midlertidige fejl. Funktionen deployes derfor med `--no-verify-jwt`, men hvert POST
  laver sin egen token/admin-kontrol, før en leveringsstatus kan tages til behandling.
- `submit-probation-application` (#87): eneste offentlige indgang til nye
  prøvemedlemskabsansøgninger. Functionen validerer input, bruger Cloudflares
  platform-satte `CF-Connecting-IP`, HMAC-hasher misbrugssignaler og kalder en
  service-role-only RPC, som rate-limiter og opretter ansøgning/push/outbox atomisk.
  Den er offentlig uden gateway-JWT, men klienten kan hverken vælge signalerne eller
  kalde den interne RPC direkte.
- Fælles VAPID- og Web Push-kode ligger i `supabase/functions/_shared/`, så chat og
  prøvemedlemskaber bruger præcis samme afsendernøgle og krypteringskode.
- Fælles CORS-håndtering ligger i `supabase/functions/_shared/cors.ts`. Den tillader
  appens GitHub Pages-origin (`https://rastermanden.github.io`), som både produktion
  og alle `/naturklubben/pr-preview/pr-<nr>/`-previews deler, samt localhost/loopback
  på vilkårlige porte til lokal udvikling. Requests uden `Origin` forbliver tilladt
  til kalenderklienter, database-hooks og tests; browserrequests fra andre origins
  afvises med 403, også før den egentlige function-handler kører. Eventuelle senere
  eksakte app-origins kan tilføjes kommasepareret uden sti eller afsluttende skråstreg i
  function-miljøvariablen `CORS_ALLOWED_ORIGINS`; preview-stier skal ikke tilføjes, da
  CORS kun ser origin.
- `delete-account` (#86): kræver standard gateway-JWT, validerer tokenet igen med
  `auth.getUser`, kræver den eksakte bekræftelsestekst og afviser sessioner, hvis
  `last_sign_in_at` er mere end fem minutter gammel. Klienten genautentificerer med
  `signInWithPassword`; adgangskoden sendes kun til Supabase Auth og aldrig til
  functionen. En service-role-RPC reserverer sletningen under en fælles Postgres
  advisory lock, så to admins ikke samtidig kan passere sidste-admin-reglen. Mens
  reservationen er frisk, blokerer RLS nye brugerwrites og Storage-uploads.
  Functionen tømmer derefter brugerens paginerede præfiks i `avatars`,
  `photos-original` og `photos-optimized`, før Auth-brugeren slettes.
- `export-account` (#129): kræver samme gateway-JWT, server-side tokenvalidering
  og højst fem minutter gamle genlogin som kontosletning. Functionen filtrerer
  eksplicit profil, egne beskeder, egne billedmetadata og egne tilmeldinger på
  den validerede brugers id. Billedreferencer får signerede Storage-URL'er med 15
  minutters levetid, og svaret kan downloades som JSON uden andre medlemmers
  private data.
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

## Databasetests

`ci.yml`'s `database`-job afspiller hele migrationskæden mod en tom
`supabase/postgres`-service-container og kører pgTAP-tests ovenpå. Det hele styres af
`supabase/tests/run.sh`, som kun bruger de sædvanlige `PG*`-miljøvariable og derfor
aldrig kan ramme produktion.

| Fil                     | Rolle                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/00_platform.sql` | Det minimale Supabase-platformsskema, migrationerne forudsætter: API-rollerne, `auth.users`, `auth.uid()`, Storage-tabellerne, billed-bucketsene og `supabase_realtime`.    |
| `tests/01_helpers.sql`  | pgTAP (i sit eget `tests`-skema) plus `tests.create_member()`, `tests.set_claims()`, `tests.login()`, `tests.login_service()`, `tests.logout()` og `tests.reset_session()`. |
| `tests/rls/*.sql`       | Selve testene. Hver fil er én transaktion, der rulles tilbage, så fixtures aldrig lækker mellem filerne.                                                                    |

`00_platform.sql` opretter kun det, der mangler. Imaget leverer selv en del af
objekterne og ejer dem med andre roller, så en ubetinget `create or replace` ville
fejle på manglende ejerskab.

Testene skifter identitet, som PostgREST gør det: `tests.login()` sætter både
databaserollen (`set local role authenticated`) og de JWT-claims, `auth.uid()` læser.
Derfor håndhæves RLS reelt -- en test måler den samme vej, som klienten går.
`service_role` har `bypassrls` ligesom i produktion, så Edge Function-testene ser
præcis det, Secret key ser.

### Sådan skriver du en test

En ny politik, RPC eller grant hører hjemme i en af filerne i `tests/rls/`. Skelettet
ser sådan ud -- de fire markerede linjer er ikke til at gætte sig til, så kopiér dem:

```sql
begin;

-- 1) pgTAP kalder sine egne hjælpefunktioner ukvalificeret. Uden tests i
--    search_path fejler det med "function plan(integer) does not exist" -- og
--    kvalificerer du i stedet kaldet som tests.plan(), flytter fejlen bare indad
--    til "function _set(unknown, integer) does not exist". Sæt search_path i
--    stedet, med public først, så appens egne navne aldrig skygges.
set local search_path = public, tests;

-- 2) Antallet skal stemme med antallet af assertions nedenfor.
select plan(2);

-- 3) Fixtures og sessionsskift ligger i do-blokke, så outputtet bliver ren TAP.
do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.login('00000000-0000-0000-0000-00000000000a');
end
$$;

select is(
  (select count(*)::int from public.messages),
  0,
  'et nyt medlem ser en tom chat'
);

select throws_ok(
  $$delete from public.messages$$,
  '42501',
  null,
  'et medlem kan ikke slette beskeder direkte'
);

-- 4) finish(true) rejser en exception, hvis bare én assertion fejlede. Det er dét,
--    der får psql til at afbryde med exit 3 og jobbet til at fejle.
select * from finish(true);

rollback;
```

Faldgruber, der har kostet tid før:

- **`throws_ok` med tre argumenter er `(sql, errcode, errmsg)`** -- ikke
  `(sql, errcode, beskrivelse)`. Vil du kun matche på SQLSTATE og skrive en
  beskrivelse, skal du bruge fire argumenter med `null` i midten, som ovenfor.
  Matcher du på beskeden, skal det være funktionens egen tekst, fx
  `'message_delete_not_authorized'`.
- **Skift altid tilbage med `tests.reset_session()`**, før du lægger flere fixtures
  op. Ellers rammer dine `insert`s selv RLS.
- **Vælg faste UUID'er** til medlemmer og rækker (`00000000-...-00000000000a`). Så kan
  en fejlende assertion læses uden at slå id'er op.
- **Testen skal måle adfærd, ikke tekst.** Skift rolle, prøv handlingen, og se hvad
  der faktisk sker. Regex over SQL-filen var netop det, #119 afskaffede.

Fixturhjælperne opretter et medlem ad den rigtige vej: `tests.create_member()` skriver
til `allowed_emails` og `auth.users`, og profilen dannes af `handle_new_user`-triggeren
-- præcis som ved en signup.

Ud over politiktestene ligger der et sæt skemainvarianter i `tests/rls/05_schema.sql`:
alle tabeller i `public` har RLS slået til, hver `security definer`-funktion har en låst
`search_path`, ingen politik giver anonyme skriveadgang, og `supabase_realtime`
indeholder præcis de tabeller, klienten abonnerer på. En ny tabel eller funktion, der
glemmer en af delene, fejler dér.

### Sådan kører du testene

**Normalt gør du ingenting.** Du pusher, og `database`-jobbet kører hele kæden på
PR'en -- bootstrap, alle migrationer i navnerækkefølge, pgTAP. Det tager under et
minut. Der er bevidst **ingen lokal opsætning**: kerneprincippet i `CLAUDE.md` er, at
en bidragyder hverken skal have Docker eller en database installeret.

Har du brug for at gentage kørslen mod en konkret database -- fx PR'ens egen Supabase
Preview Branch -- peger `run.sh` på hvad som helst gennem de sædvanlige
`PG*`-miljøvariable:

```sh
PGHOST=... PGPORT=5432 PGUSER=... PGPASSWORD=... PGDATABASE=postgres \
  supabase/tests/run.sh
```

Bemærk at scriptet **afspiller alle migrationer forfra** og lægger testskemaet op. Peg
det kun på en database, der må skrives til fra bunden -- aldrig på produktion.

Enkeltfiler kan køres for sig, når bootstrap og migrationer allerede er kørt:

```sh
psql -X -q -t -A -v ON_ERROR_STOP=1 -f supabase/tests/rls/10_messages.sql
```

Fejler en assertion, skriver pgTAP `not ok N` med både det forventede og det faktiske
resultat, og `finish(true)` afslutter med exit 3.

## Kontosletning og dataopbevaring

Produktbeslutningen i #86 er en hybrid mellem sletning og anonymisering:

| Data                                                  | Ved kontosletning                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Auth-bruger, profil, avatar, allowlist-adgang         | Slettes permanent.                                                                                            |
| Originale og optimerede galleribilleder samt metadata | Slettes permanent.                                                                                            |
| Kalenderdeltagelser og push-abonnementer              | Slettes via eksisterende `ON DELETE CASCADE`.                                                                 |
| Chatbeskeder                                          | Bevares, men `user_id` sættes til `NULL` og klienten viser “Tidligere medlem”; admins kan fortsat slette dem. |
| Kalenderbegivenheder                                  | Bevares, men `created_by` sættes til `NULL`; admins kan fortsat slette dem.                                   |
| Prøvemedlemsansøgninger med samme e-mail              | Slettes af Auth-delete-triggeren, hvis de stadig findes.                                                      |
| Adminrolle-audit (#96)                                | Bevares, men både bruger-id og navnesnapshots erstattes med en fælles anonym værdi.                           |

Storage, Postgres og Auth Admin kan ikke indgå i én fælles transaktion.
Slettefunktionerne er derfor eksplicit genoptagelige:

1. `delete-account` reserverer først sletningen og blokerer nye writes.
2. Hver Storage-bucket listes gentagne gange fra offset 0 og slettes i batches, indtil
   præfikset er tomt. Allerede manglende objekter er succes ved retry.
3. Først derefter slettes Auth-brugeren; databasecascade og trigger rydder resten.
4. Fejler Storage, bevares konto og metadata, selv om enkelte filer kan være slettet.
   Klienten viser ingen succes og et nyt kald fortsætter med de resterende filer.
5. Fejler Auth Admin efter Storage, er filerne allerede væk, men et nyt kald kan
   genkøre reservationen og fuldføre Auth-/databasefasen.

`profiles.deletion_reserved_at` udløber efter 15 minutter, så en strandet
providerfejl ikke spærrer et medlem permanent. Sidste-admin-kontrollen køres igen ved
hvert retry; reservation og kontrol serialiseres under samme advisory lock, så der
ikke er et TOCTOU-vindue mellem to samtidige administratorer. En separat trigger
bruger samme låserækkefølge som adminrolle-RPC'en (#96) -- rollelock først og
kontosletningslock bagefter -- så en samtidig nedgradering hverken kan give TOCTOU
eller deadlock og ikke kan efterlade klubben uden admins.

Retention for prøvemedlemskab håndhæves dagligt af det idempotent planlagte
`pg_cron`-job `purge-expired-probation-applications`:

- godkendte og afviste ansøgninger slettes 90 dage efter `reviewed_at`;
- uafgjorte ansøgninger slettes 12 måneder efter `created_at`;
- den tilknyttede push-række slettes via `ON DELETE CASCADE`.

Jobbet er adskilt fra #87's rate-limit-oprydning
`cleanup-probation-submission-attempts`. Rate-limit-tabellen indeholder kun
HMAC-hashes af e-mail/IP/netværk og ryddes separat efter 25 timer; den rå e-mail
og netværksadresse gemmes ikke dér. Inaktive medlemskonti slettes ikke
automatisk; de gennemgås manuelt efter 24 måneder, fordi der endnu ikke findes
et sikkert varslingsflow. Den offentlige formulering findes på `/datapolitik`.

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
listen.

Den tekst når dog aldrig frem til klienten: GoTrue pakker enhver exception fra en trigger
på `auth.users` ind i sit eget svar og returnerer 500 med den faste besked
`Database error saving new user`. Det er altså **den** streng,
`src/features/auth/authErrors.ts` skal kende for at kunne sige noget brugbart om en
afvist invitation -- `Email not allowed` bliver stående som oversættelse, hvis Supabase
en dag begynder at sende databasens egen tekst videre, men i dag rammer den ikke.

Skriver man en adresse forkert på listen, ser den, der prøver at oprette sig, derfor bare
en generisk fejl. Tjek `allowed_emails` i `/admin`, før du leder efter fejlen i koden --
`20260826170000_fix_mikkel_allowlist_email.sql` rettede netop sådan en tastefejl.

Admins vedligeholder listen på `/admin` i appen. At fjerne en adresse spærrer kun for
_nye_ oprettelser -- en allerede oprettet bruger i `auth.users` bliver ikke slettet af
det og kan fortsat logge ind.

## Ansøgninger om prøvemedlemskab

Offentlige besøgende kan sende en ansøgning fra `/proevemedlemskab`. Indsendelsen
beder først om Web Push-tilladelse, så svaret kan nå ansøgeren uden en ekstern
mailudbyder. Klienten kalder Edge Functionen `submit-probation-application` -- aldrig
databasens submit-RPC direkte. Kun admins kan læse en oprettet ansøgning i `/admin`.

Functionen bruger kun `CF-Connecting-IP`, som Cloudflare sætter på trafik fra sin
edge til Supabase-origin. `X-Forwarded-For` ignoreres bevidst: en allerede
eksisterende kæde kan indeholde caller-kontrollerede adresser. Mangler den trusted
header, indeholder den flere værdier, eller kan adressen ikke parses, fejler
indsendelsen lukket med 503 i stedet for at køre uden rate limit. IPv4 normaliseres
til eksakt adresse og `/24`, IPv6 til eksakt adresse og `/64`; IPv4-mappet IPv6
normaliseres som IPv4.

IP, subnet og trimmet/lowercase e-mail HMAC-hashes i tre domæneadskilte inputs med
den auto-injicerede Supabase Secret key. Hashene har fast SHA-256-format. Rå IP og
subnet sendes aldrig til Postgres eller function-logs; body, e-mail, push-token,
endpoint og hashes logges heller ikke. Rotation af Secret key gør gamle hashes
usammenlignelige og nulstiller derfor højst de kortlivede limiter-vinduer.

Den interne `submit_probation_application_limited()` kan kun køres som
`service_role`. Under deterministisk ordnede transaktionslåse registrerer den
forsøget, kontrollerer alle overlappende glidende vinduer og opretter derefter
ansøgning, push-abonnement og notification-outbox i samme transaktion:

| Signal                  | Grænse                   |
| ----------------------- | ------------------------ |
| Eksakt IP               | 3 forsøg på 15 minutter  |
| Eksakt IP               | 10 forsøg på 24 timer    |
| Normaliseret e-mail     | 3 forsøg på 24 timer     |
| IPv4 `/24` / IPv6 `/64` | 25 forsøg på 24 timer    |
| Global nødgrænse        | 1.000 forsøg på 24 timer |

Den globale grænse er kun en nødbremse mod et distribueret angreb, ikke den normale
limiter. En lav grænse ville være let at udnytte til availability-DoS; 1.000 lader
de mere præcise IP/net/e-mail-grænser gøre det daglige arbejde, men sætter stadig et
loft over database- og adminbelastning. Et stort distribueret botnet kan fortsat
ramme loftet. CAPTCHA/Turnstile tilføjes først, hvis det problem ses i praksis:
ellers ville det indføre ekstern tracking, konto/secrets og manuelle dashboardtrin.
Honeypots, `Origin`, user-agent og klienttimere bruges ikke som sikkerhed, fordi de
er trivielt manipulerbare.

Allerede tilladte e-mails og e-mails med en pending ansøgning er server-side no-ops.
De får samme HTTP 202, response-body og 400--500 ms responstidsklasse som en reel
ny ansøgning, så formularen ikke kan bruges til at enumerere medlems-/ansøgerstatus.
Kun den reelle nye ansøgning opretter adminrække og outbox. Rate limit returnerer
429 med `Retry-After`; UI'et viser ventetiden på dansk. De kortlivede limiter-rækker
indeholder kun HMAC-hashes og slettes automatisk efter 25 timer. Ansøgningernes
generelle dataretention ejes separat af #86 og ændres ikke af spam-beskyttelsen.

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
hjemmeskærmen. `supabase/config.toml` gør, at GitHub-integrationen deployer
submit-functionen til PR'ens Supabase Preview Branch. `pr-preview.yml` sender
automatisk en request med en caller-sat, ugyldig `CF-Connecting-IP` og kræver, at
Cloudflare enten afviser den ved edge eller overskriver den. Derefter sendes en
spoofet, multipel `X-Forwarded-For`; den skal ignoreres, mens platformens
`CF-Connecting-IP` får requestet frem til body-valideringen (HTTP 400).
PR-previews har ingen service worker og kan derfor ikke afprøve selve
push-leveringen -- kun submit/migration/RLS/UI.

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

### Bekræftelsesmailen på et PR-preview

En Preview Branch er sit eget Supabase-projekt med sin egen auth-opsætning, og
bekræftelse af e-mail er typisk **slået fra** dér. Så returnerer `signUp()` en session
med det samme, og der bliver aldrig sendt en mail -- man er logget ind uden at have
bekræftet noget. Det er ikke en fejl i mailopsætningen; der er bare ikke noget at
bekræfte.

`src/pages/SignupPage.tsx` skelner derfor mellem de tre svar, Supabase giver _uden_ en
fejl: en session (bekræftelse slået fra -> "du er oprettet og logget ind"), en bruger med
tom `identities`-liste (adressen findes allerede, og der sendes ingen ny mail) og en
almindelig oprettelse (mailen er på vej). Kigger man kun på `error`, kommer appen til at
love en bekræftelsesmail i alle tre tilfælde.

Bemærk også, at Supabase' indbyggede mailtjeneste er stramt rate limited og kun er
tiltænkt test. Rammer man grænsen, svarer Auth med en fejl -- ikke med tavshed.

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
