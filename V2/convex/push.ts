import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { internal } from './_generated/api'
import { ConvexError, v } from 'convex/values'
import { requireProfile, requireWritableProfile } from './authz'
import { notificationKind, type NotificationKind } from './tables/notifications'
import type { Doc, Id } from './_generated/dataModel'

/**
 * Push-notifikationer ud over chatten: hvem der skal have hvad, hvordan
 * beskeden ser ud, og hvordan den ikke kan sendes to gange.
 *
 * Portet fra `supabase/functions/_shared/{pushDelivery,pushRecipients,
 * pushPayloads,vapid}.ts` og `supabase/functions/calendar-push/index.ts`.
 *
 * **Det sidste stykke mangler bevidst.** Selve Web Push-afsendelsen kraver
 * AES-128-GCM-kryptering mod abonnementets `p256dh`/`auth` og en signeret
 * VAPID-JWT; det gør `@web-push`-familien, og den pakke findes ikke i dette
 * projekt. Afsendelsen ligger derfor samlet i `convex/pushSend.ts`, hvis krop
 * er en TODO. Alt andet -- præferencer, modtagervalg, payload, leveringslog,
 * idempotens -- er portet og virker uden pakken.
 *
 * Rækkefølgen er den samme som i den gamle app, og det er pointen: claim'en i
 * leveringsloggen sker *før* der sendes, så et gentaget kald -- to klienter, en
 * cron-kørsel, der løber igen -- aldrig sender det samme to gange. Prisen er,
 * at et push, der fejler hos push-tjenesten, ikke forsøges igen; hellere en
 * notifikation, der mangler, end den samme to gange.
 */

/** Det, service workeren pakker ud: titel, tekst, tag og stien, der åbnes. */
export const pushPayload = v.object({
  title: v.string(),
  body: v.string(),
  tag: v.string(),
  path: v.string(),
})

export type PushPayload = {
  title: string
  body: string
  tag: string
  path: string
}

/** Den del af en begivenhed, en notifikation skal bruge. */
export const eventSummary = v.object({
  id: v.string(),
  title: v.string(),
  startAt: v.number(),
  location: v.optional(v.string()),
})

export type EventSummary = {
  id: string
  title: string
  startAt: number
  location?: string
}

/**
 * Hvert abonnement, der skal have en notifikation. `subscriptionId` er med,
 * så et dødt endpoint kan slettes bagefter uden et nyt opslag.
 */
export const pushTarget = v.object({
  subscriptionId: v.id('pushSubscriptions'),
  profileId: v.id('profiles'),
  endpoint: v.string(),
  p256dh: v.string(),
  auth: v.string(),
})

export type PushTarget = {
  subscriptionId: Id<'pushSubscriptions'>
  profileId: Id<'profiles'>
  endpoint: string
  p256dh: string
  auth: string
}

const TIME_ZONE = 'Europe/Copenhagen'

