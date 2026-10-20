import {
  httpAction,
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import { internal } from './_generated/api'
import { v, type Infer } from 'convex/values'
import { requireAdmin } from './authz'
import {
  isAllowedPushEndpoint,
  isValidSubscriptionKeys,
  type PushPayload,
  type PushTarget,
} from './push'

/**
 * Prøvemedlemskab: ansøgningsflowet ende-til-ende, inklusive rate limiting.
 *
 * Portet fra 20260822160000_probation_applications.sql,
 * 20260823133000_probation_notifications.sql,
 * 20260823161500_probation_application_rate_limits.sql,
 * `supabase/functions/submit-probation-application/` og
 * `supabase/functions/probation-notifications/`.
 *
 * Tre ting er bevaret, fordi de er sikkerheden i flowet:
 *
 * 1. **Ansøgeren er ikke logget ind.** Derfor er indgangen en `httpAction` og
 *    ikke en mutation: kun dér kan serveren selv se, hvor anmodningen kom fra.
 *    Klienten sender navn, e-mail, motivation og sit push-abonnement -- aldrig
 *    et IP-signal, som den kunne lyve om.
 * 2. **Rå IP-adresser og e-mailadresser gemmes aldrig.** `httpAction`'en
 *    HMAC-hasher hvert signal, før det når en mutation, præcis som Edge
 *    Function'en gjorde.
 * 3. **Et svar, der ikke kan leveres, ændrer aldrig afgørelsen.** Ansøgningen
 *    og dens leveringsstatus skrives i samme mutation; selve pushet sendes
 *    bagefter af `convex/pushSend.ts`, og en fejl der rører kun outbox-felterne.
 *
 * Ruten skal registreres i `convex/http.ts` (som dette domæne ikke ejer):
 *
 * ```ts
 * for (const route of probationHttpRoutes) {
 *   http.route({ path: route.path, method: route.method, handler: route.handler })
 * }
 * ```
 */

/** Stien til den offentlige ansøgningsformular, relativ til Convex site-URL'en. */
export const PROBATION_APPLICATION_PATH = '/proevemedlemskab'

const FULL_NAME_MAX_LENGTH = 200
const EMAIL_MAX_LENGTH = 320
const MOTIVATION_MAX_LENGTH = 5000
/** Samme loft som Edge Function'en: en ansøgning er tekst, ikke en fil. */
const MAX_BODY_BYTES = 16_384

/**
 * Rate-limiterne, som de stod i
 * 20260823161500_probation_application_rate_limits.sql.
 */
const WINDOW_15_MINUTES_MS = 15 * 60 * 1000
const WINDOW_24_HOURS_MS = 24 * 60 * 60 * 1000
const MAX_PER_IP_15_MINUTES = 3
const MAX_PER_IP_24_HOURS = 10
const MAX_PER_EMAIL_24_HOURS = 3
const MAX_PER_NETWORK_24_HOURS = 25
const MAX_GLOBAL_24_HOURS = 1000

/** Forsøgsgrænse og genforsøgsvinduer for notifikations-outboxen. */
const MAX_NOTIFICATION_ATTEMPTS = 10
const FAILED_RETRY_MS = 60 * 1000
const STALE_SENDING_MS = 5 * 60 * 1000
const CRON_RETRY_MS = 15 * 60 * 1000

/** Hvor længe rate-limit-forsøg huskes. Længst vindue plus en time. */
const ATTEMPT_RETENTION_MS = 25 * 60 * 60 * 1000
/** Afgjorte ansøgninger slettes efter 90 dage, ubesvarede efter 12 måneder. */
const DECIDED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const PENDING_RETENTION_MS = 365 * 24 * 60 * 60 * 1000

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface ValidatedApplication {
  fullName: string
  email: string
  motivation: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Validerer det, ansøgeren sendte. Samme grænser og samme fejltyper som
 * `validateSubmission` i submit-probation-application/handler.ts -- en tom
 * tekst er en anden fejl end en for lang, for formularen skal kunne sige hvad
 * der er galt uden at afsløre noget om, hvem der er medlem.
 */
export function validateApplication(
  value: unknown,
):
  | { ok: true; application: ValidatedApplication }
  | { ok: false; code: 'required' | 'too_long' | 'invalid' } {
  if (!isRecord(value) || !isRecord(value.subscription)) {
    return { ok: false, code: 'required' }
  }

  const fullName =
    typeof value.fullName === 'string' ? value.fullName.trim() : ''
  const email =
    typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  const motivation =
    typeof value.motivation === 'string' ? value.motivation.trim() : ''
  const endpoint =
    typeof value.subscription.endpoint === 'string'
      ? value.subscription.endpoint.trim()
      : ''
  const p256dh =
    typeof value.subscription.p256dh === 'string'
      ? value.subscription.p256dh.trim()
      : ''
  const auth =
    typeof value.subscription.auth === 'string'
      ? value.subscription.auth.trim()
      : ''

  if (
    fullName.length === 0 ||
    email.length === 0 ||
    motivation.length === 0 ||
    endpoint.length === 0 ||
    p256dh.length === 0 ||
    auth.length === 0
  ) {
    return { ok: false, code: 'required' }
  }

  if (
    fullName.length > FULL_NAME_MAX_LENGTH ||
    email.length > EMAIL_MAX_LENGTH ||
    motivation.length > MOTIVATION_MAX_LENGTH ||
    endpoint.length > 2048 ||
    p256dh.length > 256 ||
    auth.length > 256
  ) {
    return { ok: false, code: 'too_long' }
  }

  if (
    !EMAIL_PATTERN.test(email) ||
    !isAllowedPushEndpoint(endpoint) ||
    !isValidSubscriptionKeys(p256dh, auth)
  ) {
    return { ok: false, code: 'invalid' }
  }

  return {
    ok: true,
    application: { fullName, email, motivation, endpoint, p256dh, auth },
  }
}

/**
 * HMAC-SHA-256 af ét rate-limit-signal, hexkodet -- samme konstruktion og samme
 * domæneadskillelse som `hmacSignal` i Edge Function'en, så et signal ikke kan
 * genbruges på tværs af domæner.
 *
 * Hemmeligheden er en Convex-miljøvariabel (`RATE_LIMIT_HASH_SECRET`), ikke
 * noget, klienten kender. Uden `crypto.subtle` i runtime'en fejler kaldet
 * højt i stedet for at falde tilbage til noget svagere -- så hellere en
 * formular, der siger "prøv igen om lidt", end et rate-limit, der kan omgås.
 */
export async function hmacSignal(
  secret: string,
  domain: 'exact-ip' | 'network' | 'email',
  value: string,
) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('RATE_LIMIT_HASH_UNAVAILABLE')
  }
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`probation-rate-limit-v1\0${domain}\0${value}`),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Klientens adresse, sådan som `httpAction`'en ser den. Kun til internt brug:
 * adressen hashes med det samme og gemmes aldrig.
 *
 * **Usikkert punkt:** i den gamle app kom adressen fra Cloudflares
 * `cf-connecting-ip`, som ikke kan sættes af klienten. Convex dokumenterer ikke
 * en tilsvarende betroet header for `httpAction`, så her læses
 * `x-forwarded-for`s første led. Det skal bekræftes mod Convex' dokumentation
 * (eller erstattes af Convex' egen adresse-oplysning, hvis den findes), før
 * rate limitingen kan kaldes sikker. Er headeren fraværende, bruges en fast
 * pladsholder -- så deler alle ukendte kald ét budget i stedet for at slippe
 * helt igennem.
 */
export function clientAddress(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  const value = first && first.length > 0 ? first : 'unknown'
  // Netværket er den grove del: /24 for IPv4 og /64 for IPv6 er det, den gamle
  // app brugte. Her er det nok at kende præfikset, ikke at parse IP'en korrekt.
  const network = value.includes(':')
    ? value.split(':').slice(0, 4).join(':')
    : value.split('.').slice(0, 3).join('.')
  return { exact: value, network }
}

/**
 * Notifikationsteksterne. Portet fra `payloadFor` i
 * `supabase/functions/probation-notifications/index.ts`.
 */
export function probationPayload({
  application,
  kind,
}: {
  application: { id: string; fullName: string; status: string }
  kind: 'admin' | 'decision'
}): PushPayload {
  if (kind === 'admin') {
    const applicantName = application.fullName.trim().slice(0, 120)
    return {
      title: 'Ny ansøgning om prøvemedlemskab',
      body: `${applicantName} har sendt en ansøgning.`,
      tag: `probation-application-${application.id}`,
      path: 'admin',
    }
  }

  if (application.status === 'approved') {
    return {
      title: 'Din ansøgning er godkendt',
      body: 'Du kan nu oprette en bruger i Naturklubben.',
      tag: `probation-decision-${application.id}`,
      path: 'opret',
    }
  }

  return {
    title: 'Svar på din ansøgning',
    body: 'Din ansøgning om prøvemedlemskab er blevet afvist.',
    tag: `probation-decision-${application.id}`,
    path: 'proevemedlemskab',
  }
}

// ---------------------------------------------------------------------------
// Ansøgningen
// ---------------------------------------------------------------------------

/**
 * Hvor mange millisekunder der går, før et loft igen tillader et forsøg.
 *
 * `times` er de forsøg, der ligger inden for vinduet, sorteret stigende. Er der
 * `limit` eller færre, er der intet at vente på; ellers bliver forsøg nummer
 * `count - limit` (0-indekseret) for gammelt på tidspunktet `times[count-limit]
 * + window`, og netop da er der plads igen. Samme udregning som `offset
 * greatest(count - limit, 0)` i den gamle RPC.
 */
export function waitForSlot(
  times: readonly number[],
  limit: number,
  windowMs: number,
): number {
  if (times.length <= limit) return 0
  const sorted = [...times].sort((a, b) => a - b)
  const freeing = sorted[sorted.length - limit - 1]
  return freeing + windowMs
}

/**
 * Opretter ansøgningen -- efter at rate-limiterne har sagt god for den.
 *
 * Kaldes kun af `httpAction`'en herunder, som selv har hashet IP, netværk og
 * e-mail. Derfor er der ingen vej uden om rate limitingen: mutationen er
 * intern, og den tager hashes som argument, ikke en adresse.
 *
 * Rækkefølgen er den samme som i den gamle RPC: forsøget skrives *først*, så et
 * forsøg, der bliver afvist, også tæller med. Derefter afvises en e-mail, der
 * allerede er medlem eller har en ubesvaret ansøgning -- men med samme svar til
 * klienten som en rigtig ansøgning, så formularen ikke bliver et oracle for,
 * hvem der er medlem.
 */
export const submitApplication = internalMutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    motivation: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    notificationToken: v.string(),
    ipHash: v.string(),
    networkHash: v.string(),
    emailHash: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { outcome: 'accepted' }
    | { outcome: 'rate_limited'; retryAfterSeconds: number }
  > => {
    const now = Date.now()

    const perIpShort = await ctx.db
      .query('probationSubmissionAttempts')
      .withIndex('by_ip_and_time', (q) =>
        q
          .eq('ipHash', args.ipHash)
          .gt('attemptedAt', now - WINDOW_15_MINUTES_MS),
      )
      .collect()
    const perIpDay = await ctx.db
      .query('probationSubmissionAttempts')
      .withIndex('by_ip_and_time', (q) =>
        q
          .eq('ipHash', args.ipHash)
          .gt('attemptedAt', now - WINDOW_24_HOURS_MS),
      )
      .collect()
    const perEmailDay = await ctx.db
      .query('probationSubmissionAttempts')
      .withIndex('by_email_and_time', (q) =>
        q
          .eq('emailHash', args.emailHash)
          .gt('attemptedAt', now - WINDOW_24_HOURS_MS),
      )
      .collect()
    const perNetworkDay = await ctx.db
      .query('probationSubmissionAttempts')
      .withIndex('by_network_and_time', (q) =>
        q
          .eq('networkHash', args.networkHash)
          .gt('attemptedAt', now - WINDOW_24_HOURS_MS),
      )
      .collect()
    const globalDay = await ctx.db
      .query('probationSubmissionAttempts')
      .withIndex('by_attempted_at', (q) =>
        q.gt('attemptedAt', now - WINDOW_24_HOURS_MS),
      )
      .collect()

    await ctx.db.insert('probationSubmissionAttempts', {
      ipHash: args.ipHash,
      networkHash: args.networkHash,
      emailHash: args.emailHash,
      attemptedAt: now,
    })

    const waits = [
      waitForSlot(
        perIpShort.map((row) => row.attemptedAt),
        MAX_PER_IP_15_MINUTES,
        WINDOW_15_MINUTES_MS,
      ),
      waitForSlot(
        perIpDay.map((row) => row.attemptedAt),
        MAX_PER_IP_24_HOURS,
        WINDOW_24_HOURS_MS,
      ),
      waitForSlot(
        perEmailDay.map((row) => row.attemptedAt),
        MAX_PER_EMAIL_24_HOURS,
        WINDOW_24_HOURS_MS,
      ),
      waitForSlot(
        perNetworkDay.map((row) => row.attemptedAt),
        MAX_PER_NETWORK_24_HOURS,
        WINDOW_24_HOURS_MS,
      ),
      waitForSlot(
        globalDay.map((row) => row.attemptedAt),
        MAX_GLOBAL_24_HOURS,
        WINDOW_24_HOURS_MS,
      ),
    ]
    const retryAt = Math.max(0, ...waits)
    if (retryAt > now) {
      return {
        outcome: 'rate_limited',
        retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1000)),
      }
    }

    // To forventede sammenstød, som bevidst svarer som en rigtig ansøgning:
    // e-mailen er allerede lukket ind, eller der ligger en ubesvaret ansøgning.
    const allowed = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique()
    if (allowed) return { outcome: 'accepted' }

    const pending = await ctx.db
      .query('probationApplications')
      .withIndex('by_email_and_status', (q) =>
        q.eq('email', args.email).eq('status', 'pending'),
      )
      .first()
    if (pending) return { outcome: 'accepted' }

    const applicationId = await ctx.db.insert('probationApplications', {
      fullName: args.fullName,
      email: args.email,
      motivation: args.motivation,
      status: 'pending',
      createdAt: now,
      notificationToken: args.notificationToken,
      adminNotificationStatus: 'pending',
      adminNotificationAttempts: 0,
      decisionNotificationAttempts: 0,
    })

    await ctx.db.insert('probationPushSubscriptions', {
      applicationId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      createdAt: now,
    })

    // Selve afsendelsen sker efter mutationen -- et eksternt HTTP-kald kan ikke
    // være en del af den. Fejler den, står ansøgningen stadig som pending, og
    // `retryNotifications` tager den igen.
    await ctx.scheduler.runAfter(0, internal.pushSend.deliverProbationNotification, {
      applicationId,
      kind: 'admin',
    })

    return { outcome: 'accepted' }
  },
})

