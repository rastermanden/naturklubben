import { ConvexError, v } from 'convex/values'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireAdmin, requireProfile, requireWritableProfile } from './authz'

/**
 * Kalenderen: aktiviteter, begivenheder, tilmeldinger med venteliste, opgaver,
 * gæsteansøgninger og den offentlige kalender.
 *
 * Port af `respond_to_event`, `promote_event_waitlist`, `event_tasks`-politikkerne
 * og `submit_event_guest_request_limited` fra den gamle Supabase-app. Reglerne
 * er de samme; virkemidlerne er ikke:
 *
 * - Der er ingen advisory locks. Convex kører en mutation som én serialiserbar
 *   transaktion, så to samtidige afbud kan ikke begge give den samme plads væk,
 *   og en optælling og den skrivning, den bygger på, kan ikke skilles ad.
 * - Der er ingen `count(*)`. Tællingerne på `events` vedligeholdes i den
 *   mutation, der ændrer dem (`syncEventCounts`, `syncGuestCount`).
 * - Der er ingen `on delete cascade`. `deleteEvent` sletter selv det, der hører
 *   til begivenheden.
 * - Der er ingen RLS. Hver eksporteret funktion herunder kalder
 *   `requireProfile`, `requireWritableProfile` eller `requireAdmin`, medmindre
 *   den bærer en kommentar om, hvorfor den er offentlig.
 */

const QUARTER = 15 * 60 * 1000
const HOUR = 60 * 60 * 1000

/** Fejlkoder i stedet for danske sætninger: klienten oversætter dem. */
type EventInput = {
  title: string
  description: string | null
  location: string | null
  startAt: number
  endAt: number | null
  isPublic: boolean
  maxParticipants: number | null
}

/** Felterne, både `createEvent` og `updateEvent` tager imod. */
const eventInputArgs = {
  title: v.string(),
  description: v.union(v.string(), v.null()),
  location: v.union(v.string(), v.null()),
  startAt: v.number(),
  endAt: v.union(v.number(), v.null()),
  isPublic: v.boolean(),
  maxParticipants: v.union(v.number(), v.null()),
}

/**
 * Oversætter formularens input til dokumentfelter og håndhæver de constraints,
 * Postgres havde (`events_end_after_start`, `events_max_participants_positive`
 * og titlens længde). Convex har ingen `check`-constraints, så det sker her --
 * og kun her, fordi alle skrivninger går gennem de to mutationer.
 */
function normalizeEventInput(input: EventInput) {
  const title = input.title.trim()
  if (title.length === 0 || title.length > 120) {
    throw new ConvexError('EVENT_TITLE_INVALID')
  }

  const description = input.description?.trim()
  const location = input.location?.trim()

  if (!Number.isFinite(input.startAt)) {
    throw new ConvexError('EVENT_START_INVALID')
  }
  if (input.endAt !== null && !Number.isFinite(input.endAt)) {
    throw new ConvexError('EVENT_END_INVALID')
  }
  if (input.endAt !== null && input.endAt < input.startAt) {
    throw new ConvexError('EVENT_ENDS_BEFORE_START')
  }

  if (
    input.maxParticipants !== null &&
    (!Number.isInteger(input.maxParticipants) || input.maxParticipants < 1)
  ) {
    throw new ConvexError('EVENT_CAP_INVALID')
  }

  return {
    title,
    description: description ? description : undefined,
    location: location ? location : undefined,
    startAt: input.startAt,
    endAt: input.endAt === null ? undefined : input.endAt,
    // Regnet felt: se kommentaren på `events` i `tables/calendar.ts`.
    endsAt: input.endAt === null ? input.startAt : input.endAt,
    isPublic: input.isPublic,
    maxParticipants:
      input.maxParticipants === null ? undefined : input.maxParticipants,
  }
}

/** Har medlemmet ret til at rette begivenheden? Arrangøren eller en admin. */
function canManageEvent(profile: Doc<'profiles'>, event: Doc<'events'>) {
  // `createdBy` er valgfrit: en slettet konto efterlader begivenheden uden
  // arrangør, og så er det kun en administrator, der kan rette den.
  return event.createdBy === profile._id || profile.isAdmin
}

/** Ventelistens rækkefølge: først til mølle, med profil-id som fast bryder. */
function byQueue(
  left: Doc<'eventAttendance'>,
  right: Doc<'eventAttendance'>,
) {
  if (left.queuedAt !== right.queuedAt) return left.queuedAt - right.queuedAt
  return left.profileId < right.profileId
    ? -1
    : left.profileId > right.profileId
      ? 1
      : 0
}

async function attendanceRows(ctx: QueryCtx, eventId: Id<'events'>) {
  return await ctx.db
    .query('eventAttendance')
    .withIndex('by_event', (q) => q.eq('eventId', eventId))
    .collect()
}

async function waitlistRows(ctx: QueryCtx, eventId: Id<'events'>) {
  return (
    await ctx.db
      .query('eventAttendance')
      .withIndex('by_event_status_queued', (q) =>
        q.eq('eventId', eventId).eq('status', 'waitlisted'),
      )
      .collect()
  ).sort(byQueue)
}