/** Notifikationsteksten er kort -- resten læses i appen. */
const TITLE_MAX_LENGTH = 80

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const timeFormatter = new Intl.DateTimeFormat('da-DK', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function shortTitle(title: string) {
  const trimmed = title.trim().replace(/\s+/g, ' ')
  return trimmed.length > TITLE_MAX_LENGTH
    ? `${trimmed.slice(0, TITLE_MAX_LENGTH - 1)}…`
    : trimmed
}

/** Kalenderdagen i klubbens tidszone, fx "2026-09-14". */
function dayKey(at: number) {
  return dayKeyFormatter.format(new Date(at))
}

/**
 * Kalenderdagen efter `key` -- et døgn, ikke 24 timer, så skiftet til
 * sommertid ikke springer en dag over.
 */
function nextDayKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

/** "søndag den 14. september kl. 10.00" */
export function formatEventStart(startAt: number) {
  return `${dateFormatter.format(new Date(startAt))} kl. ${timeFormatter.format(new Date(startAt))}`
}

/**
 * "i morgen" eller datoen, set fra `now`. Påmindelsen går ud dagen før;
 * skulle den nå frem senere, står datoen der i stedet.
 */
export function relativeDay(startAt: number, now: number) {
  if (dayKey(startAt) === nextDayKey(dayKey(now))) return 'i morgen'
  return dateFormatter.format(new Date(startAt))
}

/**
 * Hver begivenhed har sit eget tag, så to nye begivenheder samme aften ikke
 * erstatter hinanden i notifikationsskuffen. Påmindelsen og oprykningen
 * erstatter derimod med vilje "ny begivenhed" om den samme -- alle tre peger
 * samme sted hen.
 */
export function eventTag(eventId: string) {
  return `naturklubben-event-${eventId}`
}

export function eventPath(eventId: string) {
  return `kalender/${eventId}`
}

export function eventCreatedPayload({
  event,
  creatorName,
}: {
  event: EventSummary
  creatorName?: string
}): PushPayload {
  const name = creatorName?.trim()
  const where = event.location?.trim()
  return {
    title: name
      ? `${name} har oprettet en begivenhed`
      : 'Ny begivenhed i kalenderen',
    body: `${shortTitle(event.title)} · ${formatEventStart(event.startAt)}${
      where ? ` · ${where}` : ''
    }`,
    tag: eventTag(event.id),
    path: eventPath(event.id),
  }
}

export function eventReminderPayload({
  event,
  now,
}: {
  event: EventSummary
  now: number
}): PushPayload {
  const where = event.location?.trim()
  return {
    title: `Husk: ${shortTitle(event.title)}`,
    body: `Du er tilmeldt ${relativeDay(event.startAt, now)} kl. ${timeFormatter.format(new Date(event.startAt))}${
      where ? ` · ${where}` : ''
    }.`,
    tag: eventTag(event.id),
    path: eventPath(event.id),
  }
}

/**
 * Ventelisten (#222/#236): en plads blev ledig, og medlemmet rykkede op. Samme
 * payload til alle, der rykkede op i samme omgang -- hvad der gav pladsen,
 * siger chatbeskeden allerede.
 */
export function waitlistPromotedPayload({
  event,
}: {
  event: EventSummary
}): PushPayload {
  const where = event.location?.trim()
  return {
    title: `Du har fået en plads: ${shortTitle(event.title)}`,
    body: `Der blev en plads ledig, så du er nu tilmeldt ${formatEventStart(event.startAt)}${
      where ? ` · ${where}` : ''
    }.`,
    tag: eventTag(event.id),
    path: eventPath(event.id),
  }
}

function displayName(name?: string) {
  return name?.trim() || 'Et medlem'
}

/**
 * Admins får at vide, hvem der indstillede hvem -- de skal tage stilling. Den
 * indstillede får ingen besked: en afvist indstilling skal ikke hænge på nogen.
 */
export function badgeNominationAdminPayload(nomination: {
  badgeName?: string
  nomineeName?: string
  nominatorName?: string
}): PushPayload {
  const badgeName = nomination.badgeName?.trim() || 'en badge'
  return {
    title: 'Ny indstilling til en badge',
    body: `${displayName(nomination.nominatorName)} har indstillet ${displayName(nomination.nomineeName)} til ${badgeName}.`,
    tag: 'naturklubben-badge-nomination',
    path: 'admin?sektion=badges',
  }
}

// ---------------------------------------------------------------------------
// Abonnementer og endpoints
// ---------------------------------------------------------------------------

/** Samme længdegrænser som `check`-constraints i den gamle database. */
const ENDPOINT_MAX_LENGTH = 2048
const KEY_MAX_LENGTH = 256

/**
 * Push-tjenesternes værtsnavne. Et endpoint er en URL, appen senere sender
 * medlemmets krypterede besked til, så et vilkårligt værtsnavn ville gøre
 * serveren til en videresender for hvem som helst.
 *
 * Portet fra `allowedPushEndpoint` i submit-probation-application/handler.ts og
 * fra `probation_push_endpoint_service` i 20260823133000.
 */
const ENDPOINT_PATTERN =
  /^https:\/\/(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)\//i

export function isAllowedPushEndpoint(endpoint: string) {
  if (endpoint.length === 0 || endpoint.length > ENDPOINT_MAX_LENGTH) {
    return false
  }
  try {
    const url = new URL(endpoint)
    if (
      url.protocol !== 'https:' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return false
    }
    return ENDPOINT_PATTERN.test(endpoint)
  } catch {
    return false
  }
}

export function isValidSubscriptionKeys(p256dh: string, auth: string) {
  return (
    p256dh.length > 0 &&
    p256dh.length <= KEY_MAX_LENGTH &&
    auth.length > 0 &&
    auth.length <= KEY_MAX_LENGTH
  )
}

/**
 * De medlemmer, der både vil have typen og har mindst én enhed at sende til.
 *
 * Et medlem uden en gemt præference behandles som "ja tak": tabellen har ingen
 * række, før man selv har rørt valget. Medlemmer uden abonnement udelades *før*
 * claim'en i leveringsloggen -- ellers ville en, der slår notifikationer til om
 * eftermiddagen, stå som "har fået" en påmindelse, der aldrig blev sendt.
 *
 * Portet fra `selectPushRecipients` i _shared/pushRecipients.ts.
 */
export function selectPushRecipients({
  profileIds,
  preferences,
  subscribedProfileIds,
}: {
  profileIds: readonly Id<'profiles'>[]
  preferences: ReadonlyMap<Id<'profiles'>, boolean>
  subscribedProfileIds: ReadonlySet<Id<'profiles'>>
}): Id<'profiles'>[] {
  const seen = new Set<Id<'profiles'>>()
  const recipients: Id<'profiles'>[] = []
  for (const profileId of profileIds) {
    if (seen.has(profileId)) continue
    seen.add(profileId)
    if (preferences.get(profileId) === false) continue
    if (!subscribedProfileIds.has(profileId)) continue
    recipients.push(profileId)
  }
  return recipients
}

/**
 * Den offentlige VAPID-nøgle -- den, browseren skal bruge for at oprette et
 * abonnement.
 *
 * **Hvorfor offentlig:** prøveansøgningsformularen skal kunne hente den uden at
 * være logget ind (ansøgeren har ingen konto endnu), og en offentlig nøgle er
 * per definition ikke en hemmelighed -- den udleveres til hver browser, der
 * abonnerer. Den private del forlader aldrig serveren og kan ikke læses af
 * nogen klient.
 */
export const vapidPublicKey = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const keys = await ctx.runAction(internal.pushSend.ensureVapidKeys, {})
    return keys.publicKey
  },
})