/** Ét push-abonnement, der hører til en ansøgning og ikke til et medlem. */
export const probationPushTarget = v.object({
  subscriptionId: v.id('probationPushSubscriptions'),
  endpoint: v.string(),
  p256dh: v.string(),
  auth: v.string(),
})

/**
 * Kan outbox-rækken tages nu? `failed` må forsøges igen efter et minut,
 * `sending` efter fem, så en kørsel, der døde midt i et kald, ikke bliver
 * hængende for evigt -- samme vinduer som `claim_probation_notification`.
 */
function claimableNotification(
  status: string | undefined,
  attempts: number,
  startedAt: number | undefined,
  now: number,
) {
  if (attempts >= MAX_NOTIFICATION_ATTEMPTS) return false
  if (status === 'pending') return true
  if (status === 'failed') return (startedAt ?? 0) < now - FAILED_RETRY_MS
  if (status === 'sending') return (startedAt ?? 0) < now - STALE_SENDING_MS
  return false
}

/**
 * Tager ét leveringsforsøg for en ansøgning og giver afsenderen de enheder, der
 * skal bruges.
 *
 * `admin` går til alle administrators enheder -- beskeden er kollektiv, og
 * klubben er varslet, når mindst én enhed har fået den. `decision` går til
 * ansøgerens eget abonnement, som ikke hører til en profil.
 *
 * Null betyder "der var intet at tage": allerede sendt, forsøgene er brugt op,
 * eller en anden kørsel er i gang. Genkald er derfor harmløst.
 */
