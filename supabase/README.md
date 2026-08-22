# Supabase

Se `CLAUDE.md` i repo-roden for de overordnede spilleregler: migrations skrives og
committes som SQL-filer her, valideres via Supabase Preview Branching på PR'en, og
deployes automatisk til produktion ved merge til `main` -- aldrig manuelt.

## Skema

| Tabel            | Formål                                                                                                          | RLS                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`       | 1:1 med `auth.users`. Oprettes automatisk ved signup via `handle_new_user`-trigger. Har `is_admin`-flag.        | Alle autentificerede kan læse; kun ejeren kan opdatere egen række.                                                                          |
| `activities`     | Offentligt indhold om klubbens aktiviteter (#10).                                                               | Alle (også anonyme) kan læse; kun admins kan skrive.                                                                                        |
| `events`         | Kalenderbegivenheder (#11).                                                                                     | Kun autentificerede kan læse/oprette; kun ejer kan opdatere/slette egne.                                                                    |
| `photos`         | Metadata for uploadede billeder -- selve filerne ligger i Storage (#12).                                        | Kun autentificerede kan læse/oprette; kun ejer kan opdatere/slette egne. `optimized_path`/`thumbnail_path` sættes af edge-functionen i #13. |
| `messages`       | Gruppechat, ét fælles rum (#14). Del af `supabase_realtime`-publikationen.                                      | Kun autentificerede kan læse/skrive; kun afsender kan slette egne.                                                                          |
| `allowed_emails` | Allowlist over e-mails, der må oprette en bruger. Håndhæves af `check_allowed_email`-triggeren på `auth.users`. | Kun admins kan læse/skrive (via `public.is_admin()`); almindelige medlemmer har ingen adgang.                                               |

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

## Admin-adgang

`profiles.is_admin` styrer, hvem der kan redigere `activities` og administrere
allowlisten `allowed_emails` (siden `/admin` i appen).

- Flaget kan **ikke** sættes af brugeren selv: triggeren `profiles_protect_admin_flag`
  afviser en ændring af `is_admin`, medmindre den, der ændrer det, allerede er admin --
  eller kalder uden en bruger-session (service-role, SQL-editoren, Table Editor og
  migrations).
- Den første admin sættes i migrationen `20260822130000_admin_allowed_emails.sql`, som
  forfremmer klubbens ejer. Skal en anden også være admin, sættes `is_admin` i Supabase
  Table Editor på den pågældende profil-række. Der er bevidst ingen UI til at gøre andre
  til admin.

## Allowlist til signup

`allowed_emails` afgør, hvem der kan oprette en bruger. Triggeren `check_allowed_email`
på `auth.users` afviser en signup med `Email not allowed`, hvis adressen ikke står på
listen (klienten oversætter fejlen til en dansk besked i `src/features/auth/authErrors.ts`).

Admins vedligeholder listen på `/admin` i appen. At fjerne en adresse spærrer kun for
_nye_ oprettelser -- en allerede oprettet bruger i `auth.users` bliver ikke slettet af
det og kan fortsat logge ind.