/**
 * Gemmer nøgleparret, hvis der ikke er noget endnu, og returnerer i alle
 * tilfælde det, der gælder. Erstatter `on conflict (id) do nothing` fra
 * 20260823120000: et kapløb mellem to kald, der begge har genereret et
 * nøglepar, afgøres ved at læse vinderens række.
 */
export const storeVapidKeys = internalMutation({
  args: {
    publicKey: v.string(),
    privateKey: v.string(),
    subject: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('pushVapidKeys')
      .withIndex('by_key', (q) => q.eq('key', 'vapid'))
      .unique()
    if (existing) {
      return {
        publicKey: existing.publicKey,
        privateKey: existing.privateKey,
        subject: existing.subject,
      }
    }

    await ctx.db.insert('pushVapidKeys', {
      key: 'vapid',
      publicKey: args.publicKey,
      privateKey: args.privateKey,
      subject: args.subject,
      createdAt: Date.now(),
    })
    return {
      publicKey: args.publicKey,
      privateKey: args.privateKey,
      subject: args.subject,
    }
  },
})

/** Nøgleparret, som det står gemt -- eller null, hvis der aldrig er genereret et. */
export const readVapidKeys = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('pushVapidKeys')
      .withIndex('by_key', (q) => q.eq('key', 'vapid'))
      .unique()
    if (!row) return null
    return {
      publicKey: row.publicKey,
      privateKey: row.privateKey,
      subject: row.subject,
    }
  },
})

/**
 * Gemmer denne browsers abonnement for det indloggede medlem.
 *
 * `endpoint` er nøglen: findes den allerede -- fx fordi telefonen har skiftet
 * ejer, eller fordi samme browser har været brugt af en anden konto -- flyttes
 * rækken til den, der er logget ind nu. Ellers ville den gamle ejer fortsat få
 * notifikationer på den nye ejers telefon. Erstatter `upsert ... onConflict:
 * 'endpoint'` i usePushNotifications.ts.
 */
