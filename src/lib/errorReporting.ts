export type ClientErrorSource =
  'react-global' | 'react-route' | 'window-error' | 'unhandled-rejection'

interface ClientErrorContext {
  source: ClientErrorSource
  componentStack?: string
}

interface ClientErrorReport {
  source: ClientErrorSource
  message: string
  stack?: string
  componentStack?: string
  url: string
  userAgent: string
  occurredAt: string
}

const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-client-error`
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
let globalReportingInstalled = false

function truncate(value: string | undefined, maxLength: number) {
  if (!value) return undefined
  return value.slice(0, maxLength)
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: truncate(error.message, 1_000) ?? 'Ukendt fejl',
      stack: truncate(error.stack, 8_000),
    }
  }

  return {
    message: truncate(
      typeof error === 'string' ? error : String(error),
      1_000,
    )!,
  }
}

export function createClientErrorReport(
  error: unknown,
  context: ClientErrorContext,
): ClientErrorReport {
  const normalized = normalizeError(error)

  return {
    ...normalized,
    source: context.source,
    componentStack: truncate(context.componentStack, 4_000),
    url: `${window.location.origin}${window.location.pathname}`.slice(0, 2_048),
    userAgent: navigator.userAgent.slice(0, 512),
    occurredAt: new Date().toISOString(),
  }
}

export function reportClientError(error: unknown, context: ClientErrorContext) {
  const report = createClientErrorReport(error, context)

  void fetch(functionUrl, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch((reportingError: unknown) => {
    console.error('Kunne ikke rapportere klientfejl', reportingError)
  })
}

export function installGlobalErrorReporting() {
  if (globalReportingInstalled) return
  globalReportingInstalled = true

  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? event.message, { source: 'window-error' })
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, { source: 'unhandled-rejection' })
  })
}