/**
 * Fylder de ledige pladser med de forreste på ventelisten og returnerer dem, der
 * rykkede op, i rækkefølge. Port af `promote_event_waitlist_locked`.
 *
 * Uden loft er der plads til hele ventelisten (den kan kun være ikke-tom, hvis
 * loftet netop er fjernet). Kaldes både når nogen melder afbud, når en ny
 * tilmelding lander, og når arrangøren hæver loftet -- sidstnævnte i samme
 * mutation som rettelsen, så en hævet grænse og en oprykning ikke kan skilles ad.
 */
async function promoteWaitlist(
  ctx: MutationCtx,
  eventId: Id<'events'>,
  maxParticipants: number | undefined,
): Promise<Id<'profiles'>[]> {
  const attending = (
    await ctx.db
      .query('eventAttendance')
      .withIndex('by_event_status_queued', (q) =>
        q.eq('eventId', eventId).eq('status', 'attending'),
      )
      .collect()
  ).length

  const waiting = await waitlistRows(ctx, eventId)
  const freeSeats =
    maxParticipants === undefined
      ? waiting.length
      : Math.max(maxParticipants - attending, 0)

  const promoted = waiting.slice(0, freeSeats)
  for (const row of promoted) {
    // Pladsen gives væk her; `queuedAt` beholder sin værdi, så rækkefølgen
    // blandt de øvrige i køen ikke ændrer sig.
    await ctx.db.patch(row._id, {
      status: 'attending',
      waitlistPosition: undefined,
    })
  }

  return promoted.map((row) => row.profileId)
}

/**
 * Retter tællingerne på begivenheden og ventelistens placeringer, så de altid
 * passer med rækkerne. Kaldes i slutningen af enhver mutation, der har rørt
 * tilmeldinger -- det er den eneste måde, Convex kan svare på "hvor mange er
 * der?" uden at læse alle rækker ved hver visning.
 */
async function syncEventCounts(ctx: MutationCtx, eventId: Id<'events'>) {
  const event = await ctx.db.get(eventId)
  if (event === null) return

  const rows = await attendanceRows(ctx, eventId)
  const attending = rows.filter((row) => row.status === 'attending').length
  const waiting = rows.filter((row) => row.status === 'waitlisted').sort(byQueue)

  for (const [index, row] of waiting.entries()) {
    if (row.waitlistPosition !== index + 1) {
      await ctx.db.patch(row._id, { waitlistPosition: index + 1 })
    }
  }
  for (const row of rows) {
    if (row.status !== 'waitlisted' && row.waitlistPosition !== undefined) {
      await ctx.db.patch(row._id, { waitlistPosition: undefined })
    }
  }

  if (
    event.attendingCount !== attending ||
    event.waitlistedCount !== waiting.length
  ) {
    await ctx.db.patch(eventId, {
      attendingCount: attending,
      waitlistedCount: waiting.length,
    })
  }
}

/** Antal godkendte gæster er summen af `partySize`, ikke antal ansøgninger. */
async function syncGuestCount(ctx: MutationCtx, eventId: Id<'events'>) {
  const approved = await ctx.db
    .query('eventGuestRequests')
    .withIndex('by_event_status', (q) =>
      q.eq('eventId', eventId).eq('status', 'approved'),
    )
    .collect()

  await ctx.db.patch(eventId, {
    approvedGuestCount: approved.reduce((sum, row) => sum + row.partySize, 0),
  })
}

/** Har en ændring af loftet gjort plads til flere? Port af `capRaised`. */
function capRaised(previous: number | undefined, next: number | undefined) {
  if (next === undefined) return previous !== undefined
  return previous !== undefined && next > previous
}

/** Begivenheden som klienten ser den. Ingen `_id`/`_creationTime` ud. */
function toEventSummary(event: Doc<'events'>) {
  return {
    id: event._id,
    title: event.title,
    description: event.description ?? null,
    location: event.location ?? null,
    startAt: event.startAt,
    endAt: event.endAt ?? null,
    // `null` og ikke `undefined`: klienten kender ikke forskellen, og en
    // begivenhed uden arrangør (efter en kontosletning) skal vises som det.
    createdBy: event.createdBy ?? null,
    isPublic: event.isPublic,
    maxParticipants: event.maxParticipants ?? null,
    attendingCount: event.attendingCount,
    waitlistedCount: event.waitlistedCount,
    approvedGuestCount: event.approvedGuestCount,
  }
}

/** Begivenheden, eller en fejl hvis den ikke findes. */
async function requireEvent(ctx: QueryCtx, eventId: Id<'events'>) {
  const event = await ctx.db.get(eventId)
  if (event === null) throw new ConvexError('EVENT_NOT_FOUND')
  return event
}

// ---------------------------------------------------------------------------
// Aktiviteter
// ---------------------------------------------------------------------------