export const registerSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  },
  handler: async (ctx, args): Promise<Id<'pushSubscriptions'>> => {
    const profile = await requireWritableProfile(ctx)

    const endpoint = args.endpoint.trim()
    const p256dh = args.p256dh.trim()
    const auth = args.auth.trim()
    if (!isAllowedPushEndpoint(endpoint)) {
      throw new ConvexError('INVALID_PUSH_ENDPOINT')
    }
    if (!isValidSubscriptionKeys(p256dh, auth)) {
      throw new ConvexError('INVALID_PUSH_KEYS')
    }

    const now = Date.now()
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        profileId: profile._id,
        p256dh,
        auth,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert('pushSubscriptions', {
      profileId: profile._id,
      endpoint,
      p256dh,
      auth,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Slår denne browsers abonnement fra. Kræver kun et medlem og ikke et
 * skrivbart medlem: en, der er i gang med at slette sin konto, skal stadig
 * kunne slå notifikationer fra.
 */
export const unregisterSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireProfile(ctx)
    const endpoint = args.endpoint.trim()
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .unique()
    // En andens abonnement er ikke nogens sag at slette; et ukendt endpoint er
    // ikke en fejl (browseren kan have ryddet sit abonnement selv).
    if (existing && existing.profileId === profile._id) {
      await ctx.db.delete(existing._id)
    }
    return null
  },
})

/** Er netop denne browsers endpoint registreret på det indloggede medlem? */
export const subscriptionStatus = query({
  args: { endpoint: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const profile = await requireProfile(ctx)
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint.trim()))
      .unique()
    return existing !== null && existing.profileId === profile._id
  },
})

// ---------------------------------------------------------------------------
// Leveringslog og modtagere
// ---------------------------------------------------------------------------

/**
 * Skriver medlemmet i leveringsloggen, hvis det ikke allerede står der, og
 * siger til eller fra.
 *
 * Det er her, den gamle databases `primary key (kind, subject_id, user_id)`
 * bliver til noget: Convex har ingen unikke indeks, så opslaget og
 * indsættelsen skal ske i samme mutation -- og det gør de, fordi hele
 * `prepareDeliveries` er én mutation. To samtidige kald kan derfor ikke begge
 * se "ikke sendt": Convex serialiserer mutationer, og den anden kører forfra
 * mod den nye tilstand. Genkaldes mutationen, findes rækken og intet sker.
 */
async function claimDelivery(
  ctx: MutationCtx,
  kind: NotificationKind,
  subjectId: string,
  profileId: Id<'profiles'>,
  now: number,
) {
  const existing = await ctx.db
    .query('pushDeliveries')
    .withIndex('by_kind_and_subject_and_profile', (q) =>
      q
        .eq('kind', kind)
        .eq('subjectId', subjectId)
        .eq('profileId', profileId),
    )
    .unique()
  if (existing) return false
  await ctx.db.insert('pushDeliveries', {
    kind,
    subjectId,
    profileId,
    sentAt: now,
  })
  return true
}

/**
 * Tager modtagerne til én notifikation og giver afsenderen de abonnementer, der
 * skal bruges. Erstatter `deliver_push`-forløbet i `_shared/pushDelivery.ts`
 * trin 1-3: præferencer fra, "ingen enhed" fra, claim i leveringsloggen,
 * abonnementer for de medlemmer, der fik rækken.
 *
 * Mutationen er intern: en klient må ikke kunne vælge modtagere. Det er
 * serveren, der afgør kredsen -- fx "alle andre end arrangøren" eller "dem,
 * der sidder på en plads nu".
 */
