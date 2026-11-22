# Vision

Hvorfor Naturklubben findes, hvem den er for, og hvad der ikke må gå tabt, når nogen
ændrer i den. Hvert issue og hver ændring tjekkes op imod denne fil. Bryder en ændring et
princip, går ændringen — eller dette dokument ændres først, med vilje.

## Hvorfor Naturklubben findes

En klub har brug for ét sted, hvor medlemmerne kan se, hvad der sker, huske hvordan sidste
tur var, og tale sammen uden at skulle ind i endnu en app. Naturklubben er det sted:
klubbens egen medlemsapp på `https://naturklubben.dk`, hvor kalenderen, billederne,
samtalerne og turene bor sammen.

Den er ikke lavet for at være en teknisk demonstration. Den er lavet for at blive brugt af
folk, der er ude i skoven, ikke på et kontor.

## Hvem den er for

**Medlemmerne.** Alle aldre, mange slags telefoner, ingen forventning om at skulle forstå
netværk, backups eller hvad en database er. De skal kunne finde en tur, melde sig til, se
billeder fra sidste gang og skrive til de andre — og det skal give mening første gang.

**Ikke-medlemmer.** Nogle gange er en tur åben for alle. Så skal naboen kunne se den og
søge om at komme med, uden en konto og uden at skulle læse en manual (#224, #239).

**Næste person, der rører koden.** Ofte en AI-agent uden historik, der kun har repoet at
læse. Koden, dokumentationen og testene skal gøre det muligt at lave en rigtig ændring uden
at gætte.

## Principper

1. **Medlemmernes sprog.** Dansk, korte sætninger, ord folk faktisk bruger. Nyheder,
   knapper og fejlbeskeder skrives til medlemmer, ikke til udviklere.
2. **Databasen bestemmer, hvem der må se hvad.** Autorisationslaget i databasen —
   `convex/authz.ts` — er sikkerhedsgrænsen.
   Klienten kan skjule og vise, men aldrig autorisere. Rører en ændring
   autorisationsmodellen, har den en test, der kalder ind som den rigtige rolle og måler,
   hvad der faktisk sker.
3. **Alt kan bygges og udgives fra en browser.** Ingen udvikling må kræve lokal Docker, en
   lokal database eller en deploy-kommando kørt af et menneske. Kode og workflows
   pushes, og integrationerne gør resten. Kun de manuelle engangsopsætninger
   (Convex-projektet og GitHub Pages) sker i et dashboard.
4. **Rolig app.** En notifikation er et afbrud i nogens dag. Medlemmerne får besked om
   noget, de kan mærke — en tur, en besked, en ny ting de kan bruge — aldrig om
   refaktoreringer eller interne rettelser. Kan ingen se forskel, er der ingen nyhed.
5. **Billeder, beskeder og ansøgninger tilhører medlemmerne.** De deles med klubben, ikke
   med internettet. En tur for ikke-medlemmer viser, hvad arrangøren selv har åbnet — ikke
   medlemmernes kalender, billeder eller samtaler.
6. **Den virker ude i skoven.** Svag forbindelse er det normale, ikke fejltilfældet. Skrevet
   uden net lægger beskeden sig i kø og sendes af sig selv, når der igen er forbindelse.
7. **Færdigt slår nyt.** Rydde op, rette det der driller og gøre det halvfærdige færdigt er
   lige så meget værd som en ny side. Færre ting, der virker hver gang, slår flere ting,
   der næsten virker.
8. **Hemmeligheder bliver på serveren.** Kun offentlige URL'er (`VITE_CONVEX_URL` og
   `VITE_CONVEX_SITE_URL`) må ende i det, browseren henter. Deploy-nøgler, API-nøgler og
   VAPID-nøgler findes kun i Convex-miljøet og GitHub Actions.
9. **Man kan se, hvad der kører.** Footeren viser commit'en, og hvert pull request får sit
   eget preview på `naturklubben.dk/pr-preview/pr-<nr>/`. Man skal aldrig gætte, om man
   kigger på produktion, og en PR prøves mod sit eget Convex-preview.
10. **Ærlig dokumentation.** `README.md`, `AGENTS.md` og `V2/README.md` beskriver det,
    der faktisk er prøvet, og peger på den fil eller kommando, der bestemmer sandheden.
