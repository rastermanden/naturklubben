import type { HttpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { internal } from './_generated/api'

/**
 * De to offentlige HTTP-ruter i kalenderen: iCal-feedet og gæsteformularen.
 *
 * De ligger her og ikke i `convex/http.ts`, fordi `http.ts` er projektlederens
 * fil: den kalder `registerCalendarFeedRoutes(http)` med sin egen router.
 *
 * Hvorfor de er offentlige:
 *
 * - `GET /calendar/<token>.ics` læses af Google Kalender, Apple Kalender og
 *   Outlook, som ikke har noget Convex-login. Den gamle app havde samme
 *   endpoint uden nogen form for autentificering (Edge Functionen
 *   `calendar-feed`), og indholdet var det data-minimerede view
 *   `calendar_feed_events`: titel, sted og tid for *offentlige* begivenheder --
 *   aldrig beskrivelsen, arrangøren eller noget medlemsdata.
 *
 *   Tokenet i stien er ikke en hemmelighed i sig selv. Den gamle app havde
 *   ingen token; her findes stien, fordi en abonnements-URL skal kunne
 *   tilbagekaldes og skiftes på et deployment uden at ændre kode
 *   (`npx convex env set CALENDAR_FEED_TOKEN <værdi>`). Er der ikke sat nogen,
 *   gælder standardværdien herunder, og feedet er lige så åbent som før.
 *
 * - `POST /calendar/guest-request` er gæsteformularen for folk uden login. Den
 *   er en `httpAction` og ikke en offentlig mutation, fordi rate limiting skal
 *   bruge klientens IP-adresse: den må kun læses af HTTP-laget og aldrig sendes
 *   fra klienten som et argument. Mutationen bagved er `internalMutation` og
 *   kan ikke kaldes udefra.
 */

/** Standardtokenet, når deploymentet ikke har sat `CALENDAR_FEED_TOKEN`. */
const DEFAULT_FEED_TOKEN = 'naturklubben'

/** Samme opdateringshastighed som den gamle Edge Function. */
const CALENDAR_REFRESH_INTERVAL = 'PT1H'

const CORS_HEADERS: Record<string, string> = {
  // Ruten er offentlig og bruger hverken cookies eller login, så et wildcard
  // giver ikke adgang til noget, en fremmed side ikke selv kunne sende.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

// ---------------------------------------------------------------------------
// iCal-generatoren
// ---------------------------------------------------------------------------
//
// En tro kopi af `src/lib/ical.ts` og den gamle `supabase/functions/_shared/
// ical.ts`. Den *skal* være en kopi: Convex' bundler tager kun filer under
// `convex/`, så en import fra `src/` ville ikke kunne deployes. Retter man
// formateringen her, skal `src/lib/ical.ts` rettes samme sted -- testen i
// `src/lib/ical.test.ts` dækker den kopi, browseren bruger.

interface IcalEvent {
  id: string
  title: string
  location: string | null
  startAt: number
  endAt: number | null
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

  if (event.location) {
    lines.push(foldLine(`LOCATION:${escapeText(event.location)}`))
  }

  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

function generateIcal(
  events: IcalEvent[],
  calendarName: string,
  refreshInterval: string,
): string {
  const dtstamp = formatIcalDate(new Date())

  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Naturklubben//Kalender//DA',
      `X-WR-CALNAME:${escapeText(calendarName)}`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `REFRESH-INTERVAL;VALUE=DURATION:${refreshInterval}`,
      `X-PUBLISHED-TTL:${refreshInterval}`,
      ...events.map((event) => buildVevent(event, dtstamp)),
      'END:VCALENDAR',
    ].join('\r\n') + '\r\n'
  )
}

// ---------------------------------------------------------------------------
// Hjælpere til HTTP-laget
// ---------------------------------------------------------------------------

function expectedFeedToken(): string {
  return process.env.CALENDAR_FEED_TOKEN ?? DEFAULT_FEED_TOKEN
}

/** Tokenet fra `/calendar/<token>.ics`, eller null hvis stien ikke passer. */
function feedTokenFromPath(pathname: string): string | null {
  const prefix = '/calendar/'
  const suffix = '.ics'
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null
  const token = pathname.slice(prefix.length, -suffix.length)
  // Et token må ikke kunne indeholde endnu et sti-led.
  if (token.length === 0 || token.includes('/')) return null
  return token
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Klientens adresse, så vidt HTTP-laget fortæller den.
 *
 * Convex oplyser ikke en fast header til formålet. Findes der ingen, hashes
 * en fast streng i stedet: så bliver IP-grænsen i praksis en global grænse, og
 * det er den sikre retning at fejle i. Den gamle app læste
 * `cf-connecting-ip` fra Cloudflare; det virker kun, hvis deploymentet står
 * bag en proxy, der selv sætter headeren -- en klient kan sætte den selv, og
 * derfor er den kun et ekstra signal, ikke en garanti.
 */
function clientAddress(request: Request): string {
  const direct = request.headers.get('cf-connecting-ip')
  if (direct && !direct.includes(',')) return direct.trim()

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first

  return 'ukendt-adresse'
}

function jsonResponse(
  body: unknown,
  status: number,
  extra: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...extra,
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// ---------------------------------------------------------------------------
// Ruterne
// ---------------------------------------------------------------------------

const calendarFeed = httpAction(async (ctx, request) => {
  const token = feedTokenFromPath(new URL(request.url).pathname)
  if (token === null || token !== expectedFeedToken()) {
    // Ukendt token og forkert token ser ens ud: der er intet at gætte.
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const events = await ctx.runQuery(internal.calendar.feedEvents, {})
  const ics = generateIcal(events, 'Naturklubben', CALENDAR_REFRESH_INTERVAL)

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="naturklubben.ics"',
      // Samme levetid som REFRESH-INTERVAL ovenfor.
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

const guestRequest = httpAction(async (ctx, request) => {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ code: 'invalid_request' }, 400)
  }

  if (
    !isRecord(payload) ||
    typeof payload.eventId !== 'string' ||
    typeof payload.fullName !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.partySize !== 'number' ||
    (payload.message !== undefined && typeof payload.message !== 'string')
  ) {
    return jsonResponse({ code: 'invalid_request' }, 400)
  }

  const email = payload.email.trim().toLowerCase()
  const ipHash = await sha256Hex(clientAddress(request))
  const emailHash = await sha256Hex(email)

  const result = await ctx.runMutation(internal.calendar.createGuestRequest, {
    eventId: payload.eventId,
    fullName: payload.fullName,
    email,
    message: typeof payload.message === 'string' ? payload.message : '',
    partySize: payload.partySize,
    ipHash,
    emailHash,
  })

  if (result.outcome === 'rate_limited') {
    return jsonResponse(
      { code: 'rate_limited', retryAfterSeconds: result.retryAfterSeconds },
      429,
      { 'Retry-After': String(result.retryAfterSeconds) },
    )
  }
  if (result.outcome === 'event_unavailable') {
    return jsonResponse({ code: 'event_unavailable' }, 404)
  }
  if (result.outcome === 'invalid_request') {
    return jsonResponse({ code: 'invalid_request' }, 400)
  }

  return jsonResponse({ accepted: true }, 200)
})

const guestRequestPreflight = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
})

/**
 * Tilføjer kalenderens offentlige ruter til routeren. Kaldes fra
 * `convex/http.ts`; rækkefølgen er uden betydning, fordi stierne ikke
 * overlapper for samme metode (feedet er GET, formularen POST).
 */
export function registerCalendarFeedRoutes(http: HttpRouter) {
  http.route({
    pathPrefix: '/calendar/',
    method: 'GET',
    handler: calendarFeed,
  })
  http.route({
    path: '/calendar/guest-request',
    method: 'POST',
    handler: guestRequest,
  })
  http.route({
    path: '/calendar/guest-request',
    method: 'OPTIONS',
    handler: guestRequestPreflight,
  })
}