export const prepareDeliveries = internalMutation({
  args: {
    kind: notificationKind,
    subjectId: v.string(),
    profileIds: v.array(v.id('profiles')),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ targets: PushTarget[]; skipped: number }> => {
    const now = Date.now()
    const candidates = [...new Set(args.profileIds)]

    // Ét opslag for hele typen frem for ét pr. medlem: præferencerækkerne er
    // små, og en klubs medlemsliste er det også.
    const preferences = new Map<Id<'profiles'>, boolean>()
    const preferenceRows = await ctx.db
      .query('notificationPreferences')
      .withIndex('by_kind_and_profile', (q) => q.eq('kind', args.kind))
      .collect()
    for (const row of preferenceRows) {
      preferences.set(row.profileId, row.enabled !== false)
    }

    const subscribedProfileIds = new Set<Id<'profiles'>>()
    const subscriptions = new Map<Id<'profiles'>, Doc<'pushSubscriptions'>[]>()
    for (const profileId of candidates) {
      const rows = await ctx.db
        .query('pushSubscriptions')
        .withIndex('by_profile', (q) => q.eq('profileId', profileId))
        .collect()
      if (rows.length === 0) continue
      subscribedProfileIds.add(profileId)
      subscriptions.set(profileId, rows)
    }

    const recipients = selectPushRecipients({
      profileIds: candidates,
      preferences,
      subscribedProfileIds,
    })

    const targets: PushTarget[] = []
    let claimed = 0
    for (const profileId of recipients) {
      const won = await claimDelivery(
        ctx,
        args.kind,
        args.subjectId,
        profileId,
        now,
      )
      if (!won) continue
      claimed += 1
      for (const subscription of subscriptions.get(profileId) ?? []) {
        targets.push({
          subscriptionId: subscription._id,
          profileId,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        })
      }
    }

    return { targets, skipped: candidates.length - claimed }
  },
})

/**
 * Fjerner leveringer, der er så gamle, at emnet ikke kan dukke op igen.
 * Erstatter `delete from push_deliveries where sent_at < now() - interval
 * '90 days'` i `enqueue_event_reminders`.
 */
export const pruneOldDeliveries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
    const rows = await ctx.db
      .query('pushDeliveries')
      .withIndex('by_sent_at', (q) => q.lt('sentAt', cutoff))
      .collect()
    for (const row of rows) {
      await ctx.db.delete(row._id)
    }
    return rows.length
  },
})

/**
 * Fjerner et abonnement, push-tjenesten har meldt dødt (404/410). Kaldes kun af
 * afsenderen i `convex/pushSend.ts`; et medlem kan ikke slette en andens
 * abonnement, og en klient kan ikke afgøre, at et endpoint er dødt.
 */
export const removeSubscription = internalMutation({
  args: { subscriptionId: v.id('pushSubscriptions') },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.subscriptionId)
    if (existing) await ctx.db.delete(existing._id)
    return null
  },
})

/**
 * Erstatter pg_cron-jobbet `enqueue-event-reminders` (`*/15 * * * *`): find de
 * begivenheder, der starter i morgen efter kl. 17, og bed om en påmindelse.
 *
 * **Hvad der er portet:** vinduet, oprydningen i leveringsloggen og
 * kadencen (se `convex/crons.ts`). **Hvad der mangler:** selve opslaget i
 * `events` og `eventAttendance`. Kalenderdomænet er ikke portet endnu, så
 * tabellerne findes ikke i V2's skema, og en `ctx.db.query('events')` ville
 * ikke kompilere. Når kalenderen lander, skal denne mutation hente
 * `events` med `startAt` i morgen, indsætte/opdatere `eventReminders` (samme
 * token-fence som `claim_event_reminder`/`complete_event_reminder`) og sende
 * afsted gennem `internal.pushSend.deliverPush`.
 */
export const enqueueEventReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const cutoff = now - 90 * 24 * 60 * 60 * 1000
    const old = await ctx.db
      .query('pushDeliveries')
      .withIndex('by_sent_at', (q) => q.lt('sentAt', cutoff))
      .collect()
    for (const row of old) {
      await ctx.db.delete(row._id)
    }

    // TODO(kalender): find begivenheder, der starter i morgen efter kl. 17
    // (Europe/Copenhagen), og planlæg en påmindelse pr. begivenhed. Blokeret
    // af, at `events` og `eventAttendance` ikke er i V2's skema endnu.
    return { enqueued: 0 }
  },
})
