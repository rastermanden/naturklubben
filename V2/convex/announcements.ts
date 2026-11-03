import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { currentProfile, requireWritableProfile } from './authz'
import { type PushPayload, type PushTarget } from './push'

/**
 * Nyheder om nye funktioner: medlemmerne skal have besked, når appen har fået
 * noget nyt -- både i appen og som en push-notifikation.
 *
 * Portet fra 20260829160000_feature_announcements.sql,
 * 20260830090000_feature_announcement_push_deliveries.sql og
 * `supabase/functions/feature-announcements/`.
 *
 * Tre egenskaber er bevaret med vilje, fordi de er selve pointen:
 *
 * 1. **En nyhed er kode, ikke indhold.** Rækken står i `ANNOUNCEMENTS`
 *    herunder, i den samme ændring som funktionen -- ikke i et panel bagefter.
 *    I den gamle app var "koden" en migration; i V2 er der ingen migrationer,
 *    så `seedAnnouncements` indsætter listen idempotent (på `slug`), og
 *    `requestDelivery` kalder den, første gang nogen åbner appen efter et
 *    deploy. Det er samme udløser som i den gamle app: klienten, ikke
 *    databasen.
 * 2. **Kun én gang, og kun inden for syv dage.** Vinduet står ét sted
 *    (`claimable`), og det bruges både af listen over udestående nyheder og af
 *    claim'en.
 * 3. **Leveringsloggen hænger på abonnementet**, ikke på medlemmet: har man
 *    telefon og computer, skal et genforsøg kunne nå den ene enhed uden at
 *    vække den anden igen.
 */

/** Siden, en nyhed åbner, når notifikationen ikke selv peger et bedre sted hen. */
export const ANNOUNCEMENT_PATH = 'nyheder'

/**
 * Én række pr. funktion, medlemmerne kan mærke. Skriv, hvad man kan gøre nu --
 * ikke hvad der er refaktoreret. `slug` er stabil og skrives i små bogstaver
 * med bindestreger; `path` er relativ og uden skråstreg foran.
 *
 * Teksterne er de samme som migrationernes `feature_announcements`.
 */