/**
 * Aktiviteterne. **Offentlig med vilje:** den gamle app lod `anon` læse
 * `activities`, fordi listen vises på den offentlige aktivitetsside uden login.
 * Der er ingen medlemsdata i tabellen -- kun klubbens eget præsentationsindhold.
 */
export const activities = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('activities')
      .withIndex('by_sort_order')
      .take(args.limit ?? 200)

    return rows.map((activity) => ({
      id: activity._id,
      title: activity.title,
      description: activity.description,
      icon: activity.icon ?? null,
      sortOrder: activity.sortOrder,
      linkUrl: activity.linkUrl ?? null,
      linkLabel: activity.linkLabel ?? null,
    }))
  },
})

const activityInputArgs = {
  title: v.string(),
  description: v.string(),
  icon: v.union(v.string(), v.null()),
  linkUrl: v.union(v.string(), v.null()),
  linkLabel: v.union(v.string(), v.null()),
}

/**
 * Håndhæver `activities_link_complete` fra den gamle migration: et link skal
 * have både adresse og tekst -- eller ingen af delene.
 */
function normalizeActivityInput(input: {
  title: string
  description: string
  icon: string | null
  linkUrl: string | null
  linkLabel: string | null
}) {
  const title = input.title.trim()
  const description = input.description.trim()
  if (title.length === 0 || description.length === 0) {
    throw new ConvexError('ACTIVITY_FIELDS_REQUIRED')
  }

  const linkUrl = input.linkUrl?.trim() || undefined
  const linkLabel = input.linkLabel?.trim() || undefined
  if ((linkUrl === undefined) !== (linkLabel === undefined)) {
    throw new ConvexError('ACTIVITY_LINK_INCOMPLETE')
  }
  if (linkUrl !== undefined && !/^https?:\/\//i.test(linkUrl)) {
    throw new ConvexError('ACTIVITY_LINK_INVALID')
  }

  return {
    title,
    description,
    icon: input.icon ?? undefined,
    linkUrl,
    linkLabel,
  }
}

/** Kun admins rører aktiviteterne -- samme regel som den gamle policy. */
export const createActivity = mutation({
  args: { ...activityInputArgs, sortOrder: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const fields = normalizeActivityInput(args)

    let sortOrder = args.sortOrder
    if (sortOrder === undefined) {
      // Nederst: højeste nummer + 1, ikke antallet -- der kan være huller
      // efter en sletning.
      const existing = await ctx.db.query('activities').collect()
      sortOrder =
        existing.reduce(
          (highest, activity) => Math.max(highest, activity.sortOrder),
          0,
        ) + 1
    }

    return await ctx.db.insert('activities', {
      ...fields,
      sortOrder,
      createdAt: Date.now(),
    })
  },
})

export const updateActivity = mutation({
  args: { activityId: v.id('activities'), ...activityInputArgs },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const activity = await ctx.db.get(args.activityId)
    if (activity === null) throw new ConvexError('ACTIVITY_NOT_FOUND')
    await ctx.db.patch(activity._id, normalizeActivityInput(args))
    return null
  },
})

export const deleteActivity = mutation({
  args: { activityId: v.id('activities') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const activity = await ctx.db.get(args.activityId)
    if (activity === null) throw new ConvexError('ACTIVITY_NOT_FOUND')
    await ctx.db.delete(activity._id)
    return null
  },
})

/**
 * Gemmer en ny rækkefølge. Kun de rækker, hvis nummer faktisk ændrer sig,
 * skrives -- samme valg som i den gamle app, så en samtidig rettelse af
 * teksten ikke overskrives.
 */
export const reorderActivities = mutation({
  args: {
    rows: v.array(
      v.object({
        activityId: v.id('activities'),
        sortOrder: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    for (const row of args.rows) {
      const activity = await ctx.db.get(row.activityId)
      if (activity === null) continue
      if (activity.sortOrder !== row.sortOrder) {
        await ctx.db.patch(activity._id, { sortOrder: row.sortOrder })
      }
    }
    return null
  },
})

// ---------------------------------------------------------------------------
// Begivenheder: læsning
// ---------------------------------------------------------------------------

/**
 * `dayStart` er klientens lokale midnat i ms. Grænsen mellem kommende og
 * forbi er lokal tid, og Convex' funktioner kører i UTC -- derfor sendes den
 * med fra browseren. Den styrer kun, hvad der vises, aldrig hvad der må skrives.
 */

/** Kommende begivenheder -- også en flerdagstur, der er i gang (#259). */
export const upcomingEvents = query({
  args: { dayStart: v.number() },
  handler: async (ctx, args) => {
    await requireProfile(ctx)

    const rows = await ctx.db
      .query('events')
      .withIndex('by_end', (q) => q.gte('endsAt', args.dayStart))
      .take(500)

    return rows
      .sort((a, b) => a.startAt - b.startAt || a._id.localeCompare(b._id))
      .map(toEventSummary)
  },
})

/** Afholdte begivenheder, nyeste først. */
export const pastEvents = query({
  args: { dayStart: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireProfile(ctx)

    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
    const rows = await ctx.db
      .query('events')
      .withIndex('by_end', (q) => q.lt('endsAt', args.dayStart))
      .order('desc')
      .take(limit)

    return rows.map(toEventSummary)
  },
})

/**
 * Begivenhederne, der optager en dag i [from, to) -- til månedsvisningen, når
 * man bladrer tilbage. Samme regel som `upcomingEvents`: en flerdagstur, der
 * startede før måneden og varer ind i den, er med.
 */
export const monthEvents = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    await requireProfile(ctx)

    const rows = await ctx.db
      .query('events')
      .withIndex('by_end', (q) => q.gte('endsAt', args.from))
      .take(500)

    return rows
      .filter((event) => event.startAt < args.to)
      .sort((a, b) => a.startAt - b.startAt)
      .map(toEventSummary)
  },
})

