import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { internal } from './_generated/api'
import { ConvexError, v } from 'convex/values'
import { requireProfile, requireWritableProfile } from './authz'
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
 * Næste domæne, der portes, lægger sin egen række her.
 */
export const ANNOUNCEMENTS = [
  {
    slug: 'nyheder-om-nye-funktioner',
    title: 'Du får nu besked, når appen får noget nyt',
    body: 'Nye funktioner dukker op under Nyheder -- og som en notifikation på telefonen, hvis du har slået notifikationer til. Du bestemmer selv på Nyheder-siden, om du vil have dem.',
    path: 'nyheder',
  },
  {
    slug: 'push-kalender-og-maerker',
    title: 'Få besked om nye ture i kalenderen',
    body: 'Appen kan nu sende dig en notifikation, når der kommer en ny begivenhed i kalenderen, og dagen før en tur du er tilmeldt. Vælg selv hvilke på din profil under "Notifikationer".',
    path: 'profil',
  },
  {
    slug: 'venteliste-push',
    title: 'Besked når du rykker op fra ventelisten',
    body: 'Står du på venteliste til en tur, og bliver der plads til dig, kan appen nu også sende dig en notifikation om det -- ikke kun en besked i chatten. Vælg selv til eller fra på din profil under "Notifikationer".',
    path: 'kalender',
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
    const profile = await requireProfile(ctx)
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
    const profile = await requireProfile(ctx)
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
    await requireProfile(ctx)
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
async function seed(ctx: MutationCtx) {
  const now = Date.now()
  for (const announcement of ANNOUNCEMENTS) {
    const existing = await ctx.db
      .query('featureAnnouncements')
      .withIndex('by_slug', (q) => q.eq('slug', announcement.slug))
      .unique()
    if (existing) continue
    await ctx.db.insert('featureAnnouncements', {
      slug: announcement.slug,
      title: announcement.title,
      body: announcement.body,
      path: announcement.path,
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
