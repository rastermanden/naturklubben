import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Typerne af push-notifikationer ud over chatten, som et medlem kan slå til og
 * fra. Præcis samme liste som `supabase/functions/_shared/pushKinds.ts` -- i
 * den gamle app var den et `check`-constraint i databasen, her er den en
 * `v.union`, så en stavefejl i et kald fejler ved indsættelsen i stedet for
 * stille at starte en ny, ufiltreret logserie.
 *
 * Næste type udvider listen her og får dermed både `notificationPreferences`
 * og `pushDeliveries` med -- der er kun ét sted at rette.
 */
export const NOTIFICATION_KINDS = [
  'event_created',
  'event_reminder',
  'badge_nomination_review',
  'waitlist_promoted',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const notificationKind = v.union(
  v.literal('event_created'),
  v.literal('event_reminder'),
  v.literal('badge_nomination_review'),
  v.literal('waitlist_promoted'),
)

/** Outbox-status for en planlagt eller igangværende levering. */
export const deliveryStatus = v.union(
  v.literal('pending'),
  v.literal('sending'),
  v.literal('sent'),
  v.literal('failed'),
  v.literal('skipped'),
)

const probationStatus = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
)

/**
 * Notifikationer ud over chatten: præferencer pr. type, leveringslog,
 * push-abonnementer og VAPID-nøglerne bag.
 *
 * Oversat fra `notification_preferences`, `push_deliveries`,
 * `push_subscriptions` og `push_vapid_keys`
 * (20260822150000_push_subscriptions.sql, 20260823120000_push_vapid_keys.sql,
 * 20260913150000_push_notification_types.sql,
 * 20260914090000_waitlist_promoted_push.sql).
 *
 * To ting fra den gamle model er bevaret med vilje:
 *
 * 1. `kind` er en union og ikke en fri streng.
 * 2. Leveringsloggen har et unikt nøglepar. Convex har ingen unikke indeks, så
 *    reglen håndhæves ved opslag+indsættelse i *samme* mutation -- Convex
 *    serialiserer mutationer, så to samtidige kald ikke begge kan se "ikke
 *    sendt". Se `claimPushDeliveries` i `convex/push.ts`.
 *
 * Referencerne hedder `profileId` og peger på `profiles`, ikke på `users`:
 * præferencer, leveringer og abonnementer hører til medlemmet, ikke til
 * login-kontoen, og i den gamle app var `user_id` netop profilen.
 */
