import { QueryCache, QueryClient, type Query } from '@tanstack/react-query'

const QUERY_STALE_TIME_MS = 30_000
const MAX_QUERY_RETRIES = 2
const RETRYABLE_CLIENT_STATUSES = new Set([408, 425, 429])

type ErrorRecord = Record<string, unknown>

function isErrorRecord(value: unknown): value is ErrorRecord {
  return typeof value === 'object' && value !== null
}

function directStatusFrom(value: unknown): number | undefined {
  if (!isErrorRecord(value)) return undefined

  for (const property of ['status', 'statusCode'] as const) {
    const status = value[property]
    if (typeof status === 'number') return status
  }

  return undefined
}

function statusFrom(value: unknown): number | undefined {
  const directStatus = directStatusFrom(value)
  if (directStatus !== undefined || !isErrorRecord(value)) {
    return directStatus
  }

  for (const property of ['context', 'response'] as const) {
    const status = directStatusFrom(value[property])
    if (status !== undefined) return status
  }

  return undefined
}

function errorCode(error: unknown): string | undefined {
  if (!isErrorRecord(error)) return undefined

  const code = error.code
  return typeof code === 'string' ? code.toUpperCase() : undefined
}

export function isPermanentClientError(error: unknown): boolean {
  const status = statusFrom(error)
  if (status !== undefined) {
    return (
      status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status)
    )
  }

  const code = errorCode(error)
  if (!code) return false

  const customStatus = /^PT(\d{3})$/.exec(code)
  if (customStatus) {
    return isPermanentClientError({ status: Number(customStatus[1]) })
  }

  // PostgREST exposes the HTTP status through its error code rather than the
  // JavaScript error object. API request/schema errors and invalid JWTs map to
  // permanent 4xx responses; connection and server errors do not.
  if (/^PGRST(?:111|112|121|300)$/.test(code)) return false
  if (/^PGRST[12]\d{2}$/.test(code) || /^PGRST30[12]$/.test(code)) {
    return true
  }

  // SQLSTATE classes mapped by PostgREST to 4xx responses.
  return (
    code !== '42P17' &&
    (/^(?:0L|0P|22|23|28|42)/.test(code) ||
      code === '25006' ||
      code === 'P0001')
  )
}

export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  return failureCount < MAX_QUERY_RETRIES && !isPermanentClientError(error)
}

function reportQueryError(
  error: unknown,
  query: Query<unknown, unknown>,
): void {
  const queryName =
    typeof query.queryKey[0] === 'string' ? query.queryKey[0] : 'unknown'

  console.error('Query fejlede', {
    query: queryName,
    error,
  })
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
      retry: shouldRetryQuery,
    },
  },
  queryCache: new QueryCache({
    onError: reportQueryError,
  }),
})