export const ANNOUNCEMENTS = [
  {
    slug: 'nyheder-om-nye-funktioner',
    title: 'Du får nu besked, når appen får noget nyt',
    body: 'Nye funktioner dukker op under Nyheder -- og som en notifikation på telefonen, hvis du har slået notifikationer til. Du bestemmer selv på Nyheder-siden, om du vil have dem.',
    path: 'nyheder',
  },
  {
    slug: 'naturlog',
    title: 'Ny: Naturlog -- skriv, hvad du har set',
    body: 'Set en rød glente eller fundet kantareller? Åbn Naturlog i menuen, skriv art, sted og dato -- og læg gerne et billede og din position ved. Hele klubben kan se loggen, og billedet ryger også i galleriet.',
    path: 'naturlog',
  },
  {
    slug: 'chat-klikbare-links',
    title: 'Links i chatten er nu klikbare',
    body: 'Sæt en tur- eller artikellink ind i en besked, og det bliver automatisk til et link, man kan trykke på.',
    path: 'chat',
  },
  {
    slug: 'moerkt-tema',
    title: 'Appen kan nu blive mørk om aftenen',
    body: 'Nederst på siden -- og i menuen på telefonen -- kan du nu vælge mellem Lys, Mørk og Auto. Auto følger telefonens egen indstilling, så appen selv bliver mørk, når din telefon gør det om aftenen. Valget gælder den enhed, du sidder med.',
  },
  {
    slug: 'chat-fuldskaerm',
    title: 'Chatten fylder nu skærmen på telefonen',
    body: 'Beskederne har fået den plads, der før gik til søgefelt og knapper -- de ligger nu bag tandhjulet øverst i chatten. Vil du have det hele, så tryk på ⤢ og læs chatten i fuldskærm; tryk på ⤡ for at komme ud igen.',
    path: 'chat',
  },
  {
    slug: 'kompakte-beskeder',
    title: 'Der er plads til flere beskeder på skærmen',
    body: 'Hver besked fylder nu det halve: afsender, tidspunkt og knapper står på én linje øverst i boblen. Svar er blevet til ↩︎, Reagér til ☺︎ og Slet til ×. Tryk og hold på tidspunktet for at se det præcise klokkeslæt.',
    path: 'chat',
  },
  {
    slug: 'spil-tetris',
    title: 'Nyt: Spil Tetris mod resten af klubben',
    body: 'Der er kommet en spil-side i menuen. Første spil er Tetris -- spil på telefonen eller med piletasterne, og dit bedste resultat ryger på klubbens resultatliste. Hvor højt kan du komme?',
    path: 'spil',
  },
  {
    slug: 'spil-kaptajn-kaper',
    title: 'Nyt spil: Kaptajn Kaper i Kattegat',
    body: "Kongen har givet dig kaperbrev. Jag de engelske skibe i Kattegat, skyd dem mør eller entr dem, sejl priserne til København -- og bliv adlet, før rivalen får komtessen. Et hjemmecomputerspil fra 1980'erne, genskabt til telefonen. Find det under Spil.",
    path: 'spil/kaper',
  },
  {
    slug: 'profil-pronominer',
    title: 'Fortæl de andre, hvad du gerne vil kaldes',
    body: 'På din profil kan du nu vælge dine pronominer -- fx hun/hende, han/ham, de/dem eller hen/hen -- eller skrive dine egne. De vises ved dit navn på medlemslisten og i chatten, så ingen behøver at gætte -- og de andre får besked i chatten, når du vælger.',
    path: 'profil',
  },
  {
    slug: 'profil-hjertesager',
    title: 'Vis, hvad du står for, ved dit navn',
    body: 'På din profil kan du nu sætte små mærker ved dit navn: 🇺🇦 for Ukraine, 🏳️‍🌈 regnbueflaget og 💉 for vaccineret. De vises på medlemslisten og i chatten -- vælg dem, der passer på dig, eller ingen.',
    path: 'profil',
  },
  {
    slug: 'profil-flere-hjertesager',
    title: 'Flere mærker at sætte ved dit navn',
    body: 'Der er kommet flere hjertesager at vælge imellem på din profil: 🏳️‍⚧️ transflaget, 🌍 klimaet, 🐝 biodiversitet, 🐾 dyrevelfærd, 🌱 plantebaseret, 🕊️ fred, 🩸 bloddonor, 🫀 organdonor og 🚲 cyklist. Vælg dem, der passer på dig.',
    path: 'profil',
  },
  {
    slug: 'spil-2048',
    title: 'Nyt spil: 2048',
    body: 'Skub brikkerne sammen, så to ens bliver til én -- og se, om du kan nå 2048. Stryg over brættet på telefonen eller brug piletasterne. Dit bedste resultat lander på klubbens liste. Find det under Spil.',
    path: 'spil/2048',
  },
  {
    slug: 'turneringsstyring',
    title: 'Ny side: styr klubbens turneringer',
    body: 'Under Turnering kan du oprette en turnering med alle-mod-alle eller udslagsrunder, vælge deltagere blandt medlemmerne og taste resultater ind kamp for kamp, mens I spiller.',
    path: 'turnering',
  },
  {
    slug: 'offentlig-kalender',
    title: 'Åbn en tur for folk uden for klubben',
    body: 'Sæt kryds i "Åben for ikke-medlemmer", når du opretter eller retter en begivenhed. Så kan alle se den på den offentlige kalender og søge om at komme med -- du godkender eller afviser ansøgningerne på begivenheden, og ansøgeren får svar på e-mail. Godkendte gæster tæller med i deltagertallet.',
    path: 'kalender',
  },
  {
    slug: 'push-kalender-og-maerker',
    title: 'Få besked om nye ture i kalenderen',
    body: 'Appen kan nu sende dig en notifikation, når der kommer en ny begivenhed i kalenderen, og dagen før en tur du er tilmeldt. Vælg selv hvilke på din profil under "Notifikationer".',
    path: 'profil',
  },
  {
    slug: 'kalender-venteliste',
    title: 'Pladsloft og venteliste på ture',
    body: 'En tur kan nu have et max antal deltagere. Er der fyldt op, kommer du på venteliste og rykker automatisk op, når nogen melder afbud -- så får du besked i chatten. Du kan også melde afbud, så arrangøren ved, du ikke kommer, og arrangøren kan minde dem, der endnu ikke har svaret.',
    path: 'kalender',
  },
  {
    slug: 'turnering-finale-bedst-af-fem',
    title: 'Finalen går nu over fem spil',
    body: 'I udslagsrunder afgøres finalen nu bedst af fem spil -- resten af kampene er stadig bedst af tre. Reglerne står nu øverst på turneringen, så I kan slå dem op midt i det hele.',
    path: 'turnering',
  },
  {
    slug: 'afstemninger-i-chatten',
    title: 'Afstemninger i chatten',
    body: 'Skriv /afstemning <spørgsmål> | <svar 1> | <svar 2> i chatten for at lave en afstemning -- fx "hvor skal vi hen på lørdag?". Alle kan stemme med det samme, og stemmerne tælles op live. Opretteren kan lukke afstemningen, når resultatet er klart.',
    path: 'chat',
  },
  {
    slug: 'venteliste-push',
    title: 'Besked når du rykker op fra ventelisten',
    body: 'Står du på venteliste til en tur, og bliver der plads til dig, kan appen nu også sende dig en notifikation om det -- ikke kun en besked i chatten. Vælg selv til eller fra på din profil under "Notifikationer".',
    path: 'kalender',
  },
  {
    slug: 'spil-naturquiz',
    title: 'Nyt spil: Naturquiz',
    body: 'Genkend fuglen, planten eller sporet på billedet blandt fire muligheder. Ti spørgsmål pr. runde, point for at svare rigtigt og hurtigt, og en voksende bonus, hvis du rammer rigtigt flere gange i træk. Dit resultat lander på klubbens liste under Spil.',
    path: 'spil/naturquiz',
  },
  {
    slug: 'galleri-album-kommentarer',
    title: 'Album og kommentarer i galleriet',
    body: 'Billederne er nu samlet i album pr. tur -- med et eget album til billeder uden begivenhed. Åbn et billede og skriv en kommentar, så andre medlemmer kan se den med det samme.',
    path: 'billeder',
  },
  {
    slug: 'naturlog-kort-artsoversigt',
    title: 'Kort og årets første i naturloggen',
    body: 'Observationer med en position kan nu ses på et kort. Under Arter er der en artsoversigt med antal pr. art -- og hvad årets første fund var.',
    path: 'naturlog',
  },
  {
    slug: 'beskeder-uden-daekning',
    title: 'Beskeder skrevet uden dækning sendes nu af sig selv',
    body: 'Er du i skoven uden net, kan du skrive alligevel. Beskeden står med "Sendes, når du er online" og bliver sendt, så snart telefonen har forbindelse igen. Den viser det tidspunkt, du skrev den -- og de andre ser den kun én gang.',
    path: 'chat',
  },
  {
    slug: 'kalender-tidligere-begivenheder',
    title: 'Nu kan du se tidligere ture i kalenderen',
    body: 'Bladr tilbage i kalenderen for at se, hvad klubben har lavet, og hvem der var med. På mobilen finder du dem under "Tidligere begivenheder" nederst på siden.',
    path: 'kalender',
  },
  {
    slug: 'kalender-flerdagsbegivenheder',
    title: 'Ture over flere dage står nu på alle dagene',
    body: 'En weekendtur eller en lejr vises nu i kalenderen på hver dag, den varer, med slutdato og -tid. Og er turen i gang, står den stadig under de kommende, så du kan se, hvem der er med.',
    path: 'kalender',
  },
  {
    slug: 'kalender-billeder-fra-turen',
    title: 'Se billederne fra en tur direkte i kalenderen',
    body: 'Har nogen lagt billeder op fra en tur, står der nu "Se billeder" på turen i kalenderen. Et tryk, og du er i turens album i galleriet.',
    path: 'kalender',
  },
  {
    slug: 'spil-stifinderen',
    title: 'Nyt spil: Stifinderen',
    body: 'Vælg en let, mellemsvær eller svær bane, og gå posterne i rækkefølge. Sti er hurtig, mose er langsom, og vand må du gå udenom. Jo tættere du kommer på den hurtigste rute, jo flere point. Den svære bane kan toppe listen. Find det under Spil.',
    path: 'spil/sti',
  },
  {
    slug: 'spil-fugletraek',
    title: 'Nyt spil: Fugletræk',
    body: 'Vend kortene to ad gangen og find parrene af danske dyr. To ens bliver liggende, to forskellige vendes tilbage. Vælg et let, mellemsvært eller svært bræt. Jo færre vendinger og jo hurtigere, jo flere point. Find det under Spil.',
    path: 'spil/fugletraek',
  },
  {
    slug: 'flyttet-til-naturklubben-dk',
    title: 'Naturklubben har fået sin egen adresse: naturklubben.dk',
    body: 'Appen ligger nu på naturklubben.dk. Har du appen på din hjemmeskærm, så slet den gamle og tilføj den igen herfra. Og bruger du notifikationer, så slå dem til igen under din profil -- de flytter ikke med af sig selv.',
  },
  {
    slug: 'spil-7-kabale',
    title: 'Nyt spil: 7-kabale',
    body: 'Den klassiske kabale er kommet under Spil. Læg kortene i syv rækker, træk fra bunken, og byg de fire grundbunker fra es til konge. Tryk to gange på et kort for at lægge det hjem. Et vundet parti kan komme på listen.',
    path: 'spil/kabale',
  },
  {
    slug: 'spil-boble',
    title: 'Nyt spil: Boble-spillet',
    body: 'Hop mellem platformene, fang modstanderne i bobler og punkter dem. Dit resultat ryger på klubbens liste, så de andre kan prøve at slå det. Find det under Spil.',
    path: 'spil/bobler',
  },
  {
    slug: 'menu-naturlog-spil-log-ud',
    title: 'Naturlog og Spil ligger nu under Aktiviteter',
    body: 'Menuen er blevet kortere, så den kan ses på en telefon. Naturlog og Spil finder du nu under Aktiviteter, og "Log ud" ligger nederst på din profil.',
    path: 'aktiviteter',
  },
  {
    slug: 'chat-laest-af',
    title: 'Nu kan du se, hvem der har læst med i chatten',
    body: 'Under beskederne i chatten står nu små billeder af dem, der har læst så langt. Tryk på dem for at se navnene. Det gælder også dig: de andre kan se, hvor langt du har læst.',
    path: 'chat',
  },
] as const

