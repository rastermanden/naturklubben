// Offentlig indsendelse af en gæsteansøgning til en åben begivenhed (#224).
// Samme grænse som submit-probation-application: kun Cloudflares
// CF-Connecting-IP som netværkssignal, HMAC-hashede rate-limit-signaler, og
// et svar, der ikke røber, om e-mailen allerede har søgt.

import { handleCors } from '../_shared/cors.ts'
import { extractTrustedClientAddress } from '../_shared/clientAddress.ts'

export interface GuestRequestRpcArguments {
  target_event_id: string
  guest_full_name: string
  guest_email: string
  guest_message: string | null
  guest_party_size: number
  exact_ip_hash: string
  client_network_hash: string
  normalized_email_hash: string
}

export interface GuestRequestRpcResult {
  submission_outcome: 'accepted' | 'rate_limited' | 'event_unavailable'
  retry_after_seconds: number | null
}

interface GuestRequestDependencies {
  secret: string
  submit: (
    arguments_: GuestRequestRpcArguments,
  ) => Promise<GuestRequestRpcResult>
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
  reportError?: (requestId: string, category: string) => void
}

export interface ValidatedGuestRequest {
  eventId: string
  fullName: string
  email: string
  message: string | null
  partySize: number
}

const MAX_BODY_BYTES = 16_384
const MIN_ACCEPTED_RESPONSE_MS = 400
const ACCEPTED_RESPONSE_JITTER_MS = 100
export const MAX_PARTY_SIZE = 20
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const encoder = new TextEncoder()

function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  corsHeaders: Headers,
  extraHeaders: Record<string, string> = {},
) {
  const headers = new Headers(corsHeaders)
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value)
  }
  headers.set('Content-Type', 'application/json')
  headers.set('X-Request-Id', requestId)

  return new Response(JSON.stringify(body), { status, headers })
}

export async function hmacSignal(
  secret: string,
  domain: 'exact-ip' | 'network' | 'email',
  value: string,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`event-guest-rate-limit-v1\0${domain}\0${value}`),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateGuestRequest(
  value: unknown,
): ValidatedGuestRequest | null {
  if (!isRecord(value)) return null

  const eventId =
    typeof value.eventId === 'string' ? value.eventId.trim().toLowerCase() : ''
  const fullName =
    typeof value.fullName === 'string' ? value.fullName.trim() : ''
  const email =
    typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  const message = typeof value.message === 'string' ? value.message.trim() : ''
  const partySize =
    typeof value.partySize === 'number'
      ? value.partySize
      : value.partySize === undefined
        ? 1
        : Number.NaN

  if (
    !UUID_PATTERN.test(eventId) ||
    fullName.length === 0 ||
    fullName.length > 200 ||
    email.length === 0 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(email) ||
    message.length > 2000 ||
    !Number.isInteger(partySize) ||
    partySize < 1 ||
    partySize > MAX_PARTY_SIZE
  ) {
    return null
  }

  return {
    eventId,
    fullName,
    email,
    message: message.length > 0 ? message : null,
    partySize,
  }
}

async function parseRequestBody(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null
  }

  const text = await request.text()
  if (encoder.encode(text).byteLength > MAX_BODY_BYTES) return null

  try {
    return validateGuestRequest(JSON.parse(text))
  } catch {
    return null
  }
}

export function createGuestRequestHandler({
  secret,
  submit,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random,
  reportError = () => undefined,
}: GuestRequestDependencies) {
  return async (request: Request) => {
    const requestId = crypto.randomUUID()
    const cors = handleCors(request, {
      methods: ['POST'],
      exposeHeaders: ['Retry-After', 'X-Request-Id'],
    })

    if (cors.response) return cors.response
    const corsHeaders = cors.headers

    if (request.method !== 'POST') {
      return jsonResponse(
        { code: 'method_not_allowed' },
        405,
        requestId,
        corsHeaders,
        { Allow: 'POST, OPTIONS' },
      )
    }

    const address = extractTrustedClientAddress(request.headers)
    if (!address) {
      reportError(requestId, 'trusted_network_signal_unavailable')
      return jsonResponse(
        { code: 'temporarily_unavailable' },
        503,
        requestId,
        corsHeaders,
      )
    }

    let submission: ValidatedGuestRequest | null
    try {
      submission = await parseRequestBody(request)
    } catch {
      submission = null
    }
    if (!submission) {
      return jsonResponse(
        { code: 'invalid_request' },
        400,
        requestId,
        corsHeaders,
      )
    }

    const startedAt = performance.now()
    try {
      const [exactIpHash, networkHash, emailHash] = await Promise.all([
        hmacSignal(secret, 'exact-ip', address.exact),
        hmacSignal(secret, 'network', address.network),
        hmacSignal(secret, 'email', submission.email),
      ])
      const result = await submit({
        target_event_id: submission.eventId,
        guest_full_name: submission.fullName,
        guest_email: submission.email,
        guest_message: submission.message,
        guest_party_size: submission.partySize,
        exact_ip_hash: exactIpHash,
        client_network_hash: networkHash,
        normalized_email_hash: emailHash,
      })

      if (result.submission_outcome === 'rate_limited') {
        const retryAfter = Math.max(
          1,
          Math.ceil(result.retry_after_seconds ?? 900),
        )
        return jsonResponse(
          { code: 'rate_limited', retryAfterSeconds: retryAfter },
          429,
          requestId,
          corsHeaders,
          { 'Retry-After': String(retryAfter) },
        )
      }
      if (result.submission_outcome === 'event_unavailable') {
        // Begivenheden findes ikke, er privat eller er overstået. Svaret
        // skelner ikke -- for en udenforstående er den bare ikke åben.
        return jsonResponse(
          { code: 'event_unavailable' },
          404,
          requestId,
          corsHeaders,
        )
      }
      if (result.submission_outcome !== 'accepted') {
        throw new Error('unexpected_submission_outcome')
      }

      // En reel oprettelse og en allerede åben ansøgning fra samme e-mail
      // deler status, body og svartidsklasse, så formularen ikke kan bruges
      // til at finde ud af, hvem der har søgt.
      const targetDuration =
        MIN_ACCEPTED_RESPONSE_MS +
        Math.floor(random() * ACCEPTED_RESPONSE_JITTER_MS)
      const remaining = targetDuration - (performance.now() - startedAt)
      if (remaining > 0) await sleep(remaining)

      return jsonResponse({ accepted: true }, 202, requestId, corsHeaders)
    } catch {
      reportError(requestId, 'submission_backend_failure')
      return jsonResponse(
        { code: 'temporarily_unavailable' },
        503,
        requestId,
        corsHeaders,
      )
    }
  }
}
