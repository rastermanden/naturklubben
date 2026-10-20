'use node'

import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { announcementPayload } from './announcements'
import { pushPayload, type PushPayload } from './push'
import { probationPayload } from './probation'
import { notificationKind } from './tables/notifications'
import type { Id } from './_generated/dataModel'

/**
 * Web Push-afsendelsen -- det ene sted, hvor der stadig mangler noget.
 *
 * Filen er en Node-action (`'use node'`), fordi Web Push ikke kan skrives med
 * det, Convex' standard-runtime giver: payloaden skal krypteres med
 * AES-128-GCM mod abonnementets `p256dh`/`auth` (RFC 8291), og anmodningen skal
 * bære en ES256-signeret VAPID-JWT (RFC 8292). Det gør `web-push`-pakken, og
 * den er **ikke** tilføjet som afhængighed.
 *
 * Alt andet i forløbet er portet og ligger i V8-runtimen, hvor det kan testes:
 * modtagervalg og leveringslog i `convex/push.ts`, nyhedernes outbox i
 * `convex/announcements.ts`, ansøgningernes udbox i `convex/probation.ts`.
 * Denne fil kalder dem og samler resultatet.
 *
 * ## Hvad der mangler, præcist
 *
 * 1. `npm install web-push` (og `@types/web-push`) i `V2/`.
 * 2. Kaldet i `sendWebPush` herunder: `webpush.sendNotification(...)` med
 *    `vapid`-nøglerne, `TTL`, `urgency` og `Content-Encoding: aes128gcm`.
 * 3. Intet secret skal sættes: nøgleparret genererer og gemmer sig selv i
 *    `pushVapidKeys` (se `ensureVapidKeys`), og miljøvariablerne
 *    `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` er kun en valgfri overstyring.
 * 4. At filen bliver kørt på et Node-runtime med `crypto.subtle` (Node 18+),
 *    hvilket er det samme krav som genereringen af nøgleparret stiller.
 */

/** Kontaktpunkt, hvis push-tjenesten skal kunne række ud. */
const DEFAULT_VAPID_SUBJECT = 'mailto:naturklubben@example.com'

export type VapidDetails = {
  publicKey: string
  privateKey: string
  subject: string
}

type PushOutcome = {
  /** HTTP-status fra push-tjenesten. */
  status: number
  /** Endpointet findes ikke længere (404/410) og skal slettes. */
  isGone: boolean
}

/**
 * Det, afsenderen har brug for. Både et medlemsabonnement og en ansøgers
 * abonnement passer til denne form, så afsenderen ikke skal kende forskel.
 */
type PushEndpoint = {
  endpoint: string
  p256dh: string
  auth: string
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Genererer et nyt P-256-nøglepar i det format, Web Push forventer: den
 * offentlige nøgle rå (0x04 || x || y) og den private som JWK'ens
 * `d`-komponent -- begge base64url. Portet fra `_shared/vapid.ts`.
 */
async function generateVapidKeyPair() {
  const keys = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair

  const publicKey = bytesToBase64Url(
    new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
  )
  const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey)
  if (!jwk.d) throw new Error('Den genererede nøgle mangler d-komponenten')

  return { publicKey, privateKey: jwk.d }
}

/**
 * Nøgleparret til denne installation -- hentet, eller genereret og gemt.
 *
 * Rækkefølgen er den samme som i `_shared/vapid.ts`: miljøvariabler vinder,
 * derefter tabellen, og til sidst genereres et par og gemmes. Nummer tre findes,
 * fordi et miljøvariabel-trin er et manuelt dashboard-trin, og appen skal kunne
 * konfigurere sig selv ved at blive taget i brug.
 */
export const ensureVapidKeys = internalAction({
  args: {},
  handler: async (ctx): Promise<VapidDetails> => {
    const subject = process.env.VAPID_SUBJECT ?? DEFAULT_VAPID_SUBJECT
    const envPublicKey = process.env.VAPID_PUBLIC_KEY
    const envPrivateKey = process.env.VAPID_PRIVATE_KEY
    if (envPublicKey && envPrivateKey) {
      return { publicKey: envPublicKey, privateKey: envPrivateKey, subject }
    }

    const stored = await ctx.runQuery(internal.push.readVapidKeys, {})
    if (stored) return stored

    const generated = await generateVapidKeyPair()
    return await ctx.runMutation(internal.push.storeVapidKeys, {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
    })
  },
})

/**
 * Den sidste afsendelse. **Alt andet er gjort; dette er TODO'en.**
 *
 * Skal kryptere `payload` mod `target.p256dh`/`target.auth` og sende den til
 * `target.endpoint` med en VAPID-JWT signeret med `vapid.privateKey`. Se
 * filens hovedkommentar for de fire ting, der mangler.
 */
