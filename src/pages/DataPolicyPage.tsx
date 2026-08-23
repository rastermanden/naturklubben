function DataPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <h1 className="text-3xl font-semibold text-green-900">
        Politik for dataopbevaring
      </h1>
      <p className="mt-3 text-green-800">
        Naturklubben opbevarer kun data, der er nødvendige for medlemsappen og
        klubbens fælles historik. Denne side beskriver, hvad der gemmes, og hvad
        der sker, når du sletter din konto.
      </p>

      <div className="mt-8 grid gap-7 text-green-950">
        <section>
          <h2 className="text-xl font-semibold text-green-900">
            Konto, profil og medlemsadgang
          </h2>
          <p className="mt-2">
            Loginoplysninger administreres af Supabase Auth. Navn, avatar og
            chatfarve bruges til at vise dig i appen, mens din e-mail på
            medlemslisten afgør, om du må oprette en konto. Oplysningerne
            opbevares, mens kontoen er aktiv, og slettes ved kontosletning.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-green-900">
            Chat og kalender
          </h2>
          <p className="mt-2">
            Chatbeskeder og kalenderbegivenheder er fælles klubhistorik. Ved
            kontosletning fjernes forbindelsen til din profil, og indholdet
            vises som fra “Tidligere medlem”. Navn, avatar, e-mail og bruger-id
            bevares ikke sammen med historikken. Tilmeldinger til begivenheder
            slettes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-green-900">
            Billeder og lager
          </h2>
          <p className="mt-2">
            Originaler, webversioner, miniaturebilleder og avatarer opbevares i
            Supabase Storage. Når du sletter et billede eller din konto, fjernes
            filerne og deres metadata straks. Der er ingen papirkurv eller
            gendannelsesperiode. Hvis lagerudbyderen fejler undervejs, erklæres
            sletningen ikke færdig: metadata og konto bevares, mens enkelte
            filer kan være væk. Et nyt forsøg fortsætter sikkert med de
            resterende filer.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-green-900">
            Push-notifikationer
          </h2>
          <p className="mt-2">
            Browserens push-endpoint og krypteringsnøgler gemmes kun for at
            levere valgte notifikationer. De slettes, når du slår funktionen
            fra, når push-tjenesten melder abonnementet udløbet, eller når
            kontoen slettes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-green-900">
            Ansøgninger om prøvemedlemskab
          </h2>
          <p className="mt-2">
            Navn, e-mail, motivation, afgørelse og et eventuelt push-abonnement
            bruges til at behandle og besvare ansøgningen. Alle afgjorte
            ansøgninger og deres pushdata slettes automatisk 90 dage efter
            afgørelsen. Uafgjorte ansøgninger slettes efter 12 måneder.
            Godkendte medlemmers e-mail bliver på medlemslisten, indtil
            medlemsadgangen fjernes eller kontoen slettes. Spam-beskyttelsen
            gemmer kun HMAC-hashes af e-mail- og netværkssignaler, aldrig de rå
            værdier, og sletter dem efter 25 timer.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-green-900">
            Inaktive konti
          </h2>
          <p className="mt-2">
            Konti uden login i 24 måneder gennemgås af en administrator.
            Naturklubben sletter ikke automatisk en inaktiv konto uden først at
            kontakte medlemmet. Et medlem kan altid selv starte permanent
            kontosletning fra profilsiden.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-green-900">
            Adgang og sikkerhed
          </h2>
          <p className="mt-2">
            Medlemsdata er beskyttet af adgangskontrol i databasen. Følsomme
            operationer udføres server-side og udleder altid identiteten fra den
            godkendte login-session. Kontosletning kræver både den nuværende
            adgangskode og en særskilt tekstbekræftelse.
          </p>
        </section>
      </div>
    </main>
  )
}

export default DataPolicyPage
