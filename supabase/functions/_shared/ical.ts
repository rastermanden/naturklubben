export interface IcalEvent {
  id: string
  title: string
  description?: string | null
  location: string | null
  start_at: string
  end_at: string | null
}

export interface IcalOptions {
  refreshInterval?: string
}

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

/** Fold long iCal lines at 75 octets (RFC 5545 §3.1). */
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
    `DTSTART:${formatIcalDate(new Date(event.start_at))}`,
  ]

  if (event.end_at) {
    lines.push(`DTEND:${formatIcalDate(new Date(event.end_at))}`)
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

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Naturklubben//Kalender//DA',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...refreshLines,
    ...events.map((event) => buildVevent(event, dtstamp)),
    'END:VCALENDAR',
  ].join('\r\n')
}