export const claimNotification = internalMutation({
  args: {
    applicationId: v.id('probationApplications'),
    kind: v.union(v.literal('admin'), v.literal('decision')),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const application = await ctx.db.get(args.applicationId)
    if (!application) return null
    if (
      args.kind === 'decision' &&
      application.status !== 'approved' &&
      application.status !== 'rejected'
    ) {
      return null
    }

    const status =
      args.kind === 'admin'
        ? application.adminNotificationStatus
        : application.decisionNotificationStatus
    const attempts =
      args.kind === 'admin'
        ? application.adminNotificationAttempts
        : application.decisionNotificationAttempts
    const startedAt =
      args.kind === 'admin'
        ? application.adminNotificationStartedAt
        : application.decisionNotificationStartedAt
    if (!claimableNotification(status, attempts, startedAt, now)) return null

    const attempt = attempts + 1
    if (args.kind === 'admin') {
      await ctx.db.patch(application._id, {
        adminNotificationStatus: 'sending',
        adminNotificationAttempts: attempt,
        adminNotificationStartedAt: now,
        adminNotificationError: undefined,
      })
    } else {
      await ctx.db.patch(application._id, {
        decisionNotificationStatus: 'sending',
        decisionNotificationAttempts: attempt,
        decisionNotificationStartedAt: now,
        decisionNotificationError: undefined,
      })
    }

    const memberTargets: PushTarget[] = []
    const applicantTargets: Infer<typeof probationPushTarget>[] = []
    if (args.kind === 'admin') {
      const admins = await ctx.db
        .query('profiles')
        .withIndex('by_admin', (q) => q.eq('isAdmin', true))
        .collect()
      for (const admin of admins) {
        const subscriptions = await ctx.db
          .query('pushSubscriptions')
          .withIndex('by_profile', (q) => q.eq('profileId', admin._id))
          .collect()
        for (const subscription of subscriptions) {
          memberTargets.push({
            subscriptionId: subscription._id,
            profileId: admin._id,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          })
        }
      }
    } else {
      const subscriptions = await ctx.db
        .query('probationPushSubscriptions')
        .withIndex('by_application', (q) =>
          q.eq('applicationId', application._id),
        )
        .collect()
      for (const subscription of subscriptions) {
        applicantTargets.push({
          subscriptionId: subscription._id,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        })
      }
    }

    return {
      attempt,
      application: {
        id: application._id,
        fullName: application.fullName,
        status: application.status,
      },
      memberTargets,
      applicantTargets,
    }
  },
})