/** Én begivenhed med medlemmets eget svar og dets rettigheder. */
export const event = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    // `null` frem for en fejl: et link fra en notifikation kan pege på en
    // begivenhed, der er slettet, og så skal siden kunne sige det.
    const event = await ctx.db.get(args.eventId)
    if (event === null) return null
    const mine = await ctx.db
      .query('eventAttendance')
      .withIndex('by_event_profile', (q) =>
        q.eq('eventId', args.eventId).eq('profileId', profile._id),
      )
      .unique()

    return {
      ...toEventSummary(event),
      isOrganiser: event.createdBy === profile._id,
      canEdit: canManageEvent(profile, event),
      // Samme regel som `deleteEvent` håndhæver: arrangøren eller en admin.
      // Admin-retten er ikke ny -- den kom med
      // 20260823170000_account_deletion.sql, fordi en begivenhed uden arrangør
      // ellers aldrig kunne slettes af nogen.
      canDelete: profile.isAdmin || event.createdBy === profile._id,
      myStatus: mine?.status ?? null,
      myWaitlistPosition: mine?.waitlistPosition ?? null,
    }
  },
})

/**
 * Deltagerlisten. Et afbud er kun mellem den, der meldte det, og dem, der
 * planlægger turen: arrangøren og admins. Alle andre ser hvem der kommer, og
 * hvem der står i kø -- ikke hvem der har meldt fra.
 *
 * Navnene slås op her og ikke i klienten, så kalenderen ikke skal kende
 * medlemsdomænets hooks.
 */
export const attendance = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const event = await requireEvent(ctx, args.eventId)
    const canManage = canManageEvent(profile, event)

    const rows = await attendanceRows(ctx, args.eventId)
    const visible = rows.filter(
      (row) =>
        row.status !== 'declined' ||
        canManage ||
        row.profileId === profile._id,
    )

    const rank = { attending: 0, waitlisted: 1, declined: 2 }
    const entries: Array<{
      profileId: Id<'profiles'>
      name: string
      avatarUrl: string | null
      chatColor: string
      isMe: boolean
      status: 'attending' | 'waitlisted' | 'declined'
      queuedAt: number
      waitlistPosition: number | null
    }> = []
    for (const row of visible) {
      const member = await ctx.db.get(row.profileId)
      entries.push({
        profileId: row.profileId,
        name: member?.fullName ?? 'Medlem',
        avatarUrl: member?.avatarUrl ?? null,
        chatColor: member?.chatColor ?? '#16a34a',
        // Så klienten kan vise "(dig)" uden at kende medlemsdomænets hooks.
        isMe: row.profileId === profile._id,
        status: row.status,
        queuedAt: row.queuedAt,
        waitlistPosition: row.waitlistPosition ?? null,
      })
    }

    entries.sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        a.queuedAt - b.queuedAt ||
        a.profileId.localeCompare(b.profileId),
    )

    return {
      entries,
      canManage,
      maxParticipants: event.maxParticipants ?? null,
    }
  },
})

/**
 * Medlemmerne uden svar. Arrangørens og admins' arbejdsredskab til at minde
 * folk om at svare -- hvem der *ikke* har svaret, er ikke et emne for hele
 * klubben. Kalderen selv udelades.
 */
export const membersWithoutResponse = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const event = await requireEvent(ctx, args.eventId)
    if (!canManageEvent(profile, event)) {
      throw new ConvexError('NOT_EVENT_MANAGER')
    }

    const answered = new Set(
      (await attendanceRows(ctx, args.eventId)).map((row) => row.profileId),
    )
    const members = await ctx.db.query('profiles').collect()

    return members
      .filter(
        (member) => member._id !== profile._id && !answered.has(member._id),
      )
      .map((member) => ({
        profileId: member._id,
        name: member.fullName ?? 'Medlem',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'da'))
  },
})

