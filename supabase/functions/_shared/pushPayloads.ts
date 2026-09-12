// Teksterne i push-notifikationerne ud over chatten (#216): ny begivenhed,
// påmindelse dagen før og en ny indstilling til en badge.
//
// Ren logik uden Deno- eller npm-afhængigheder, så den kan testes med
// `deno test` på linje med de øvrige hjælpere i _shared/. Payloaden er den
// JSON, service workeren (src/sw.ts) pakker ud: title, body, tag og den sti i
// appen, et tryk på notifikationen skal åbne.

/** Typerne, et medlem kan slå til og fra -- samme navne som i databasen. */
export const NOTIFICATION_KINDS = [
  'event_created',
  'event_reminder',
  'badge_nomination',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export interface PushPayload {
  title: string
  body: string
  tag: string
  path: string
}

export interface EventSummary {
  id: string
  title: string
  start_at: string
  location?: string | null
}

const TIME_ZONE = 'Europe/Copenhagen'

// Notifikationsteksten er kort -- resten læses i appen. Holder også payloaden
// langt under push-tjenesternes 4 KB-grænse.
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
function dayKey(date: Date) {
  return dayKeyFormatter.format(date)
}

/** "søndag den 14. september kl. 10.00" */
export function formatEventStart(startAt: string) {
  const start = new Date(startAt)
  return `${dateFormatter.format(start)} kl. ${timeFormatter.format(start)}`
}

/**
 * "i dag", "i morgen" eller datoen, set fra `now` i klubbens tidszone.
 * Påmindelsen går normalt ud dagen før, men kan også ramme en, der først
 * tilmelder sig samme morgen -- så skal der ikke stå "i morgen".
 */
export function relativeDay(startAt: string, now: Date): string {
  const start = new Date(startAt)
  const startDay = dayKey(start)
  const today = dayKey(now)
  if (startDay === today) return 'i dag'
  const tomorrow = dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  if (startDay === tomorrow) return 'i morgen'
  return dateFormatter.format(start)
}

/**
 * Hver begivenhed har sit eget tag, så to nye begivenheder samme aften ikke
 * erstatter hinanden i notifikationsskuffen. Påmindelsen om en begivenhed
 * erstatter derimod med vilje "ny begivenhed"-notifikationen om den samme --
 * begge peger samme sted hen.
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
  creatorName: string | null | undefined
}): PushPayload {
  const name = creatorName?.trim()
  const where = event.location?.trim()
  return {
    title: name
      ? `${name} har oprettet en begivenhed`
      : 'Ny begivenhed i kalenderen',
    body: `${shortTitle(event.title)} · ${formatEventStart(event.start_at)}${
      where ? ` · ${where}` : ''
    }`,
    tag: eventTag(event.id),
    path: eventPath(event.id),
  }
}

export function eventReminderPayload({
  event,
  now = new Date(),
}: {
  event: EventSummary
  now?: Date
}): PushPayload {
  const start = new Date(event.start_at)
  const where = event.location?.trim()
  return {
    title: `Husk: ${shortTitle(event.title)}`,
    body: `Du er tilmeldt ${relativeDay(event.start_at, now)} kl. ${timeFormatter.format(start)}${
      where ? ` · ${where}` : ''
    }.`,
    tag: eventTag(event.id),
    path: eventPath(event.id),
  }
}

export interface BadgeNominationSummary {
  id: string
  badgeName: string | null | undefined
  nomineeName: string | null | undefined
  nominatorName: string | null | undefined
}

function displayName(name: string | null | undefined) {
  return name?.trim() || 'Et medlem'
}

/**
 * Admins får at vide, hvem der indstillede hvem -- de skal tage stilling. Den
 * indstillede får kun at vide, at nogen har indstillet dem: hvem det var,
 * afsløres først, når badgen er tildelt (se BadgeShowcase), så en afvist
 * indstilling ikke hænger på nogen.
 */
export function badgeNominationAdminPayload(
  nomination: BadgeNominationSummary,
): PushPayload {
  const badgeName = nomination.badgeName?.trim() || 'en badge'
  return {
    title: 'Ny indstilling til en badge',
    body: `${displayName(nomination.nominatorName)} har indstillet ${displayName(nomination.nomineeName)} til ${badgeName}.`,
    tag: 'naturklubben-badge-nomination',
    path: 'admin?sektion=badges',
  }
}

export function badgeNominationNomineePayload(
  nomination: BadgeNominationSummary,
): PushPayload {
  const badgeName = nomination.badgeName?.trim() || 'en badge'
  return {
    title: 'Du er indstillet til en badge',
    body: `Et medlem har indstillet dig til ${badgeName}. Administratorerne kigger på det.`,
    tag: `naturklubben-badge-nominee-${nomination.id}`,
    path: 'profil',
  }
}