/**
 * Melder resultatet tilbage. `expectedAttempt` er hegnet, så en overhalet
 * kørsel ikke kan overskrive en nyere -- samme `expected_attempt`-fence som
 * `complete_probation_notification`.
 */
export const completeNotification = internalMutation({
  args: {
    applicationId: v.id('probationApplications'),
    kind: v.union(v.literal('admin'), v.literal('decision')),
    expectedAttempt: v.number(),
    succeeded: v.boolean(),
    failureMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId)
    if (!application) return null

    if (args.kind === 'admin') {
      if (
        application.adminNotificationStatus !== 'sending' ||
        application.adminNotificationAttempts !== args.expectedAttempt
      ) {
        return null
      }
      await ctx.db.patch(application._id, {
        adminNotificationStatus: args.succeeded ? 'sent' : 'failed',
        adminNotificationSentAt: args.succeeded ? Date.now() : undefined,
        adminNotificationError: args.succeeded
          ? undefined
          : args.failureMessage,
      })
      return null
    }

    if (
      application.decisionNotificationStatus !== 'sending' ||
      application.decisionNotificationAttempts !== args.expectedAttempt
    ) {
      return null
    }
    await ctx.db.patch(application._id, {
      decisionNotificationStatus: args.succeeded ? 'sent' : 'failed',
      decisionNotificationSentAt: args.succeeded ? Date.now() : undefined,
      decisionNotificationError: args.succeeded
        ? undefined
        : args.failureMessage,
    })
    return null
  },
})