export const notificationTables = {
  /**
   * Medlemmets valg pr. type. Ingen række betyder "ja tak" -- typerne er slået
   * til for alle, også dem der var medlem før typen fandtes, præcis som
   * `feature_notifications_enabled` har default true.
   *
   * `badge_nomination_review` sendes kun til admins; et almindeligt medlem kan
   * gemme valget, men får alligevel aldrig den type.
   */
  notificationPreferences: defineTable({
    profileId: v.id('profiles'),
    kind: notificationKind,
    enabled: v.boolean(),
    updatedAt: v.number(),
  })
    .index('by_profile_and_kind', ['profileId', 'kind'])
    .index('by_kind_and_profile', ['kind', 'profileId']),

  /**
   * Leveringsloggen: én notifikation pr. (type, emne, medlem). Emnet er
   * id'et på det, beskeden handler om -- begivenheden, indstillingen -- så en
   * planlagt kørsel, der finder den samme begivenhed igen, ikke kan sende igen.
   *
   * `subjectId` er en streng og ikke `v.id(...)`: emnet kan være en begivenhed,
   * en badge-indstilling eller noget, der først får sin tabel i et andet
   * domæne. Loggen skal kunne skrives, før den tabel findes.
   */
  pushDeliveries: defineTable({
    kind: notificationKind,
    subjectId: v.string(),
    profileId: v.id('profiles'),
    sentAt: v.number(),
  })
    .index('by_kind_and_subject_and_profile', [
      'kind',
      'subjectId',
      'profileId',
    ])
    .index('by_sent_at', ['sentAt'])
    // Bruges af kontosletningen: rækkerne hænger på medlemmet og skal væk med
    // det. Uden indekset ville sletningen være en fuld gennemlæsning.
    .index('by_profile', ['profileId']),

  /**
   * Én række pr. browser/installation, ikke pr. medlem: samme medlem kan have
   * appen på telefon og computer og skal have besked begge steder. `endpoint`
   * er push-tjenestens unikke URL for netop den installation og er derfor den
   * naturlige nøgle -- også når en telefon skifter ejer.
   */
  pushSubscriptions: defineTable({
    profileId: v.id('profiles'),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_endpoint', ['endpoint'])
    .index('by_profile', ['profileId']),

  /**
   * Klubbens VAPID-nøglepar (RFC 8292), præcis én række.
   *
   * Nøglerne ligger her og ikke kun i miljøvariabler, fordi et miljøvariabel-trin
   * er et manuelt dashboard-trin, og princippet er, at alt ud over
   * engangsopsætningen skal kunne ske ved at skrive kode. `key` er en fast
   * literal, så singleton-rækken kan slås op på et indeks, og et kapløb mellem
   * to kald, der begge genererer et nøglepar, afgøres ved at læse vinderens
   * række bagefter (se `storeVapidKeys` i `convex/push.ts`).
   */
  pushVapidKeys: defineTable({
    key: v.literal('vapid'),
    publicKey: v.string(),
    privateKey: v.string(),
    subject: v.string(),
    createdAt: v.number(),
  }).index('by_key', ['key']),

  /**
   * Nyheder om nye funktioner. Rækkerne skrives af koden (`ANNOUNCEMENTS` i
   * `convex/announcements.ts`), ikke af et panel -- så følger beskeden med
   * deployet, præcis som den gamle app lagde rækken i den migration, funktionen
   * alligevel havde.
   *
   * Outbox-felterne (`pushStatus`, `pushAttempts`, ...) er driftsdata og deles
   * ikke med medlemmerne; det gør `list` i `convex/announcements.ts` ved kun at
   * returnere de felter, siden skal vise.
   */
  featureAnnouncements: defineTable({
    slug: v.string(),
    title: v.string(),
    body: v.string(),
    path: v.optional(v.string()),
    releasedAt: v.number(),
    createdAt: v.number(),
    pushStatus: deliveryStatus,
    pushAttempts: v.number(),
    pushStartedAt: v.optional(v.number()),
    pushSentAt: v.optional(v.number()),
    pushError: v.optional(v.string()),
  })
    .index('by_slug', ['slug'])
    .index('by_released_at', ['releasedAt'])
    .index('by_push_status', ['pushStatus']),

  /**
   * Hvad det enkelte medlem har set. Ligger i sin egen tabel frem for som et
   * felt på nyheden, fordi den er personlig: to medlemmer læser den samme nyhed
   * på hvert sit tidspunkt.
   */
  featureAnnouncementReads: defineTable({
    announcementId: v.id('featureAnnouncements'),
    profileId: v.id('profiles'),
    readAt: v.number(),
  })
    .index('by_announcement_and_profile', ['announcementId', 'profileId'])
    .index('by_profile', ['profileId']),

  /**
   * Leveringslog for nyheder, pr. *abonnement* og ikke pr. medlem (modsat
   * `pushDeliveries`): har man både telefon og computer, skal et genforsøg
   * kunne nå den ene enhed uden at vække den anden igen -- se
   * 20260830090000_feature_announcement_push_deliveries.sql.
   */
  featureAnnouncementPushDeliveries: defineTable({
    announcementId: v.id('featureAnnouncements'),
    subscriptionId: v.id('pushSubscriptions'),
    deliveredAt: v.number(),
  })
    .index('by_announcement_and_subscription', [
      'announcementId',
      'subscriptionId',
    ])
    .index('by_announcement', ['announcementId'])
    // Convex har ingen `on delete cascade`: forsvinder abonnementet, skal dets
    // leveringer ryddes eksplicit (se `deleteAccount` i `convex/account.ts`).
    .index('by_subscription', ['subscriptionId']),

  /**
   * Ansøgninger om prøvemedlemskab (#7-flow: hvem må oprette en bruger).
   * Ansøgeren er ikke logget ind, så rækken ejes ikke af en profil.
   *
   * Notifikationsfelterne er en lille, holdbar outbox, præcis som i
   * 20260823133000_probation_notifications.sql: ansøgningen og dens
   * leveringsstatus skrives i samme mutation, og selve afsendelsen sker
   * bagefter. En leveringsfejl ændrer derfor aldrig ansøgningens
   * pending/approved/rejected-status.
   */
  probationApplications: defineTable({
    fullName: v.string(),
    email: v.string(),
    motivation: v.string(),
    status: probationStatus,
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id('profiles')),
    /** Hemmeligt token, der beviser at kalderen ejer ansøgningen. */
    notificationToken: v.string(),
    adminNotificationStatus: deliveryStatus,
    adminNotificationAttempts: v.number(),
    adminNotificationStartedAt: v.optional(v.number()),
    adminNotificationSentAt: v.optional(v.number()),
    adminNotificationError: v.optional(v.string()),
    decisionNotificationStatus: v.optional(deliveryStatus),
    decisionNotificationAttempts: v.number(),
    decisionNotificationStartedAt: v.optional(v.number()),
    decisionNotificationSentAt: v.optional(v.number()),
    decisionNotificationError: v.optional(v.string()),
  })
    .index('by_email', ['email'])
    .index('by_email_and_status', ['email', 'status'])
    .index('by_status', ['status'])
    .index('by_created_at', ['createdAt'])
    .index('by_reviewed_at', ['reviewedAt']),

  /**
   * Ét push-abonnement følger ansøgningen frem til afgørelsen. Uden det kan
   * ansøgeren ikke få svaret, og rækken kan derfor ikke erstattes af et
   * medlemsabonnement -- der findes ingen profil endnu.
   *
   * Endpointet valideres mod push-tjenesternes værtsnavne i
   * `convex/probation.ts`, før det gemmes.
   */
  probationPushSubscriptions: defineTable({
    applicationId: v.id('probationApplications'),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  })
    .index('by_application', ['applicationId'])
    .index('by_endpoint', ['endpoint']),

  /**
   * Rate limiting af den offentlige ansøgningsformular.
   *
   * Erstatter `private.probation_submission_attempts`
   * (20260823161500_probation_application_rate_limits.sql). Rå IP-adresser og
   * e-mailadresser optræder aldrig her: `httpAction`'en HMAC-hasher hvert
   * signal, før det når en mutation. Tabellen er intern -- der er ingen
   * offentlig funktion, der læser den.
   */
  probationSubmissionAttempts: defineTable({
    ipHash: v.string(),
    networkHash: v.string(),
    emailHash: v.string(),
    attemptedAt: v.number(),
  })
    .index('by_ip_and_time', ['ipHash', 'attemptedAt'])
    .index('by_network_and_time', ['networkHash', 'attemptedAt'])
    .index('by_email_and_time', ['emailHash', 'attemptedAt'])
    .index('by_attempted_at', ['attemptedAt']),

  /**
   * Status for påmindelsen dagen før, én række pr. begivenhed -- samme outbox
   * som ansøgningernes, se `enqueue_event_reminders` i
   * 20260913150000_push_notification_types.sql.
   *
   * `eventId` er en streng og ikke `v.id('events')`, fordi kalenderdomænet ikke
   * er portet endnu; når det er, skal feltet strammes til `v.id('events')` i
   * samme migration, som flytter rækkerne.
   */
  /**
   * Påmindelses-kørslen bor i `convex/tables/calendar.ts` sammen med `events`,
   * fordi den har én række pr. begivenhed og slettes sammen med den. Der er
   * bevidst ikke en kopi her: to definitioner af samme tabel ville få
   * `defineSchema` til at kaste ved deploy.
   */
}