/** Hvor længe en nyhed kan nå at blive sendt, efter den er udgivet. */
const DELIVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const MAX_PUSH_ATTEMPTS = 10
/** Et fejlet forsøg må tages igen efter et minut; en kørsel, der gik i stå, efter fem. */
const FAILED_RETRY_MS = 60 * 1000
const STALE_SENDING_MS = 5 * 60 * 1000

/** Nyhedens push-payload -- samme form som alle andre notifikationer. */
export function announcementPayload(announcement: {
  slug: string
  title: string
  body: string
  path?: string
}): PushPayload {
  return {
    title: announcement.title,
    body: announcement.body,
    // Hver nyhed har sit eget tag. Med ét fælles tag ville nyhed nummer to
    // erstatte den første i notifikationsskuffen, og et medlem, der ikke havde
    // set den endnu, ville aldrig få den at se.
    tag: `naturklubben-nyhed-${announcement.slug}`,
    path: announcement.path ?? ANNOUNCEMENT_PATH,
  }
}

/**
 * Nyhederne, som et medlem må se dem: kun udgivne, nyeste først, og med
 * "læst"-markeringen for netop dette medlem.
 *
 * Outbox-felterne (pushStatus, pushAttempts, ...) returneres ikke -- de er
 * driftsdata, og den gamle app trak dem bevidst ud af medlemmernes kolonnegrant.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    // Listen er til medlemmer. En gæst skal ikke vælte appen med NOT_A_MEMBER;
    // der er ingen nyheder at vise, før der er en profil.
    const profile = await currentProfile(ctx)
    if (profile === null) return []

    const now = Date.now()

    const announcements = await ctx.db
      .query('featureAnnouncements')
      .withIndex('by_released_at')
      .order('desc')
      .collect()
    const reads = await ctx.db
      .query('featureAnnouncementReads')
      .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
      .collect()
    const read = new Set(reads.map((row) => row.announcementId))

    return announcements
      .filter((announcement) => announcement.releasedAt <= now)
      .map((announcement) => ({
        id: announcement._id,
        slug: announcement.slug,
        title: announcement.title,
        body: announcement.body,
        path: announcement.path,
        releasedAt: announcement.releasedAt,
        isRead: read.has(announcement._id),
      }))
  },
})

/**
 * Markerer nyheder som set. Kaldes, når Nyheder-siden forlades -- ikke når den
 * åbnes, så "Ny"-mærket ikke forsvinder for øjnene af den, der kom for at se,
 * hvad der var nyt.
 *
 * Idempotent: en nyhed, der allerede står som læst, røres ikke.
 */
