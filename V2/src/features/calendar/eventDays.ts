/**
 * Flerdagsbegivenheder (#259): hvilke dage en begivenhed dækker, og hvordan
 * dens tidsrum skrives. Rene funktioner -- ingen React, ingen Convex -- så
 * dag-beregningen kan testes for sig, sommertid inklusive.
 *
 * Tiderne er ms siden epoch, som i resten af V2.
 */

export interface EventTimes {
  startAt: number
  endAt: number | null
}

/** Hvor på en flerdagsbegivenhed en given dag ligger. */
export type DayPosition = 'single' | 'first' | 'middle' | 'last'

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Begivenhedens slut -- starten, når den ikke har noget sluttidspunkt. */
export function effectiveEnd(event: EventTimes): Date {
  return new Date(event.endAt ?? event.startAt)
}

/**
 * Den sidste dag, begivenheden optager. En slutning præcis ved midnat tæller
 * ikke den nye dag med: "fredag 18 -- lørdag 00:00" er en fredagsaften.
 */
export function lastDay(event: EventTimes): Date {
  const start = new Date(event.startAt)
  const end = effectiveEnd(event)
  const endDay = startOfDay(end)
  if (end.getTime() > start.getTime() && end.getTime() === endDay.getTime()) {
    return new Date(
      endDay.getFullYear(),
      endDay.getMonth(),
      endDay.getDate() - 1,
    )
  }
  return endDay
}

/** Alle dage fra startdagen til og med slutdagen, som lokal midnat. */
export function eventDays(event: EventTimes): Date[] {
  const first = startOfDay(new Date(event.startAt))
  const last = lastDay(event)
  const days: Date[] = []
  // Dagene tælles på kalenderen, ikke i millisekunder: et døgn over
  // sommertidsskiftet er 23 eller 25 timer.
  for (
    let day = first;
    day <= last;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    days.push(day)
  }
  return days.length > 0 ? days : [first]
}

export function isMultiDay(event: EventTimes): boolean {
  return eventDays(event).length > 1
}

export function dayPosition(event: EventTimes, day: Date): DayPosition {
  const days = eventDays(event)
  if (days.length === 1) return 'single'
  if (sameDay(day, days[0]!)) return 'first'
  if (sameDay(day, days[days.length - 1]!)) return 'last'
  return 'middle'
}

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const shortDateFormatter = new Intl.DateTimeFormat('da-DK', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const timeFormatter = new Intl.DateTimeFormat('da-DK', {
  hour: '2-digit',
  minute: '2-digit',
})

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Tidsrummet i fuld længde, til detaljevisninger: "Fredag d. 3. oktober 2026,
 * kl. 16.00 – 14.00" for én dag, og med slutdatoen skrevet ud, når
 * begivenheden slutter en anden dag.
 */
export function formatEventWhen(event: EventTimes): string {
  const start = new Date(event.startAt)
  const text = `${capitalize(dateFormatter.format(start))}, kl. ${timeFormatter.format(start)}`
  if (event.endAt === null) return text
  const end = new Date(event.endAt)
  if (!isMultiDay(event)) return `${text} – ${timeFormatter.format(end)}`
  return `${text} – ${dateFormatter.format(end)}, kl. ${timeFormatter.format(end)}`
}

/**
 * Den korte udgave til lister, hvor datoen allerede står i datoboksen:
 * "kl. 16.00" for én dag, "kl. 16.00 – søn. 5. okt. kl. 14.00" for flere.
 */
export function formatEventTimeShort(event: EventTimes): string {
  const start = new Date(event.startAt)
  const text = `kl. ${timeFormatter.format(start)}`
  if (event.endAt === null || !isMultiDay(event)) return text
  const end = new Date(event.endAt)
  return `${text} – ${shortDateFormatter.format(end)} kl. ${timeFormatter.format(end)}`
}

/** Sluttidspunktet som klokkeslæt, til den sidste dag i månedsvisningen. */
export function formatEndTime(event: EventTimes): string | null {
  return event.endAt === null ? null : timeFormatter.format(new Date(event.endAt))
}