/** Opgavelisten på en begivenhed. Alle medlemmer må se den. */
export const tasks = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    await requireEvent(ctx, args.eventId)

    const rows = await ctx.db
      .query('eventTasks')
      .withIndex('by_event_created', (q) => q.eq('eventId', args.eventId))
      .collect()

    const entries = []
    for (const task of rows) {
      const assignee =
        task.assignedTo === undefined
          ? null
          : await ctx.db.get(task.assignedTo)
      entries.push({
        id: task._id,
        eventId: task.eventId,
        title: task.title,
        assignedTo: task.assignedTo ?? null,
        // Navnet slås op her, så opgavelisten ikke skal kende medlemsdomænet.
        assignedToName: assignee?.fullName ?? null,
        // Knapperne i klienten vises ud fra de to flag, ikke ud fra id'er den
        // ikke kender.
        assignedToMe: task.assignedTo === profile._id,
        createdByMe: task.createdBy === profile._id,
        createdAt: task.createdAt,
      })
    }
    return entries
  },
})

/**
 * Gæsteansøgningerne på en begivenhed. Kun arrangøren og admins -- og kun dem
 * ser e-mailadresserne. Resten af klubben ser tallet på begivenheden.
 */
export const guestRequests = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const event = await requireEvent(ctx, args.eventId)
    if (!canManageEvent(profile, event)) {
      throw new ConvexError('NOT_EVENT_MANAGER')
    }

    const rows = await ctx.db
      .query('eventGuestRequests')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()

    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((request) => ({
        id: request._id,
        eventId: request.eventId,
        fullName: request.fullName,
        email: request.email,
        message: request.message ?? null,
        partySize: request.partySize,
        status: request.status,
        createdAt: request.createdAt,
        reviewedAt: request.reviewedAt ?? null,
      }))
  },
})

/**
 * Den offentlige kalender. **Offentlig med vilje:** siden findes for folk uden
 * login, og den gamle app gav `anon` læseadgang gennem viewet `public_events`.
 *
 * Kun felterne fra det view kommer ud: titel, beskrivelse, sted og tid -- intet
 * om arrangøren, intet oprettelsestidspunkt og ingen medlemsdata. Private
 * begivenheder er slet ikke med.
 */
export const publicEvents = query({
  args: { dayStart: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('events')
      .withIndex('by_public_end', (q) =>
        q.eq('isPublic', true).gte('endsAt', args.dayStart),
      )
      .take(200)

    return rows.sort((a, b) => a.startAt - b.startAt).map((event) => ({
      id: event._id,
      title: event.title,
      description: event.description ?? null,
      location: event.location ?? null,
      startAt: event.startAt,
      endAt: event.endAt ?? null,
    }))
  },
})

/**
 * iCal-feedets data. `internalQuery`, fordi den kun kaldes af
 * `calendarFeed.registerCalendarFeedRoutes` gennem en `httpAction`: den må ikke
 * kunne kaldes som en almindelig offentlig query med udvidede felter.
 *
 * Felterne er de samme som det gamle view `calendar_feed_events` gav fra sig:
 * titel, sted og tid -- aldrig beskrivelsen.
 */
export const feedEvents = internalQuery({
  args: {},
  handler: async (ctx) => {
    const startOfToday = new Date()
    startOfToday.setUTCHours(0, 0, 0, 0)

    const rows = await ctx.db
      .query('events')
      .withIndex('by_public_end', (q) =>
        q.eq('isPublic', true).gte('endsAt', startOfToday.getTime()),
      )
      .take(500)

    return rows.sort((a, b) => a.startAt - b.startAt).map((event) => ({
      id: event._id as string,
      title: event.title,
      location: event.location ?? null,
      startAt: event.startAt,
      endAt: event.endAt ?? null,
    }))
  },
})

// ---------------------------------------------------------------------------
// Begivenheder: skrivning
// ---------------------------------------------------------------------------

export const createEvent = mutation({
  args: eventInputArgs,
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const fields = normalizeEventInput(args)

    const eventId = await ctx.db.insert('events', {
      ...fields,
      createdBy: profile._id,
      attendingCount: 0,
      waitlistedCount: 0,
      approvedGuestCount: 0,
      createdAt: Date.now(),
    })

    return { eventId, promoted: [] as Id<'profiles'>[] }
  },
})

/**
 * Retter en begivenhed. Arrangøren og admins må rette alt (#196); sletning er
 * stadig forbeholdt arrangøren.
 *
 * Hæver eller fjerner rettelsen pladsloftet, fyldes de ledige pladser fra
 * ventelisten i samme mutation. Den gamle app havde en separat RPC
 * (`promote_event_waitlist`), som klienten kaldte efter at have gemt; her kan
 * en hævet grænse og en oprykning ikke skilles ad.
 */
export const updateEvent = mutation({
  args: { eventId: v.id('events'), ...eventInputArgs },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const event = await requireEvent(ctx, args.eventId)
    if (!canManageEvent(profile, event)) {
      throw new ConvexError('NOT_EVENT_MANAGER')
    }

    const fields = normalizeEventInput(args)
    await ctx.db.patch(args.eventId, fields)

    const promoted = capRaised(event.maxParticipants, fields.maxParticipants)
      ? await promoteWaitlist(ctx, args.eventId, fields.maxParticipants)
      : []
    await syncEventCounts(ctx, args.eventId)

    return { promoted }
  },
})

