import { handleCors } from '../_shared/cors.ts'

const MAX_BODY_BYTES = 16_384
const MAX_REPORTS_PER_MINUTE = 20
const MAX_TRACKED_CLIENTS = 10_000
const encoder = new TextEncoder()

export interface ClientErrorReport {
  source:
    'react-global' | 'react-route' | 'window-error' | 'unhandled-rejection'
  message: string
  stack?: string
  componentStack?: string
  url: string
  userAgent: string
  occurredAt: string
}

interface HandlerDependencies {
  writeReport: (report: ClientErrorReport) => void
  getClientKey: (request: Request) => string | null
  now?: () => number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(
  value: unknown,
  maxLength: number,
): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === 'string' && value.length <= maxLength)
  )
}

export function isClientErrorReport(
  value: unknown,
): value is ClientErrorReport {
  if (!isRecord(value)) return false

  return (
    (value.source === 'react-global' ||
      value.source === 'react-route' ||
      value.source === 'window-error' ||
      value.source === 'unhandled-rejection') &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    value.message.length <= 1_000 &&
    optionalString(value.stack, 8_000) &&
    optionalString(value.componentStack, 4_000) &&
    typeof value.url === 'string' &&
    value.url.length > 0 &&
    value.url.length <= 2_048 &&
    typeof value.userAgent === 'string' &&
    value.userAgent.length <= 512 &&
    typeof value.occurredAt === 'string' &&
    !Number.isNaN(Date.parse(value.occurredAt))
  )
}

export function createClientErrorHandler({
  writeReport,
  getClientKey,
  now = Date.now,
}: HandlerDependencies) {
  const clientWindows = new Map<
    string,
    { windowStartedAt: number; reportsInWindow: number }
  >()

  return async (request: Request) => {
    const cors = handleCors(request, { methods: ['POST'] })
    if (cors.response) return cors.response

    if (!request.headers.has('Origin')) {
      return new Response(JSON.stringify({ code: 'origin_required' }), {
        status: 403,
        headers: cors.headers,
      })
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ code: 'method_not_allowed' }), {
        status: 405,
        headers: cors.headers,
      })
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ code: 'payload_too_large' }), {
        status: 413,
        headers: cors.headers,
      })
    }

    const body = await request.text()
    if (encoder.encode(body).byteLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ code: 'payload_too_large' }), {
        status: 413,
        headers: cors.headers,
      })
    }

    let report: unknown
    try {
      report = JSON.parse(body)
    } catch {
      return new Response(JSON.stringify({ code: 'invalid_report' }), {
        status: 400,
        headers: cors.headers,
      })
    }

    if (!isClientErrorReport(report)) {
      return new Response(JSON.stringify({ code: 'invalid_report' }), {
        status: 400,
        headers: cors.headers,
      })
    }

    const clientKey = getClientKey(request)
    if (!clientKey) {
      return new Response(JSON.stringify({ code: 'client_unavailable' }), {
        status: 400,
        headers: cors.headers,
      })
    }

    const currentTime = now()
    const existingWindow = clientWindows.get(clientKey)
    if (!existingWindow && clientWindows.size >= MAX_TRACKED_CLIENTS) {
      for (const [key, value] of clientWindows) {
        if (currentTime - value.windowStartedAt >= 60_000) {
          clientWindows.delete(key)
        }
      }
    }
    const clientWindow =
      !existingWindow || currentTime - existingWindow.windowStartedAt >= 60_000
        ? { windowStartedAt: currentTime, reportsInWindow: 0 }
        : existingWindow

    if (
      (!existingWindow && clientWindows.size >= MAX_TRACKED_CLIENTS) ||
      clientWindow.reportsInWindow >= MAX_REPORTS_PER_MINUTE
    ) {
      return new Response(JSON.stringify({ code: 'rate_limited' }), {
        status: 429,
        headers: cors.headers,
      })
    }
    clientWindow.reportsInWindow += 1
    clientWindows.set(clientKey, clientWindow)

    writeReport(report)
    return new Response(null, { status: 204, headers: cors.headers })
  }
}
