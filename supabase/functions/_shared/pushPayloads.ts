// Teksterne i push-notifikationerne ud over chatten (#216): ny begivenhed,
// påmindelse dagen før og en ny indstilling til en badge, der skal godkendes.
//
// Ren logik uden Deno- eller npm-afhængigheder, så den kan testes med
// `deno test` på linje med de øvrige hjælpere i _shared/. Payloaden er den
// JSON, service workeren (src/sw.ts) pakker ud: title, body, tag og den sti i
// appen, et tryk på notifikationen skal åbne.

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

/** Kalenderdagen efter `key` -- et døgn, ikke 24 timer, så skiftet til
 * sommertid ikke springer en dag over. */
function nextDayKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

/** "søndag den 14. september kl. 10.00" */
export function formatEventStart(startAt: string) {
  const start = new Date(startAt)
  return `${dateFormatter.format(start)} kl. ${timeFormatter.format(start)}`
}

/**
 * "i morgen" eller datoen, set fra `now` i klubbens tidszone. Påmindelsen
 * går ud dagen før; skulle den nå frem senere, står datoen der i stedet.
 */
export function relativeDay(startAt: string, now: Date): string {
  const start = new Date(startAt)
  if (dayKey(start) === nextDayKey(dayKey(now))) return 'i morgen'
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
 * indstillede får ingen besked: de hører først om det, når badgen er tildelt
 * (se BadgeShowcase), så en afvist indstilling ikke hænger på nogen.
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