/**
 * Sletter begivenheden og alt, hvad der hører til den. Convex har ingen
 * `on delete cascade`, så rækkerne fjernes her -- ellers ville tilmeldinger og
 * ansøgninger blive hængende uden en begivenhed at høre til.
 */
export const deleteEvent = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const event = await requireEvent(ctx, args.eventId)

    // Arrangøren -- eller en administrator. Admin-retten er ikke ny: den kom
    // med 20260823170000_account_deletion.sql (politikken "Admins can delete
    // any event"), fordi en begivenhed, hvis arrangør har slettet sin konto,
    // ellers var uigenkaldeligt låst fast. Se også `canManageEvent`.
    if (event.createdBy !== profile._id && !profile.isAdmin) {
      throw new ConvexError('NOT_EVENT_OWNER')
    }

    for (const row of await attendanceRows(ctx, args.eventId)) {
      await ctx.db.delete(row._id)
    }
    for (const task of await ctx.db
      .query('eventTasks')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()) {
      await ctx.db.delete(task._id)
    }
    for (const request of await ctx.db
      .query('eventGuestRequests')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()) {
      await ctx.db.delete(request._id)
    }
    for (const reminder of await ctx.db
      .query('eventReminders')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()) {
      await ctx.db.delete(reminder._id)
    }

    await ctx.db.delete(args.eventId)
    return null
  },
})

/**
 * Medlemmets svar på en begivenhed. Port af `respond_to_event`:
 *
 * - `attending` er en tilmelding. Er der fyldt op, lander den på ventelisten i
 *   tilmeldingsrækkefølge -- og ledige pladser tilhører ventelisten, ikke den
 *   nyeste tilmelding, så står nogen i kø, kommer den nye bagerst.
 * - `declined` er et afbud, som arrangøren kan se forskel på.
 * - `none` trækker svaret helt tilbage.
 *
 * Returnerer den status, svaret endte med, og dem, der rykkede op fra
 * ventelisten, så siden kan fortælle dem det.
 */
export const respondToEvent = mutation({
  args: {
    eventId: v.id('events'),
    response: v.union(
      v.literal('attending'),
      v.literal('declined'),
      v.literal('none'),
    ),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const event = await requireEvent(ctx, args.eventId)
    const now = Date.now()

    const mine = await ctx.db
      .query('eventAttendance')
      .withIndex('by_event_profile', (q) =>
        q.eq('eventId', args.eventId).eq('profileId', profile._id),
      )
      .unique()

    let status: 'attending' | 'waitlisted' | 'declined' | null = null
    let promoted: Id<'profiles'>[] = []

    if (args.response === 'none') {
      if (mine !== null) await ctx.db.delete(mine._id)
      status = null
    } else if (args.response === 'declined') {
      if (mine === null) {
        await ctx.db.insert('eventAttendance', {
          eventId: args.eventId,
          profileId: profile._id,
          status: 'declined',
          queuedAt: now,
        })
      } else if (mine.status !== 'declined') {
        await ctx.db.patch(mine._id, {
          status: 'declined',
          queuedAt: now,
          waitlistPosition: undefined,
        })
      }
      status = 'declined'
    } else {
      // Ledige pladser går til ventelisten først.
      promoted = await promoteWaitlist(ctx, args.eventId, event.maxParticipants)

      if (promoted.includes(profile._id)) {
        // Kalderen stod forrest i køen og fik selv en af de ledige pladser.
        status = 'attending'
        promoted = promoted.filter((id) => id !== profile._id)
      } else if (
        mine !== null &&
        (mine.status === 'attending' || mine.status === 'waitlisted')
      ) {
        // Allerede tilmeldt: pladsen (eller køpladsen) beholdes som den er.
        status = mine.status
      } else {
        const taken = (
          await ctx.db
            .query('eventAttendance')
            .withIndex('by_event_status_queued', (q) =>
              q.eq('eventId', args.eventId).eq('status', 'attending'),
            )
            .collect()
        ).length
        const queueIsEmpty =
          (await waitlistRows(ctx, args.eventId)).length === 0
        const hasFreeSeat =
          event.maxParticipants === undefined || taken < event.maxParticipants
        status = hasFreeSeat && queueIsEmpty ? 'attending' : 'waitlisted'

        if (mine === null) {
          await ctx.db.insert('eventAttendance', {
            eventId: args.eventId,
            profileId: profile._id,
            status,
            queuedAt: now,
          })
        } else {
          await ctx.db.patch(mine._id, { status, queuedAt: now })
        }
      }
    }

    // Ledige pladser -- frigivet af dette svar eller efterladt af noget, der
    // aldrig gik gennem denne mutation (fx en slettet konto) -- fyldes op her.
    promoted = [
      ...promoted,
      ...(await promoteWaitlist(ctx, args.eventId, event.maxParticipants)),
    ]

    await syncEventCounts(ctx, args.eventId)

    return { status, promoted }
  },
})

// ---------------------------------------------------------------------------
// Opgaver
// ---------------------------------------------------------------------------