/** Fjerner et abonnement, ansøgerens push-tjeneste har meldt dødt. */
export const removeProbationSubscription = internalMutation({
  args: { subscriptionId: v.id('probationPushSubscriptions') },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.subscriptionId)
    if (existing) await ctx.db.delete(existing._id)
    return null
  },
})

// ---------------------------------------------------------------------------
// Afgørelsen, set fra admin-siden
// ---------------------------------------------------------------------------

/** Ansøgningerne, så en admin kan tage stilling. Kun admins kan kalde den. */
export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('approved'),
        v.literal('rejected'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const applications = await ctx.db
      .query('probationApplications')
      .withIndex('by_status', (q) => q.eq('status', args.status ?? 'pending'))
      .collect()
    return applications
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((application) => ({
        id: application._id,
        fullName: application.fullName,
        email: application.email,
        motivation: application.motivation,
        status: application.status,
        createdAt: application.createdAt,
        reviewedAt: application.reviewedAt,
        // Driftsdata: en admin skal kunne se, at svaret ikke nåede frem, så
        // vedkommende kan sige det videre med en anden kanal.
        decisionNotificationStatus: application.decisionNotificationStatus,
        decisionNotificationError: application.decisionNotificationError,
      }))
  },
})

/**
 * Godkender en ansøgning: e-mailen ryger på allowlisten, og ansøgeren får
 * svaret som en push. Begge dele sker i samme mutation, så en leveringsfejl
 * aldrig kan få databasen til at se ud, som om afgørelsen ikke blev taget --
 * samme rækkefølge som `approve_probation_application`.
 */
