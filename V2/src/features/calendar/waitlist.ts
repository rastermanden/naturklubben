/**
 * Pladsloft og venteliste (#222).
 *
 * Backend er facit: `calendar.respondToEvent` afgør, om en tilmelding får en
 * plads eller lander på ventelisten, og hvem der rykker op, når en plads bliver
 * ledig. Funktionerne her regner det samme ud af den liste, klienten allerede
 * har -- til visningen og til det svar, knappen lover, før mutationen er
 * tilbage. Ventelisten står i tilmeldingsrækkefølge; profil-id bryder et
 * sammenfald i tidspunkt, præcis som serveren gør det.
 */

export type AttendanceStatus = 'attending' | 'waitlisted' | 'declined'

export interface AttendanceEntry {
  profileId: string
  status: AttendanceStatus
  /** Svar-tidspunktet i ms. */
  queuedAt: number
}

/** Den del af en tilmelding, visningen har brug for. */
export function byQueueOrder(left: AttendanceEntry, right: AttendanceEntry) {
  if (left.queuedAt !== right.queuedAt) return left.queuedAt - right.queuedAt
  return left.profileId < right.profileId
    ? -1
    : left.profileId > right.profileId
      ? 1
      : 0
}

export function attendingEntries<T extends AttendanceEntry>(
  entries: readonly T[],
): T[] {
  return entries.filter((entry) => entry.status === 'attending')
}

/** Ventelisten i den rækkefølge, pladserne gives væk. */
export function waitlistEntries<T extends AttendanceEntry>(
  entries: readonly T[],
): T[] {
  return entries
    .filter((entry) => entry.status === 'waitlisted')
    .sort(byQueueOrder)
}

export function declinedEntries<T extends AttendanceEntry>(
  entries: readonly T[],
): T[] {
  return entries.filter((entry) => entry.status === 'declined')
}

/** Medlemmets plads i køen (1 er den forreste), eller null uden for køen. */
export function waitlistPosition(
  entries: readonly AttendanceEntry[],
  profileId: string,
): number | null {
  const index = waitlistEntries(entries).findIndex(
    (entry) => entry.profileId === profileId,
  )
  return index === -1 ? null : index + 1
}

export function hasFreeSeat(
  entries: readonly AttendanceEntry[],
  maxParticipants: number | null,
) {
  if (maxParticipants === null) return true
  return attendingEntries(entries).length < maxParticipants
}

/**
 * Den status, en ny tilmelding må forventes at få -- klienten viser den, indtil
 * serveren har svaret. Ledige pladser tilhører ventelisten, så står nogen i
 * kø, lander den nye bagerst, selv om tællingen siger, der er plads.
 */
export function expectedResponseStatus(
  entries: readonly AttendanceEntry[],
  maxParticipants: number | null,
): 'attending' | 'waitlisted' {
  if (
    hasFreeSeat(entries, maxParticipants) &&
    waitlistEntries(entries).length === 0
  ) {
    return 'attending'
  }
  return 'waitlisted'
}

/** "3/10 pladser" med loft, ellers bare "3". */
export function seatsLabel(
  entries: readonly AttendanceEntry[],
  maxParticipants: number | null,
) {
  const attending = attendingEntries(entries).length
  if (maxParticipants === null) return `${attending}`
  return `${attending}/${maxParticipants} pladser`
}

/**
 * Formularfeltets tekst som pladsloft: tomt er ubegrænset (null), et helt tal
 * fra 1 og op er et loft, og alt andet er ugyldigt (undefined).
 */
export function parseMaxParticipants(value: string): number | null | undefined {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+$/.test(trimmed)) return undefined
  const parsed = Number(trimmed)
  return parsed >= 1 ? parsed : undefined
}

/**
 * Er der blevet plads til flere efter en ændring af loftet? Kun så er der
 * nogen at rykke op -- et sænket loft ændrer ingen tilmeldinger.
 */
export function capRaised(previous: number | null, next: number | null) {
  if (next === null) return previous !== null
  return previous !== null && next > previous
}