/**
 * Alle medlemmer må oprette en opgave, og alle må melde sig til en ledig.
 * Titlen må ikke være tom (`char_length(btrim(title)) > 0` i den gamle tabel).
 */
export const createTask = mutation({
  args: { eventId: v.id('events'), title: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    await requireEvent(ctx, args.eventId)

    const title = args.title.trim()
    if (title.length === 0 || title.length > 200) {
      throw new ConvexError('TASK_TITLE_INVALID')
    }

    return await ctx.db.insert('eventTasks', {
      eventId: args.eventId,
      title,
      createdBy: profile._id,
      createdAt: Date.now(),
    })
  },
})

/**
 * Meld dig som ansvarlig. En opgave, en anden har taget, kan ikke overtages --
 * det var kolonnegrants'ens og policy'ens samspil i den gamle app.
 */
export const claimTask = mutation({
  args: { taskId: v.id('eventTasks') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const task = await ctx.db.get(args.taskId)
    if (task === null) throw new ConvexError('TASK_NOT_FOUND')
    if (task.assignedTo !== undefined && task.assignedTo !== profile._id) {
      throw new ConvexError('TASK_ALREADY_CLAIMED')
    }
    await ctx.db.patch(task._id, { assignedTo: profile._id })
    return null
  },
})

/** Træk dig fra din egen opgave. */
export const releaseTask = mutation({
  args: { taskId: v.id('eventTasks') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const task = await ctx.db.get(args.taskId)
    if (task === null) throw new ConvexError('TASK_NOT_FOUND')
    if (task.assignedTo !== profile._id) {
      throw new ConvexError('TASK_NOT_YOURS')
    }
    await ctx.db.patch(task._id, { assignedTo: undefined })
    return null
  },
})

/** Kun opgavens opretter må slette den. */
export const deleteTask = mutation({
  args: { taskId: v.id('eventTasks') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const task = await ctx.db.get(args.taskId)
    if (task === null) throw new ConvexError('TASK_NOT_FOUND')
    if (task.createdBy !== profile._id) {
      throw new ConvexError('NOT_TASK_CREATOR')
    }
    await ctx.db.delete(task._id)
    return null
  },
})

// ---------------------------------------------------------------------------
// Gæsteansøgninger
// ---------------------------------------------------------------------------

/**
 * Arrangørens eller en admins afgørelse. Kun en ansøgning, der venter, kan
 * afgøres; derefter rettes tællingen på begivenheden i samme mutation, så
 * "godkendte gæster" aldrig kan komme til at stå forkert.
 */