export const approve = mutation({
  args: { applicationId: v.id('probationApplications') },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    const application = await ctx.db.get(args.applicationId)
    if (!application || application.status !== 'pending') {
      throw new Error('APPLICATION_NOT_FOUND')
    }

    const allowed = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', application.email))
      .unique()
    if (!allowed) {
      await ctx.db.insert('allowedEmails', { email: application.email })
    }

    await ctx.db.patch(application._id, {
      status: 'approved',
      reviewedAt: Date.now(),
      reviewedBy: admin._id,
      decisionNotificationStatus: 'pending',
      decisionNotificationAttempts: 0,
      decisionNotificationStartedAt: undefined,
      decisionNotificationSentAt: undefined,
      decisionNotificationError: undefined,
    })

    await ctx.scheduler.runAfter(
      0,
      internal.pushSend.deliverProbationNotification,
      { applicationId: application._id, kind: 'decision' },
    )
    return null
  },
})

/** Afviser en ansøgning. Ansøgeren får svaret som en push. */
export const reject = mutation({
  args: { applicationId: v.id('probationApplications') },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    const application = await ctx.db.get(args.applicationId)
    if (!application || application.status !== 'pending') {
      throw new Error('APPLICATION_NOT_FOUND')
    }

    await ctx.db.patch(application._id, {
      status: 'rejected',
      reviewedAt: Date.now(),
      reviewedBy: admin._id,
      decisionNotificationStatus: 'pending',
      decisionNotificationAttempts: 0,
      decisionNotificationStartedAt: undefined,
      decisionNotificationSentAt: undefined,
      decisionNotificationError: undefined,
    })

    await ctx.scheduler.runAfter(
      0,
      internal.pushSend.deliverProbationNotification,
      { applicationId: application._id, kind: 'decision' },
    )
    return null
  },
})

// ---------------------------------------------------------------------------
// Planlagte kørsler
// ---------------------------------------------------------------------------