export const markRead = mutation({
  args: { announcementIds: v.array(v.id('featureAnnouncements')) },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const now = Date.now()
    for (const announcementId of new Set(args.announcementIds)) {
      const existing = await ctx.db
        .query('featureAnnouncementReads')
        .withIndex('by_announcement_and_profile', (q) =>
          q.eq('announcementId', announcementId).eq('profileId', profile._id),
        )
        .unique()
      if (existing) continue
      await ctx.db.insert('featureAnnouncementReads', {
        announcementId,
        profileId: profile._id,
        readAt: now,
      })
    }
    return null
  },
})

/**
 * Til/fra for nyhedsnotifikationer. Valget hører til personen og ikke til
 * installationen, præcis som `chatNotificationPreference`: slår man
 * nyhedsnotifikationer fra på telefonen, skal computeren også tie.
 *
 * Feltet ligger på `profiles` (som i den gamle app) og redigeres her, fordi
 * det er nyhedsdomænets valg -- profilsidens øvrige felter hører til
 * medlemsdomænet.
 */
export const setPushEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    await ctx.db.patch(profile._id, {
      featureNotificationsEnabled: args.enabled,
    })
    return null
  },
})

/** Medlemmets nyhedsvalg, til Nyheder-sidens til/fra. */
export const pushEnabled = query({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const profile = await currentProfile(ctx)
    if (profile === null) return false
    return profile.featureNotificationsEnabled !== false
  },
})