export const decideGuestRequest = mutation({
  args: {
    requestId: v.id('eventGuestRequests'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const request = await ctx.db.get(args.requestId)
    if (request === null) throw new ConvexError('GUEST_REQUEST_NOT_FOUND')

    const event = await requireEvent(ctx, request.eventId)
    if (!canManageEvent(profile, event)) {
      throw new ConvexError('NOT_EVENT_MANAGER')
    }
    if (request.status !== 'pending') {
      throw new ConvexError('GUEST_REQUEST_DECIDED')
    }

    await ctx.db.patch(request._id, {
      status: args.decision,
      reviewedAt: Date.now(),
      reviewedBy: profile._id,
    })
    await syncGuestCount(ctx, request.eventId)

    return null
  },
})

/** Som i den gamle app: en grov kontrol, ikke en garanti for levering. */
function looksLikeEmail(email: string) {
  return /^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(email)
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

/**
 * Rate limit for den offentlige gæsteformular. Samme grænser som den gamle
 * `record_event_guest_request_attempt`: 3 pr. kvarter og 10 i døgnet pr.
 * IP-adresse, 3 i døgnet pr. e-mail og 1000 i døgnet i alt.
 *
 * Returnerer antal sekunder til det tidligste tidspunkt, hvor et nyt forsøg
 * kan gå igennem -- eller null, hvis forsøget er inden for grænserne.
 *
 * Forsøget registreres, før der tælles, præcis som i den gamle funktion. Uden
 * en advisory lock kan to samtidige kald begge se en ledig plads i vinduet;
 * Convex genkører en mutation, der støder sammen om samme dokument, men her
 * skrives der kun nye rækker. Afvigelsen er et par ekstra forsøg i et
 * grænsetilfælde, ikke et hul i grænsen.
 */
async function recordAttempt(
  ctx: MutationCtx,
  ipHash: string,
  emailHash: string,
  now: number,
): Promise<number | null> {
  await ctx.db.insert('eventGuestRequestAttempts', {
    ipHash,
    emailHash,
    attemptedAt: now,
  })

  // Den gamle app rensede tabellen med en cron hver time; her tages et lille
  // antal i samme mutation, så tabellen ikke vokser uden ende.
  const stale = await ctx.db
    .query('eventGuestRequestAttempts')
    .withIndex('by_time', (q) => q.lt('attemptedAt', now - 25 * HOUR))
    .take(20)
  for (const row of stale) await ctx.db.delete(row._id)

  const ipQuarter = await ctx.db
    .query('eventGuestRequestAttempts')
    .withIndex('by_ip_time', (q) =>
      q.eq('ipHash', ipHash).gt('attemptedAt', now - QUARTER),
    )
    .collect()
  const ipDay = await ctx.db
    .query('eventGuestRequestAttempts')
    .withIndex('by_ip_time', (q) =>
      q.eq('ipHash', ipHash).gt('attemptedAt', now - 24 * HOUR),
    )
    .collect()
  const emailDay = await ctx.db
    .query('eventGuestRequestAttempts')
    .withIndex('by_email_time', (q) =>
      q.eq('emailHash', emailHash).gt('attemptedAt', now - 24 * HOUR),
    )
    .collect()
  const globalDay = await ctx.db
    .query('eventGuestRequestAttempts')
    .withIndex('by_time', (q) => q.gt('attemptedAt', now - 24 * HOUR))
    .collect()

  /** Tidligste tidspunkt, hvor et nyt forsøg ville ligge inden for grænsen. */
  function retryAt(
    rows: Doc<'eventGuestRequestAttempts'>[],
    limit: number,
    window: number,
  ) {
    if (rows.length <= limit) return null
    const times = rows.map((row) => row.attemptedAt).sort((a, b) => a - b)
    return times[rows.length - limit]! + window
  }

  const candidates = [
    retryAt(ipQuarter, 3, QUARTER),
    retryAt(ipDay, 10, 24 * HOUR),
    retryAt(emailDay, 3, 24 * HOUR),
    retryAt(globalDay, 1000, 24 * HOUR),
  ].filter((value): value is number => value !== null)

  if (candidates.length === 0) return null
  const retryAtMs = Math.max(...candidates)
  return Math.max(1, Math.ceil((retryAtMs - now) / 1000))
}

/**
 * Opretter en gæsteansøgning efter rate limit. `internalMutation`, fordi den
 * kaldes af `calendarFeed`'s `httpAction` og ikke må kunne kaldes som en
 * almindelig offentlig mutation: IP-adressen er en del af argumentet, og den
 * må kun komme fra HTTP-laget, aldrig fra en klient.
 *
 * Svarene er bevidst fattige. `accepted` dækker også "der findes allerede en
 * åben ansøgning fra samme e-mail", og `event_unavailable` dækker både en lukket
 * og en ikke-eksisterende begivenhed -- ellers kunne formularen bruges til at
 * afgøre, om en privat begivenhed findes.
 */
export const createGuestRequest = internalMutation({
  args: {
    eventId: v.string(),
    fullName: v.string(),
    email: v.string(),
    message: v.string(),
    partySize: v.number(),
    ipHash: v.string(),
    emailHash: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const email = normalizeEmail(args.email)
    const fullName = args.fullName.trim()
    const message = args.message.trim()

    if (fullName.length === 0 || fullName.length > 200) {
      return { outcome: 'invalid_request' as const }
    }
    if (email.length < 3 || email.length > 320 || !looksLikeEmail(email)) {
      return { outcome: 'invalid_request' as const }
    }
    if (message.length > 2000) {
      return { outcome: 'invalid_request' as const }
    }
    if (
      !Number.isInteger(args.partySize) ||
      args.partySize < 1 ||
      args.partySize > 20
    ) {
      return { outcome: 'invalid_request' as const }
    }
    if (
      !/^[0-9a-f]{64}$/.test(args.ipHash) ||
      !/^[0-9a-f]{64}$/.test(args.emailHash)
    ) {
      return { outcome: 'invalid_request' as const }
    }

    const retryAfterSeconds = await recordAttempt(
      ctx,
      args.ipHash,
      args.emailHash,
      now,
    )
    if (retryAfterSeconds !== null) {
      return { outcome: 'rate_limited' as const, retryAfterSeconds }
    }

    const eventId = ctx.db.normalizeId('events', args.eventId)
    if (eventId === null) {
      return { outcome: 'event_unavailable' as const }
    }
    const event = await ctx.db.get(eventId)
    // Kun offentlige, kommende begivenheder tager imod ansøgninger. En
    // flerdagstur, der er i gang, tager stadig imod, indtil den er slut.
    if (event === null || !event.isPublic || event.endsAt < now) {
      return { outcome: 'event_unavailable' as const }
    }

    // Den gamle app havde et partielt unikt indeks; her er opslaget reglen.
    const open = (
      await ctx.db
        .query('eventGuestRequests')
        .withIndex('by_event_email', (q) =>
          q.eq('eventId', eventId).eq('email', email),
        )
        .collect()
    ).find(
      (row) => row.status === 'pending' || row.status === 'approved',
    )
    if (open !== undefined) {
      return { outcome: 'accepted' as const }
    }

    await ctx.db.insert('eventGuestRequests', {
      eventId,
      fullName,
      email,
      message: message.length === 0 ? undefined : message,
      partySize: args.partySize,
      status: 'pending',
      createdAt: now,
    })

    return { outcome: 'accepted' as const }
  },
})

