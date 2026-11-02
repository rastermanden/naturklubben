import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Kalenderdomænet: aktiviteter, begivenheder, tilmeldinger, venteliste, gæster,
 * opgaver og påmindelser.
 *
 * Oversat fra Postgres-tabellerne med samme navn (se `supabase/migrations/`).
 * Feltnavnene er camelCase, fordi Convex-dokumenter er JavaScript-objekter hele
 * vejen igennem. Det, der i Postgres var `check`-constraints og partielle unikke
 * indekser, findes ikke i Convex: de håndhæves i mutationerne i
 * `convex/calendar.ts`, og der står en kommentar dér ved hver af dem.
 */

/** Et svar på en begivenhed. Samme tre værdier som den gamle `status`-kolonne. */
const attendanceStatus = v.union(
  v.literal('attending'),
  v.literal('waitlisted'),
  v.literal('declined'),
)

export const calendarTables = {
  /**
   * Klubbens aktiviteter. Offentligt indhold: den gamle app lod `anon` læse
   * tabellen, fordi aktiviteterne vises uden login på aktivitetssiden.
   */
  activities: defineTable({
    title: v.string(),
    description: v.string(),
    /** Ikonnavn fra `src/features/activities/activityIcons.ts`. */
    icon: v.optional(v.string()),
    sortOrder: v.number(),
    /** Et link giver kun mening sammen med en tekst -- se `activityInput`. */
    linkUrl: v.optional(v.string()),
    linkLabel: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_sort_order', ['sortOrder']),

  /**
   * Kalenderbegivenheder.
   *
   * `endsAt` er `endAt ?? startAt` og findes som felt, fordi Convex ikke kan
   * filtrere på `endAt ?? startAt` gennem et indeks. Uden feltet ville
   * "begivenheder der ikke er forbi" kræve en fuld gennemlæsning af tabellen,
   * og `by_end`-indekset kunne ikke svare på det. Feltet sættes i samme
   * mutation som `startAt`/`endAt` (se `eventFields` i `convex/calendar.ts`).
   *
   * Tællingerne (`attendingCount`, `waitlistedCount`, `approvedGuestCount`)
   * findes af samme grund: Convex har ingen `count(*)`, så en optælling, der
   * vises i listen, vedligeholdes som felt i den mutation, der ændrer den.
   */
  events: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.optional(v.number()),
    endsAt: v.number(),
    /**
     * Arrangøren. Valgfri, fordi en begivenhed er klubbens historik og bliver
     * stående, når arrangøren sletter sin konto -- se `deleteAccount` i
     * `convex/account.ts`. I den gamle app blev kolonnen `on delete set null`
     * (20260823170000_account_deletion.sql), og den regel er den samme her.
     * Er feltet tomt, kan kun en administrator slette begivenheden.
     */
    createdBy: v.optional(v.id('profiles')),
    /** Åben for ikke-medlemmer: vises på den offentlige kalender. */
    isPublic: v.boolean(),
    /** Pladsloft; udeladt er ubegrænset. */
    maxParticipants: v.optional(v.number()),
    attendingCount: v.number(),
    waitlistedCount: v.number(),
    /** Summen af `partySize` for godkendte gæsteansøgninger, ikke antal rækker. */
    approvedGuestCount: v.number(),
    createdAt: v.number(),
  })
    .index('by_end', ['endsAt'])
    .index('by_public_end', ['isPublic', 'endsAt'])
    // Ikke brugt af kalenderens egne queries: den bruges, når en konto slettes
    // og medlemmets rækker skal findes (`convex/account.ts`).
    .index('by_creator', ['createdBy']),

  /**
   * Medlemmernes svar på en begivenhed: tilmeldt, på venteliste eller afbud.
   * Den gamle app havde `(event_id, user_id)` som primærnøgle; her er det
   * `by_event_profile`, og mutationen slår op igennem det, før den indsætter,
   * så et medlem ikke kan få to rækker.
   *
   * `queuedAt` er tilmeldingsrækkefølgen, og `waitlistPosition` er den
   * placering, listen viser (1 er forrest). Placeringen kunne regnes ud af
   * `queuedAt` ved hver visning, men står som felt, fordi den skal kunne vises
   * uden at læse alle tilmeldinger -- og fordi den så opdateres i samme
   * mutation som den ændring, der flyttede nogen.
   */
  eventAttendance: defineTable({
    eventId: v.id('events'),
    profileId: v.id('profiles'),
    status: attendanceStatus,
    /** Svar-tidspunktet, som ventelisten sorteres efter. */
    queuedAt: v.number(),
    /** Kun sat mens svaret er 'waitlisted'. */
    waitlistPosition: v.optional(v.number()),
  })
    .index('by_event', ['eventId'])
    .index('by_event_profile', ['eventId', 'profileId'])
    .index('by_event_status_queued', ['eventId', 'status', 'queuedAt'])
    // Til kontosletning: find alle svar, et medlem har afgivet.
    .index('by_profile', ['profileId']),

  /**
   * Opgaveliste pr. begivenhed. Alle medlemmer må oprette og melde sig til en
   * ledig opgave; kun opretteren må slette den. Det håndhæves i mutationerne.
   */
  eventTasks: defineTable({
    eventId: v.id('events'),
    title: v.string(),
    assignedTo: v.optional(v.id('profiles')),
    createdBy: v.id('profiles'),
    createdAt: v.number(),
  })
    .index('by_event', ['eventId'])
    .index('by_event_created', ['eventId', 'createdAt']),

  /**
   * Kørslen af påmindelsen dagen før en begivenhed -- i den gamle app en outbox,
   * som pg_cron/pg_net brugte. Ingen klientfunktion læser den; den hører til
   * push-domænet, men bor her, fordi den har en række pr. begivenhed og slettes
   * sammen med den.
   */
  eventReminders: defineTable({
    eventId: v.id('events'),
    /** Kørslens token; afsendelsen legitimerer sig med det. */
    token: v.string(),
    status: v.union(
      v.literal('sending'),
      v.literal('sent'),
      v.literal('failed'),
    ),
    attempts: v.number(),
    startedAt: v.number(),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index('by_event', ['eventId']),

  /**
   * Ansøgninger fra ikke-medlemmer om at deltage i en offentlig begivenhed.
   * Kun arrangøren og admins må læse dem; alle medlemmer ser kun tallet på
   * begivenheden (`events.approvedGuestCount`).
   *
   * Den gamle app havde et partielt unikt indeks: én åben ansøgning (pending
   * eller approved) pr. e-mail pr. begivenhed. Convex har ikke partielle
   * indekser, så reglen håndhæves i `createGuestRequest` med opslag i
   * `by_event_email`.
   *
   * Outbox-felterne til svar-e-mail er bevidst ikke portet: svaret skrives af
   * arrangøren selv fra sin egen mailklient (#239), så der er intet at sende
   * automatisk og ingen leveringsstatus at vise.
   */
  eventGuestRequests: defineTable({
    eventId: v.id('events'),
    fullName: v.string(),
    /** Normaliseret: trimmet og små bogstaver (den gamle brugte `citext`). */
    email: v.string(),
    message: v.optional(v.string()),
    partySize: v.number(),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
    ),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id('profiles')),
  })
    .index('by_event', ['eventId'])
    .index('by_event_email', ['eventId', 'email'])
    .index('by_event_status', ['eventId', 'status']),

  /**
   * Rate limit for den offentlige gæsteformular -- den gamle apps
   * `private.event_guest_request_attempts`.
   *
   * Tabellen er intern: ingen query læser den, og den skrives kun af
   * `createGuestRequest`, som kaldes fra en `httpAction`. Derfor kan IP-adressen
   * bruges som nøgle uden at blive klientdata -- den hash'es i HTTP-laget og
   * forlader det aldrig som rå værdi. Prøvemedlemskabets `network_hash` er ikke
   * portet: den kom fra en Cloudflare-header, som Convex' HTTP-lag ikke stiller
   * til rådighed, og et gæt ville være et svagere signal end ingen.
   */
  eventGuestRequestAttempts: defineTable({
    /** SHA-256 som hex; aldrig den rå adresse. */
    ipHash: v.string(),
    /** SHA-256 af den normaliserede e-mail. */
    emailHash: v.string(),
    attemptedAt: v.number(),
  })
    .index('by_ip_time', ['ipHash', 'attemptedAt'])
    .index('by_email_time', ['emailHash', 'attemptedAt'])
    .index('by_time', ['attemptedAt']),
}