/**
 * Beder serveren sende notifikationen om nye funktioner, hvis den ikke er sendt
 * endnu -- kaldt af klienten, første gang et medlem åbner appen efter et
 * deploy.
 *
 * Kalderen bestemmer intet: den siger ikke hvad der skal sendes eller til hvem.
 * Mutationen sår de nyheder, koden kender (idempotent), og lægger selve
 * udsendelsen i en planlagt action, så svaret til klienten ikke venter på
 * push-tjenesterne. En nyhed, en anden klient allerede har taget, giver ingen
 * sending -- se `takeDeliveries`.
 */
export const requestDelivery = mutation({
  args: {},
  handler: async (ctx) => {
    // Gæster må ikke sætte en udsendelse i gang. Klienten kalder heller ikke,
    // men et direkte kald skal være et nej, ikke en fejl, der ryger i konsollen.
    const profile = await currentProfile(ctx)
    if (profile === null) return null
    await seed(ctx)
    await ctx.scheduler.runAfter(0, internal.pushSend.deliverAnnouncements, {})
    return null
  },
})

// ---------------------------------------------------------------------------
// Udsendelsen: outbox og leveringslog
// ---------------------------------------------------------------------------

/**
 * Indsætter de nyheder, koden kender. Idempotent på `slug`, ligesom
 * `on conflict (slug) do nothing` i den gamle migration -- så den kan kaldes
 * ved hver app-åbning uden at lave dubletter.
 */
function announcementPath(
  announcement: (typeof ANNOUNCEMENTS)[number],
): string | undefined {
  return 'path' in announcement ? announcement.path : undefined
}

async function seed(ctx: MutationCtx) {
  const now = Date.now()
  for (const announcement of ANNOUNCEMENTS) {
    const path = announcementPath(announcement)
    const existing = await ctx.db
      .query('featureAnnouncements')
      .withIndex('by_slug', (q) => q.eq('slug', announcement.slug))
      .unique()
    if (existing) {
      // Teksten følger koden, også når en ældre række blev skrevet med en
      // anden formulering. Slug'en er den stabile nøgle.
      if (
        existing.title !== announcement.title ||
        existing.body !== announcement.body ||
        existing.path !== path
      ) {
        await ctx.db.patch(existing._id, {
          title: announcement.title,
          body: announcement.body,
          path,
        })
      }
      continue
    }
    await ctx.db.insert('featureAnnouncements', {
      slug: announcement.slug,
      title: announcement.title,
      body: announcement.body,
      ...(path ? { path } : {}),
      releasedAt: now,
      createdAt: now,
      pushStatus: 'pending',
      pushAttempts: 0,
    })
  }
}

/** Kan nyheden tages nu? Reglen står ét sted og bruges to steder. */
function claimable(
  announcement: {
    releasedAt: number
    pushStatus: string
    pushAttempts: number
    pushStartedAt?: number
  },
  now: number,
) {
  return (
    announcement.releasedAt <= now &&
    announcement.releasedAt > now - DELIVERY_WINDOW_MS &&
    announcement.pushAttempts < MAX_PUSH_ATTEMPTS &&
    (announcement.pushStatus === 'pending' ||
      (announcement.pushStatus === 'failed' &&
        (announcement.pushStartedAt ?? 0) < now - FAILED_RETRY_MS) ||
      (announcement.pushStatus === 'sending' &&
        (announcement.pushStartedAt ?? 0) < now - STALE_SENDING_MS))
  )
}

