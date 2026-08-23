export interface SubmissionRpcArguments {
  applicant_full_name: string
  applicant_email: string
  applicant_motivation: string
  push_endpoint: string
  push_p256dh: string
  push_auth: string
  exact_ip_hash: string
  client_network_hash: string
  normalized_email_hash: string
}

export interface SubmissionRpcResult {
  submission_outcome: 'accepted' | 'rate_limited'
  retry_after_seconds: number | null
}

interface SubmissionDependencies {
  secret: string
  submit: (arguments_: SubmissionRpcArguments) => Promise<SubmissionRpcResult>
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
  reportError?: (requestId: string, category: string) => void
}

interface ParsedAddress {
  exact: string
  network: string
}

interface ValidatedSubmission {
  fullName: string
  email: string
  motivation: string
  subscription: {
    endpoint: string
    p256dh: string
    auth: string
  }
}

const MAX_BODY_BYTES = 16_384
const MIN_ACCEPTED_RESPONSE_MS = 400
const ACCEPTED_RESPONSE_JITTER_MS = 100
const encoder = new TextEncoder()

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Retry-After, X-Request-Id',
}

function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  })
}

function parseIpv4(value: string): ParsedAddress | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null

  const octets = parts.map((part) => {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null
    const octet = Number(part)
    return octet <= 255 ? octet : null
  })
  if (octets.some((octet) => octet === null)) return null

  const normalized = octets.join('.')
  return {
    exact: normalized,
    network: `${octets[0]}.${octets[1]}.${octets[2]}.0/24`,
  }
}

