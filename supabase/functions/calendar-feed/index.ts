// Edge Function: calendar-feed
//
// Offentligt iCal-abonnementsendpoint — returnerer alle kommende begivenheder
// i Naturklubben som en RFC 5545-kompatibel .ics-strøm.
//
// Kalender-apps (Google Kalender, Apple Kalender, Outlook m.fl.) kan
// abonnere på URL'en og henter automatisk et opdateret feed med jævne
// mellemrum. Endpointet kræver ingen autentificering, men læser kun
// begivenheder som er offentlige via RLS (anon-rollen).
//
// GET /functions/v1/calendar-feed  -> text/calendar

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── iCal-hjælpere ────────────────────────────────────────────────────────────

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
    let end = Math.min(offset + limit, bytes.length)
    // Back off to avoid splitting a multi-byte UTF-8 sequence
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

interface CalendarEvent {
  id: string
  title: string
  location: string | null
  start_at: string
  end_at: string | null
}

function buildVevent(event: CalendarEvent, dtstamp: string): string {
  const start = new Date(event.start_at)
  const end = event.end_at ? new Date(event.end_at) : null

  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${event.id}@naturklubben`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatIcalDate(start)}`,
  ]

  if (end) {
    lines.push(`DTEND:${formatIcalDate(end)}`)
  }

  lines.push(foldLine(`SUMMARY:${escapeText(event.title)}`))

  if (event.location) {
    lines.push(foldLine(`LOCATION:${escapeText(event.location)}`))
  }

  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

function buildIcalendar(events: CalendarEvent[]): string {
  const dtstamp = formatIcalDate(new Date())
  const parts = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Naturklubben//Kalender//DA',
    'X-WR-CALNAME:Naturklubben',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // Hint til kalender-apps om at tjekke for opdateringer hver time
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.map((e) => buildVevent(e, dtstamp)),
    'END:VCALENDAR',
  ]
  return parts.join('\r\n')
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey',
      },
    })
  }

  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const publishableKeysJson = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
    if (!supabaseUrl || !publishableKeysJson) {
      console.error('calendar-feed: missing Supabase environment variables')
      return new Response('Internal Server Error', { status: 500 })
    }

    const publishableKeys = JSON.parse(publishableKeysJson) as Record<
      string,
      unknown
    >
    const publishableKey = publishableKeys.default
    if (typeof publishableKey !== 'string' || !publishableKey) {
      console.error('calendar-feed: missing default Supabase publishable key')
      return new Response('Internal Server Error', { status: 500 })
    }

    // The publishable key assumes the anon role. That role can only read the
    // deliberately data-minimized view, not the member-only events table.
    const supabase = createClient(supabaseUrl, publishableKey)

    const startOfToday = new Date()
    startOfToday.setUTCHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('calendar_feed_events')
      .select('id, title, location, start_at, end_at')
      .gte('start_at', startOfToday.toISOString())
      .order('start_at', { ascending: true })

    if (error) {
      console.error('calendar-feed: db error', error)
      return new Response('Internal Server Error', { status: 500 })
    }

    const ics = buildIcalendar(data ?? [])

    return new Response(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="naturklubben.ics"',
        // Brug samme TTL som REFRESH-INTERVAL ovenfor
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    console.error('calendar-feed: unexpected error', err)
    return new Response('Internal Server Error', { status: 500 })
  }
})