/** Nyheder, der stadig mangler at blive sendt, ældste først. */
export const pendingPushes = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const announcements = await ctx.db
      .query('featureAnnouncements')
      .withIndex('by_released_at')
      .collect()
    return announcements
      .filter((announcement) => claimable(announcement, now))
      .sort((a, b) => a.releasedAt - b.releasedAt)
      .map((announcement) => ({
        id: announcement._id,
        slug: announcement.slug,
        title: announcement.title,
        body: announcement.body,
        path: announcement.path,
      }))
  },
})

/**
 * Tager ét leveringsforsøg på en nyhed og giver afsenderen de enheder, der
 * stadig mangler den.
 *
 * Alt, der afgør noget, sker i denne ene mutation: vinduet, forsøgsgrænsen,
 * forsøgsnummeret, præferencen, leveringsloggen og abonnementerne. Den gamle
 * app gjorde det i fem kald og måtte bagefter rydde op, hvis et af dem fejlede.
 *
 * Returnerer null, når der intet var at tage -- en anden klient nåede den
 * først, eller nyheden faldt ud af vinduet. Genkald er derfor harmløst.
 */
export const takeDeliveries = internalMutation({
  args: { announcementId: v.id('featureAnnouncements') },
  handler: async (ctx, args) => {
    const now = Date.now()
    const announcement = await ctx.db.get(args.announcementId)
    if (!announcement || !claimable(announcement, now)) return null

    const attempt = announcement.pushAttempts + 1
    await ctx.db.patch(announcement._id, {
      pushStatus: 'sending',
      pushAttempts: attempt,
      pushStartedAt: now,
      pushError: undefined,
    })

    const deliveries = await ctx.db
      .query('featureAnnouncementPushDeliveries')
      .withIndex('by_announcement', (q) =>
        q.eq('announcementId', announcement._id),
      )
      .collect()
    const delivered = new Set(deliveries.map((row) => row.subscriptionId))

    const subscriptions = await ctx.db.query('pushSubscriptions').collect()
    const targets: PushTarget[] = []
    for (const subscription of subscriptions) {
      if (delivered.has(subscription._id)) continue
      // Et medlem uden profil (fx slettet) eller med nyheder slået fra skal
      // ikke have beskeden. Manglende profil tæller som nej her -- der er
      // ingen at spørge.
      const profile = await ctx.db.get(subscription.profileId)
      if (!profile || profile.featureNotificationsEnabled === false) continue
      targets.push({
        subscriptionId: subscription._id,
        profileId: subscription.profileId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      })
    }

    return { attempt, targets }
  },
})

/**
 * Skriver de leveringer ned, der lykkedes, så et genforsøg kan lade dem være.
 *
 * Et forsøg nummer to findes, fordi ét dødt endpoint kan vælte hele
 * udsendelsen -- ikke fordi de andre skal have beskeden igen. Idempotent:
 * rækken slås op først, og findes den, sker der intet.
 */
export const recordDeliveries = internalMutation({
  args: {
    announcementId: v.id('featureAnnouncements'),
    subscriptionIds: v.array(v.id('pushSubscriptions')),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    for (const subscriptionId of new Set(args.subscriptionIds)) {
      const existing = await ctx.db
        .query('featureAnnouncementPushDeliveries')
        .withIndex('by_announcement_and_subscription', (q) =>
          q
            .eq('announcementId', args.announcementId)
            .eq('subscriptionId', subscriptionId),
        )
        .unique()
      if (existing) continue
      await ctx.db.insert('featureAnnouncementPushDeliveries', {
        announcementId: args.announcementId,
        subscriptionId,
        deliveredAt: now,
      })
    }
    return null
  },
})

/**
 * Melder resultatet tilbage. Forsøgsnummeret er hegnet, så en overhalet kørsel
 * ikke kan overskrive en nyere -- samme `expected_attempt`-fence som
 * `complete_feature_announcement_push` i den gamle app.
 */
export const completePush = internalMutation({
  args: {
    announcementId: v.id('featureAnnouncements'),
    expectedAttempt: v.number(),
    succeeded: v.boolean(),
    failureMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const announcement = await ctx.db.get(args.announcementId)
    if (!announcement) return null
    if (
      announcement.pushStatus !== 'sending' ||
      announcement.pushAttempts !== args.expectedAttempt
    ) {
      return null
    }
    await ctx.db.patch(announcement._id, {
      pushStatus: args.succeeded ? 'sent' : 'failed',
      pushSentAt: args.succeeded ? Date.now() : undefined,
      pushError: args.succeeded ? undefined : args.failureMessage,
    })
    return null
  },
})
