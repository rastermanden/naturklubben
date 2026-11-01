// naturklubben.dk er appens adresse. Den gamle GitHub Pages-adresse står her
// stadig, så den installerede app på rastermanden.github.io virker, mens
// medlemmerne flytter over; den kan fjernes, når ingen bruger den længere.
const PRODUCTION_ORIGINS = new Set([
  'https://naturklubben.dk',
  'https://rastermanden.github.io',
])
const DEFAULT_ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type'

export interface CorsOptions {
  methods: string[]
  exposeHeaders?: string[]
}

export interface CorsResult {
  headers: Headers
  response: Response | null
}

function configuredOrigins() {
  try {
    return Deno.env.get('CORS_ALLOWED_ORIGINS') ?? ''
  } catch {
    return ''
  }
}

function exactOrigin(value: string) {
  try {
    const url = new URL(value)
    return value === url.origin ? url : null
  } catch {
    return null
  }
}

export function isAllowedCorsOrigin(
  origin: string,
  additionalOrigins = configuredOrigins(),
) {
  const url = exactOrigin(origin)
  if (!url) return false

  if (PRODUCTION_ORIGINS.has(origin)) return true

  if (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    (url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]')
  ) {
    return true
  }

  return additionalOrigins
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .some((candidate) => exactOrigin(candidate)?.origin === origin)
}

export function handleCors(
  request: Request,
  options: CorsOptions,
  additionalOrigins = configuredOrigins(),
): CorsResult {
  const origin = request.headers.get('Origin')
  const headers = new Headers({
    'Access-Control-Allow-Headers': DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': [
      ...new Set([...options.methods, 'OPTIONS']),
    ].join(', '),
    Vary: 'Origin',
  })

  if (options.exposeHeaders?.length) {
    headers.set(
      'Access-Control-Expose-Headers',
      options.exposeHeaders.join(', '),
    )
  }

  if (origin) {
    if (!isAllowedCorsOrigin(origin, additionalOrigins)) {
      return {
        headers,
        response: new Response(JSON.stringify({ code: 'origin_not_allowed' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            Vary: 'Origin',
          },
        }),
      }
    }
    headers.set('Access-Control-Allow-Origin', origin)
  }

  return {
    headers,
    response:
      request.method === 'OPTIONS'
        ? new Response(null, { status: 204, headers })
        : null,
  }
}