/**
 * Erstatter pg_cron-jobbet `retry-probation-notifications` (`*/5 * * * *`).
 * Finder ansøgninger, hvis svar aldrig nåede frem -- eller hvis kørsel døde
 * midt i kaldet -- og lægger en ny afsendelse i køen. Outboxens forsøgsgrænse
 * og `claimNotification` gør et ekstra kald harmløst.
 */
export const retryNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    let enqueued = 0

    for (const status of ['pending', 'approved', 'rejected'] as const) {
      const applications = await ctx.db
        .query('probationApplications')
        .withIndex('by_status', (q) => q.eq('status', status))
        .collect()
      for (const application of applications) {
        if (
          status === 'pending' &&
          claimableNotification(
            application.adminNotificationStatus,
            application.adminNotificationAttempts,
            application.adminNotificationStartedAt,
            now,
          )
        ) {
          // Kun kørsler, der ikke allerede er i gang lige nu: et forsøg, der
          // lige er startet, skal have lov at blive færdigt.
          if (
            application.adminNotificationStatus !== 'sending' ||
            (application.adminNotificationStartedAt ?? 0) <
              now - CRON_RETRY_MS
          ) {
            await ctx.scheduler.runAfter(
              0,
              internal.pushSend.deliverProbationNotification,
              { applicationId: application._id, kind: 'admin' },
            )
            enqueued += 1
          }
        }

        if (
          status !== 'pending' &&
          claimableNotification(
            application.decisionNotificationStatus,
            application.decisionNotificationAttempts,
            application.decisionNotificationStartedAt,
            now,
          )
        ) {
          if (
            application.decisionNotificationStatus !== 'sending' ||
            (application.decisionNotificationStartedAt ?? 0) <
              now - CRON_RETRY_MS
          ) {
            await ctx.scheduler.runAfter(
              0,
              internal.pushSend.deliverProbationNotification,
              { applicationId: application._id, kind: 'decision' },
            )
            enqueued += 1
          }
        }
      }
    }

    return { enqueued }
  },
})

/**
 * Erstatter pg_cron-jobbet `cleanup-probation-submission-attempts`
 * (`17 * * * *`): rate-limit-forsøg er kun nyttige lidt ud over det længste
 * vindue.
 */
export const cleanupSubmissionAttempts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ATTEMPT_RETENTION_MS
    const rows = await ctx.db
      .query('probationSubmissionAttempts')
      .withIndex('by_attempted_at', (q) => q.lt('attemptedAt', cutoff))
      .collect()
    for (const row of rows) {
      await ctx.db.delete(row._id)
    }
    return rows.length
  },
})

/**
 * Erstatter pg_cron-jobbet `purge-expired-probation-applications`
 * (`0 3 * * *`): afgjorte ansøgninger slettes 90 dage efter afgørelsen,
 * ubesvarede efter 12 måneder.
 *
 * Convex har ingen `on delete cascade`, så ansøgningens push-abonnement skal
 * slettes med den -- ellers blev et endpoint, ingen kan svare på, liggende.
 */
export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    let deleted = 0

    const decided = await ctx.db.query('probationApplications').collect()
    for (const application of decided) {
      const expired =
        application.status !== 'pending'
          ? (application.reviewedAt ?? 0) < now - DECIDED_RETENTION_MS
          : application.createdAt < now - PENDING_RETENTION_MS
      if (!expired) continue

      const subscriptions = await ctx.db
        .query('probationPushSubscriptions')
        .withIndex('by_application', (q) =>
          q.eq('applicationId', application._id),
        )
        .collect()
      for (const subscription of subscriptions) {
        await ctx.db.delete(subscription._id)
      }
      await ctx.db.delete(application._id)
      deleted += 1
    }

    return deleted
  },
})

// ---------------------------------------------------------------------------
// Den offentlige indgang
// ---------------------------------------------------------------------------

/**
 * Formularen er offentlig, fordi ansøgeren ikke har en konto endnu -- det er
 * hele poenget med prøvemedlemskab. Derfor er der ingen
 * `requireProfile`-kald her, og sikkerheden ligger i stedet i fire ting:
 * validering af felterne, rate limitingen i `submitApplication`, at det kun er
 * *denne* funktion, der kan kalde den mutation, og at klienten aldrig får at
 * vide, om en e-mail i forvejen er medlem.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Retry-After, X-Request-Id',
}

/**
 * Et rigtigt svar og et "e-mailen er allerede medlem"-svar skal tage lige
 * lang tid, ellers bliver formularen et oracle for, hvem der er medlem.
 * Samme gulv og jitter som i `submit-probation-application/handler.ts`.
 */
const MIN_ACCEPTED_RESPONSE_MS = 400
const ACCEPTED_RESPONSE_JITTER_MS = 100

function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...extraHeaders,
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  })
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Ansøgningen om prøvemedlemskab, som HTTP-rute.
 *
 * Klienten sender navn, e-mail, motivation og sit push-abonnement. IP-adressen
 * læses her og harves med det samme -- den kommer aldrig fra klienten og
 * gemmes aldrig, kun som HMAC.
 */
export const submitProbationApplication = httpAction(async (ctx, req) => {
  const requestId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `req-${Date.now()}`
  const startedAt = Date.now()

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ code: 'method_not_allowed' }, 405, requestId, {
      Allow: 'POST, OPTIONS',
    })
  }

  const secret = process.env.RATE_LIMIT_HASH_SECRET
  if (!secret) {
    console.error(`[${requestId}] rate_limit_secret_unavailable`)
    return jsonResponse(
      { code: 'temporarily_unavailable' },
      503,
      requestId,
    )
  }

  // Både HMAC'en herunder og tokens kræver WebCrypto. Findes det ikke i
  // runtime'en, skal formularen sige "prøv igen om lidt" i stedet for at
  // fortsætte uden rate limiting eller med et gætteligt token.
  if (!globalThis.crypto?.subtle) {
    console.error(`[${requestId}] webcrypto_unavailable`)
    return jsonResponse({ code: 'temporarily_unavailable' }, 503, requestId)
  }

  const text = await req.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ code: 'invalid_request' }, 400, requestId)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return jsonResponse({ code: 'invalid_request' }, 400, requestId)
  }

  const validation = validateApplication(parsed)
  if (!validation.ok) {
    return jsonResponse({ code: 'invalid_request' }, 400, requestId)
  }
  const application = validation.application

  const address = clientAddress(req.headers)
  let ipHash: string
  let networkHash: string
  let emailHash: string
  try {
    ;[ipHash, networkHash, emailHash] = await Promise.all([
      hmacSignal(secret, 'exact-ip', address.exact),
      hmacSignal(secret, 'network', address.network),
      hmacSignal(secret, 'email', application.email),
    ])
  } catch (caught) {
    console.error(`[${requestId}] rate_limit_signal_unavailable`, caught)
    return jsonResponse({ code: 'temporarily_unavailable' }, 503, requestId)
  }

  let outcome: 'accepted' | 'rate_limited' = 'accepted'
  let retryAfterSeconds = 0
  try {
    const submitted = await ctx.runMutation(
      internal.probation.submitApplication,
      {
        ...application,
        notificationToken: crypto.randomUUID(),
        ipHash,
        networkHash,
        emailHash,
      },
    )
    outcome = submitted.outcome
    if (submitted.outcome === 'rate_limited') {
      retryAfterSeconds = submitted.retryAfterSeconds
    }
  } catch (caught) {
    console.error(`[${requestId}] submission_backend_failure`, caught)
    return jsonResponse({ code: 'temporarily_unavailable' }, 503, requestId)
  }

  if (outcome === 'rate_limited') {
    const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds))
    return jsonResponse(
      { code: 'rate_limited', retryAfterSeconds: retryAfter },
      429,
      requestId,
      { 'Retry-After': String(retryAfter) },
    )
  }

  const target =
    MIN_ACCEPTED_RESPONSE_MS +
    Math.floor(Math.random() * ACCEPTED_RESPONSE_JITTER_MS)
  const remaining = target - (Date.now() - startedAt)
  if (remaining > 0) await sleep(remaining)

  return jsonResponse({ accepted: true }, 202, requestId)
})

/**
 * Ruterne, som `convex/http.ts` skal registrere. De ligger her og ikke i
 * `http.ts`, fordi `http.ts` er fælles for alle domæner -- se filens
 * hovedkommentar for de tre linjer, der skal til.
 */
export const probationHttpRoutes = [
  {
    path: PROBATION_APPLICATION_PATH,
    method: 'POST' as const,
    handler: submitProbationApplication,
  },
  {
    path: PROBATION_APPLICATION_PATH,
    method: 'OPTIONS' as const,
    handler: submitProbationApplication,
  },
]