async function sendWebPush(
  target: PushEndpoint,
  payload: PushPayload,
  vapid: VapidDetails,
): Promise<PushOutcome> {
  // TODO(web-push): erstat denne krop med
  //   await webpush.sendNotification({ endpoint, keys }, JSON.stringify(payload), {
  //     vapidDetails: vapid, TTL: 3600, urgency: 'high',
  //   })
  // og oversæt en `WebPushError` med statusCode 404/410 til { isGone: true }.
  void target
  void payload
  void vapid
  throw new Error('PUSH_SENDER_NOT_IMPLEMENTED')
}

// ---------------------------------------------------------------------------
// Forløbene, der bruger afsenderen
// ---------------------------------------------------------------------------

/**
 * Sender én notifikation af en kendt type til en kreds af medlemmer.
 *
 * Kaldes af det domæne, der ejer emnet -- kalenderen for `event_created`,
 * `event_reminder` og `waitlist_promoted`, badge-moderationen for
 * `badge_nomination_review` -- efter at emnet er oprettet eller ændret. Kredsen
 * er domænets ansvar: her er den bare "hvem vil gerne have den her type", mens
 * fx ventelisten selv snævrer listen ind til dem, der reelt sidder på en plads.
 */
export const deliverPush = internalAction({
  args: {
    kind: notificationKind,
    subjectId: v.string(),
    profileIds: v.array(v.id('profiles')),
    payload: pushPayload,
  },
  handler: async (ctx, args) => {
    const prepared = await ctx.runMutation(internal.push.prepareDeliveries, {
      kind: args.kind,
      subjectId: args.subjectId,
      profileIds: args.profileIds,
    })
    if (prepared.targets.length === 0) {
      return { sent: 0, failed: 0, removed: 0, skipped: prepared.skipped }
    }

    const vapid = await ctx.runAction(internal.pushSend.ensureVapidKeys, {})

    let sent = 0
    let failed = 0
    let removed = 0
    for (const target of prepared.targets) {
      try {
        const result = await sendWebPush(target, args.payload, vapid)
        if (result.isGone) {
          removed += 1
          await ctx.runMutation(internal.push.removeSubscription, {
            subscriptionId: target.subscriptionId,
          })
        } else if (result.status >= 200 && result.status < 300) {
          sent += 1
        } else {
          failed += 1
          console.error(
            `Push (${args.kind}) afvist af tjenesten: ${result.status}`,
          )
        }
      } catch (caught) {
        failed += 1
        console.error(`Push (${args.kind}) fejlede`, caught)
      }
    }

    // Bemærk: leveringsloggen blev skrevet, før der blev sendt, så et push, der
    // fejler her, ikke forsøges igen. Det er den samme afvejning som i den
    // gamle app -- hellere en notifikation, der mangler, end den samme to gange.
    return { sent, failed, removed, skipped: prepared.skipped }
  },
})

/**
 * Sender de nyheder, der stadig mangler at blive sendt.
 *
 * Erstatter `supabase/functions/feature-announcements/index.ts`. Forskellen er,
 * at alt tilstandsarbejdet nu ligger i én mutation pr. nyhed
 * (`announcements.takeDeliveries`), så der ikke kan opstå en halv udsendelse
 * mellem fem kald. Denne action gør kun to ting: kalde afsenderen pr. enhed og
 * melde resultatet tilbage.
 */
export const deliverAnnouncements = internalAction({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.runQuery(internal.announcements.pendingPushes, {})
    if (pending.length === 0) {
      return { announcements: 0, sent: 0, failed: 0, removed: 0 }
    }

    let vapid: VapidDetails
    try {
      vapid = await ctx.runAction(internal.pushSend.ensureVapidKeys, {})
    } catch (caught) {
      console.error('Kunne ikke hente eller oprette VAPID-nøglerne', caught)
      return { announcements: 0, sent: 0, failed: 0, removed: 0 }
    }

    let announcements = 0
    let sent = 0
    let failed = 0
    let removed = 0

    for (const announcement of pending) {
      // 0/null = en anden klient nåede den først, eller nyheden faldt ud af
      // vinduet mellem opslaget og claim'en.
      const taken = await ctx.runMutation(
        internal.announcements.takeDeliveries,
        { announcementId: announcement.id },
      )
      if (!taken) continue
      announcements += 1

      const payload = announcementPayload(announcement)
      const deliveredNow: Id<'pushSubscriptions'>[] = []
      let announcementFailed = 0
      let lastError: string | null = null

      for (const target of taken.targets) {
        try {
          const result = await sendWebPush(target, payload, vapid)
          if (result.isGone) {
            removed += 1
            await ctx.runMutation(internal.push.removeSubscription, {
              subscriptionId: target.subscriptionId,
            })
          } else if (result.status >= 200 && result.status < 300) {
            sent += 1
            deliveredNow.push(target.subscriptionId)
          } else {
            announcementFailed += 1
            lastError = `Push-tjenesten svarede ${result.status}`
            console.error('Nyhedspush afvist af tjenesten', result.status)
          }
        } catch (caught) {
          announcementFailed += 1
          lastError = caught instanceof Error ? caught.message : String(caught)
          console.error('Nyhedspush fejlede', caught)
        }
      }
      failed += announcementFailed

      // De leveringer, der lykkedes, skrives ned med det samme, så et genforsøg
      // kan lade dem være. Kunne de ikke skrives ned, lukkes nyheden alligevel:
      // et genforsøg ville ikke vide, hvem der lige har fået den, og sende til
      // dem igen.
      let ledgerFailed = false
      if (deliveredNow.length > 0) {
        try {
          await ctx.runMutation(internal.announcements.recordDeliveries, {
            announcementId: announcement.id,
            subscriptionIds: deliveredNow,
          })
        } catch (caught) {
          ledgerFailed = true
          console.error('Kunne ikke skrive leveringsloggen', caught)
        }
      }

      const succeeded = announcementFailed === 0 || ledgerFailed
      await ctx.runMutation(internal.announcements.completePush, {
        announcementId: announcement.id,
        expectedAttempt: taken.attempt,
        succeeded,
        failureMessage:
          succeeded && !ledgerFailed
            ? undefined
            : `${announcementFailed} af ${taken.targets.length} notifikationer fejlede. Sidste fejl: ${lastError ?? 'ukendt'}`,
      })
    }

    return { announcements, sent, failed, removed }
  },
})

