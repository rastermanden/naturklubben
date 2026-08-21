# Supabase

Se `CLAUDE.md` i repo-roden for de overordnede spilleregler: migrations skrives og
committes som SQL-filer her, valideres via Supabase Preview Branching på PR'en, og
deployes automatisk til produktion ved merge til `main` -- aldrig manuelt.

## Skema

| Tabel | Formål | RLS |
|---|---|---|
| `profiles` | 1:1 med `auth.users`. Oprettes automatisk ved signup via `handle_new_user`-trigger. Har `is_admin`-flag. | Alle autentificerede kan læse; kun ejeren kan opdatere egen række. |
| `activities` | Offentligt indhold om klubbens aktiviteter (#10). | Alle (også anonyme) kan læse; kun admins kan skrive. |
| `events` | Kalenderbegivenheder (#11). | Kun autentificerede kan læse/oprette; kun ejer kan opdatere/slette egne. |
| `photos` | Metadata for uploadede billeder -- selve filerne ligger i Storage (#12). | Kun autentificerede kan læse/oprette; kun ejer kan opdatere/slette egne. `optimized_path`/`thumbnail_path` sættes af edge-functionen i #13. |
| `messages` | Gruppechat, ét fælles rum (#14). Del af `supabase_realtime`-publikationen. | Kun autentificerede kan læse/skrive; kun afsender kan slette egne. |

## Storage buckets

Oprettet manuelt i #2:
- `photos-original` (privat) -- kun autentificerede medlemmer kan læse/skrive egne uploads.
- `photos-optimized` (public) -- alle kan læse. Kun `optimize-image`-edge-functionen
  (Secret key, omgår RLS) kan skrive -- der er bevidst ingen insert-policy for andre.

## Migrations

Filnavngivning: `<timestamp>_<beskrivelse>.sql` i `supabase/migrations/`. Se `CLAUDE.md`
for hele arbejdsgangen (skriv → commit → PR → Preview Branch-validering → merge →
automatisk produktionsdeploy).

## Admin-adgang

`profiles.is_admin` styrer hvem der kan redigere `activities`. Der er ingen UI til at
sætte flaget endnu -- sæt det manuelt i Table Editor for de(n) bruger(e), der skal kunne
redigere aktivitetsindholdet.