function ipv6Parts(value: string): number[] | null {
  if (
    value.length === 0 ||
    value.includes('%') ||
    value.startsWith('[') ||
    value.endsWith(']')
  ) {
    return null
  }

  let normalized = value.toLowerCase()
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':')
    if (lastColon < 0) return null
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1))
    if (!ipv4) return null
    const octets = ipv4.exact.split('.').map(Number)
    normalized = `${normalized.slice(0, lastColon)}:${(
      octets[0] * 256 +
      octets[1]
    ).toString(16)}:${(octets[2] * 256 + octets[3]).toString(16)}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return null

  const parseHalf = (half: string) => {
    if (half === '') return []
    const parts = half.split(':')
    if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
    return parts.map((part) => Number.parseInt(part, 16))
  }

  const left = parseHalf(halves[0])
  const right = parseHalf(halves[1] ?? '')
  if (!left || !right) return null

  if (halves.length === 1) {
    return left.length === 8 ? left : null
  }

  const missing = 8 - left.length - right.length
  if (missing < 1) return null
  return [...left, ...Array<number>(missing).fill(0), ...right]
}

function parseIpAddress(value: string): ParsedAddress | null {
  const trimmed = value.trim()
  const ipv4 = parseIpv4(trimmed)
  if (ipv4) return ipv4

  const parts = ipv6Parts(trimmed)
  if (!parts) return null

  const isIpv4Mapped =
    parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff
  if (isIpv4Mapped) {
    return parseIpv4(
      [parts[6] >> 8, parts[6] & 0xff, parts[7] >> 8, parts[7] & 0xff].join(
        '.',
      ),
    )
  }

  const normalized = parts.map((part) => part.toString(16)).join(':')
  const network = [...parts.slice(0, 4), 0, 0, 0, 0]
    .map((part) => part.toString(16))
    .join(':')
  return { exact: normalized, network: `${network}/64` }
}

export function extractTrustedClientAddress(
  headers: Headers,
): ParsedAddress | null {
  // Supabase's hosted edge runs behind Cloudflare. CF-Connecting-IP is set on
  // Cloudflare-to-origin traffic; X-Forwarded-For is deliberately ignored
  // because an incoming chain can contain caller-controlled entries.
  const value = headers.get('cf-connecting-ip')
  if (!value || value.includes(',')) return null
  return parseIpAddress(value)
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
    encoder.encode(`probation-rate-limit-v1\0${domain}\0${value}`),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return false
    }
    return (
      url.hostname === 'fcm.googleapis.com' ||
      url.hostname === 'updates.push.services.mozilla.com' ||
      url.hostname === 'push.services.mozilla.com' ||
      url.hostname === 'web.push.apple.com' ||
      /^[a-z0-9-]+[.]notify[.]windows[.]com$/.test(url.hostname)
    )
  } catch {
    return false
  }
}

function validateSubmission(value: unknown): ValidatedSubmission | null {
  if (!isRecord(value) || !isRecord(value.subscription)) return null

  const fullName =
    typeof value.fullName === 'string' ? value.fullName.trim() : ''
  const email =
    typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  const motivation =
    typeof value.motivation === 'string' ? value.motivation.trim() : ''
  const endpoint =
    typeof value.subscription.endpoint === 'string'
      ? value.subscription.endpoint.trim()
      : ''
  const p256dh =
    typeof value.subscription.p256dh === 'string'
      ? value.subscription.p256dh.trim()
      : ''
  const auth =
    typeof value.subscription.auth === 'string'
      ? value.subscription.auth.trim()
      : ''

  if (
    fullName.length === 0 ||
    fullName.length > 200 ||
    email.length === 0 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(email) ||
    motivation.length === 0 ||
    motivation.length > 5000 ||
    endpoint.length === 0 ||
    endpoint.length > 2048 ||
    !allowedPushEndpoint(endpoint) ||
    p256dh.length === 0 ||
    p256dh.length > 256 ||
    auth.length === 0 ||
    auth.length > 256
  ) {
    return null
  }

  return {
    fullName,
    email,
    motivation,
    subscription: { endpoint, p256dh, auth },
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
    return validateSubmission(JSON.parse(text))
  } catch {
    return null
  }
}

export function createSubmissionHandler({
  secret,
  submit,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random,
  reportError = () => undefined,
}: SubmissionDependencies) {
  return async (request: Request) => {
    const requestId = crypto.randomUUID()

    if (request.method === 'OPTIONS') {
      return new Response('ok', {
        headers: { ...corsHeaders, 'X-Request-Id': requestId },
      })
    }
    if (request.method !== 'POST') {
      return jsonResponse({ code: 'method_not_allowed' }, 405, requestId, {
        Allow: 'POST, OPTIONS',
      })
    }

    const address = extractTrustedClientAddress(request.headers)
    if (!address) {
      reportError(requestId, 'trusted_network_signal_unavailable')
      return jsonResponse({ code: 'temporarily_unavailable' }, 503, requestId)
    }

    let submission: ValidatedSubmission | null
    try {
      submission = await parseRequestBody(request)
    } catch {
      submission = null
    }
    if (!submission) {
      return jsonResponse({ code: 'invalid_request' }, 400, requestId)
    }

    const startedAt = performance.now()
    try {
      const [exactIpHash, networkHash, emailHash] = await Promise.all([
        hmacSignal(secret, 'exact-ip', address.exact),
        hmacSignal(secret, 'network', address.network),
        hmacSignal(secret, 'email', submission.email),
      ])
      const result = await submit({
        applicant_full_name: submission.fullName,
        applicant_email: submission.email,
        applicant_motivation: submission.motivation,
        push_endpoint: submission.subscription.endpoint,
        push_p256dh: submission.subscription.p256dh,
        push_auth: submission.subscription.auth,
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
          { 'Retry-After': String(retryAfter) },
        )
      }
      if (result.submission_outcome !== 'accepted') {
        throw new Error('unexpected_submission_outcome')
      }

      // A real insert and an allowed/pending no-op intentionally share status,
      // body and response-time class to avoid turning the form into an e-mail
      // membership oracle.
      const targetDuration =
        MIN_ACCEPTED_RESPONSE_MS +
        Math.floor(random() * ACCEPTED_RESPONSE_JITTER_MS)
      const remaining = targetDuration - (performance.now() - startedAt)
      if (remaining > 0) await sleep(remaining)

      return jsonResponse({ accepted: true }, 202, requestId)
    } catch {
      reportError(requestId, 'submission_backend_failure')
      return jsonResponse({ code: 'temporarily_unavailable' }, 503, requestId)
    }
  }
}