/**
 * Leverer svaret på en ansøgning om prøvemedlemskab -- til admins når den
 * kommer ind, og til ansøgerens egen enhed når den er afgjort.
 *
 * Erstatter `supabase/functions/probation-notifications/index.ts`. Den gamle
 * funktion blev kaldt af pg_net med et token; her kaldes den af den mutation,
 * der oprettede eller afgjorde ansøgningen (og af `retryNotifications`), så
 * token-fences behøves ikke længere -- `claimNotification` gør arbejdet.
 */
export const deliverProbationNotification = internalAction({
  args: {
    applicationId: v.id('probationApplications'),
    kind: v.union(v.literal('admin'), v.literal('decision')),
  },
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(
      internal.probation.claimNotification,
      { applicationId: args.applicationId, kind: args.kind },
    )
    if (!claimed) {
      return { skipped: true, sent: 0, failed: 0, removed: 0 }
    }

    const complete = async (
      succeeded: boolean,
      failureMessage: string | undefined,
    ) =>
      await ctx.runMutation(internal.probation.completeNotification, {
        applicationId: args.applicationId,
        kind: args.kind,
        expectedAttempt: claimed.attempt,
        succeeded,
        failureMessage,
      })

    let vapid: VapidDetails
    try {
      vapid = await ctx.runAction(internal.pushSend.ensureVapidKeys, {})
    } catch (caught) {
      console.error('Kunne ikke hente eller oprette VAPID-nøglerne', caught)
      await complete(false, 'VAPID-nøglerne kunne ikke hentes')
      return { skipped: false, sent: 0, failed: 0, removed: 0 }
    }

    const payload = probationPayload({
      application: claimed.application,
      kind: args.kind,
    })

    let sent = 0
    let failed = 0
    let removed = 0

    for (const target of claimed.memberTargets) {
      try {
        const result = await sendWebPush(target, payload, vapid)
        if (result.isGone) {
          removed += 1
          await ctx.runMutation(internal.push.removeSubscription, {
            subscriptionId: target.subscriptionId,
          })
        } else if (result.status >= 200 && result.status < 300) {
          sent += 1
        } else {
          failed += 1
          console.error('Probation-push afvist af tjenesten', result.status)
        }
      } catch (caught) {
        failed += 1
        console.error('Probation-push fejlede', caught)
      }
    }

    for (const target of claimed.applicantTargets) {
      try {
        const result = await sendWebPush(target, payload, vapid)
        if (result.isGone) {
          removed += 1
          await ctx.runMutation(
            internal.probation.removeProbationSubscription,
            { subscriptionId: target.subscriptionId },
          )
        } else if (result.status >= 200 && result.status < 300) {
          sent += 1
        } else {
          failed += 1
          console.error('Probation-push afvist af tjenesten', result.status)
        }
      } catch (caught) {
        failed += 1
        console.error('Probation-push fejlede', caught)
      }
    }

    if (claimed.memberTargets.length + claimed.applicantTargets.length === 0) {
      const message =
        args.kind === 'admin'
          ? 'Ingen administratorer har slået notifikationer til.'
          : 'Ansøgerens push-abonnement findes ikke længere.'
      await complete(false, message)
      return { skipped: false, sent, failed, removed }
    }

    // Admin-notifikationen er kollektiv: når mindst én aktiv admin-enhed har
    // modtaget den, er klubben varslet. At genforsøge alle enheder på grund af
    // én midlertidig fejl ville vække de vellykkede enheder igen.
    const succeeded = sent > 0
    await complete(
      succeeded,
      succeeded ? undefined : 'Push-tjenesterne modtog ikke notifikationen.',
    )
    return { skipped: false, sent, failed, removed }
  },
})
