import type { CalendarEvent } from './useEvents'

/** Format a Date as iCal DATETIME string (UTC): YYYYMMDDTHHmmssZ */
function formatIcalDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

/** Escape special characters in iCal text values */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** Fold long iCal lines at 75 octets (RFC 5545 §3.1) */
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(line)
  if (bytes.length <= 75) return line

  const decoder = new TextDecoder()
  const chunks: Uint8Array[] = []
  let offset = 0
  let limit = 75

  while (offset < bytes.length) {
    // Back off from limit to avoid splitting a multi-byte sequence
    let end = Math.min(offset + limit, bytes.length)
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end--
    }
    chunks.push(bytes.slice(offset, end))
    offset = end
    limit = 74 // continuation lines are one byte shorter (leading space)
  }

  return chunks
    .map((chunk, i) => (i === 0 ? '' : ' ') + decoder.decode(chunk))
    .join('\r\n')
}

function buildVevent(event: CalendarEvent): string {
  const start = new Date(event.start_at)
  const end = event.end_at ? new Date(event.end_at) : null

  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${event.id}@naturklubben`,
    `DTSTAMP:${formatIcalDate(new Date())}`,
    `DTSTART:${formatIcalDate(start)}`,
  ]

  if (end) {
    lines.push(`DTEND:${formatIcalDate(end)}`)
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

/**
 * Generate an iCalendar (.ics) string for one or more calendar events.
 */
export function generateIcal(
  events: CalendarEvent[],
  calendarName = 'Naturklubben',
): string {
  const vevents = events.map(buildVevent).join('\r\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Naturklubben//Kalender//DA',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    vevents,
    'END:VCALENDAR',
  ].join('\r\n')
}

/** Trigger a browser download of a .ics file */
export function downloadIcal(
  events: CalendarEvent[],
  filename = 'naturklubben.ics',
): void {
  const content = generateIcal(events)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
