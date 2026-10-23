export interface IcalEvent {
  id: string
  title: string
  description?: string | null
  location?: string | null
  startAt: number
  endAt: number | null
}

export interface IcalOptions {
  refreshInterval?: string
}

/**
 * iCal-generatoren, som browseren bruger når et medlem trykker "Tilføj til
 * kalender".
 *
 * Kopi af den gamle `supabase/functions/_shared/ical.ts`, med feltnavne som i
 * resten af V2 (ms i stedet for ISO-strenge). Der findes en tvilling i
 * `convex/calendarFeed.ts`, som serverer abonnements-feedet: Convex' bundler
 * tager kun filer under `convex/`, så de to kan ikke dele denne fil. Retter man
 * formateringen, skal begge rettes samme sted.
 *
 * Funktionen er ren: ingen React, intet netværk, ingen `navigator` -- kun
 * tekst ind og tekst ud, så den kan testes for sig.
 */

function formatIcalDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** Fold lange iCal-linjer ved 75 oktetter (RFC 5545 §3.1). */
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(line)
  if (bytes.length <= 75) return line

  const decoder = new TextDecoder()
  const chunks: Uint8Array[] = []
  let offset = 0
  let limit = 75

  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length)
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end--
    }
    chunks.push(bytes.slice(offset, end))
    offset = end
    limit = 74
  }

  return chunks
    .map((chunk, index) => (index === 0 ? '' : ' ') + decoder.decode(chunk))
    .join('\r\n')
}

function buildVevent(event: IcalEvent, dtstamp: string): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@naturklubben`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatIcalDate(new Date(event.startAt))}`,
  ]

  if (event.endAt !== null) {
    lines.push(`DTEND:${formatIcalDate(new Date(event.endAt))}`)
  }

  lines.push(foldLine(`SUMMARY:${escapeText(event.title)}`))

  if (event.description) {
    lines.push(foldLine(`DESCRIPTION:${escapeText(event.description)}`))
  }

  if (event.location) {
    lines.push(foldLine(`LOCATION:${escapeText(event.location)}`))
  }

  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

export function generateIcal(
  events: IcalEvent[],
  calendarName = 'Naturklubben',
  options: IcalOptions = {},
): string {
  const dtstamp = formatIcalDate(new Date())
  const refreshLines = options.refreshInterval
    ? [
        `REFRESH-INTERVAL;VALUE=DURATION:${options.refreshInterval}`,
        `X-PUBLISHED-TTL:${options.refreshInterval}`,
      ]
    : []

  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Naturklubben//Kalender//DA',
      `X-WR-CALNAME:${escapeText(calendarName)}`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      ...refreshLines,
      ...events.map((event) => buildVevent(event, dtstamp)),
      'END:VCALENDAR',
    ].join('\r\n') + '\r\n'
  )
}

/** Trigger en download af en .ics-fil i browseren. */
export function downloadIcal(
  events: IcalEvent[],
  filename = 'naturklubben.ics',
): void {
  const content = generateIcal(events)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
