// Fejl fra gæsteformularen (#224). Edge Functionen svarer med samme koder som
// prøvemedlemskabsformularen plus `event_unavailable`, når begivenheden ikke
// (længere) er åben.

export type GuestRequestErrorCode =
  | 'invalid_request'
  | 'rate_limited'
  | 'event_unavailable'
  | 'temporarily_unavailable'

export class GuestRequestError extends Error {
  readonly code: GuestRequestErrorCode
  readonly retryAfterSeconds?: number

  constructor(code: GuestRequestErrorCode, retryAfterSeconds?: number) {
    super(code)
    this.name = 'GuestRequestError'
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function toGuestRequestError(error: unknown): Promise<Error> {
  if (!isRecord(error) || !(error.context instanceof Response)) {
    return error instanceof Error
      ? error
      : new GuestRequestError('temporarily_unavailable')
  }

  let payload: unknown
  try {
    payload = await error.context.clone().json()
  } catch {
    payload = null
  }

  const code =
    isRecord(payload) && typeof payload.code === 'string' ? payload.code : ''
  const status = error.context.status
  if (status === 429 && code === 'rate_limited') {
    const retryAfterSeconds =
      isRecord(payload) && typeof payload.retryAfterSeconds === 'number'
        ? payload.retryAfterSeconds
        : Number(error.context.headers.get('Retry-After'))
    return new GuestRequestError(
      'rate_limited',
      Number.isFinite(retryAfterSeconds)
        ? Math.max(1, retryAfterSeconds)
        : undefined,
    )
  }
  if (status === 400 && code === 'invalid_request') {
    return new GuestRequestError('invalid_request')
  }
  if (status === 404 && code === 'event_unavailable') {
    return new GuestRequestError('event_unavailable')
  }
  return new GuestRequestError('temporarily_unavailable')
}

function retryDescription(seconds: number | undefined) {
  if (!seconds) return 'om lidt'
  if (seconds < 90) return 'om cirka et minut'
  if (seconds < 3600) {
    return `om cirka ${Math.ceil(seconds / 60)} minutter`
  }
  const hours = Math.ceil(seconds / 3600)
  return `om cirka ${hours} ${hours === 1 ? 'time' : 'timer'}`
}

export function toFriendlyGuestRequestError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  if (code === 'rate_limited') {
    const retryAfterSeconds =
      error instanceof GuestRequestError ? error.retryAfterSeconds : undefined
    return `Der er sendt for mange ansøgninger. Prøv igen ${retryDescription(retryAfterSeconds)}.`
  }
  if (code === 'event_unavailable')
    return 'Begivenheden tager ikke længere imod ansøgninger.'
  if (code === 'invalid_request')
    return 'Kontrollér navn, e-mail og antal personer, og prøv igen.'
  if (code === 'temporarily_unavailable')
    return 'Ansøgningen kan ikke sendes lige nu. Prøv igen om lidt.'
  return 'Der skete en fejl. Prøv igen om lidt.'
}

/** Fejl fra arrangørens godkend/afvis-RPC'er. */
export function toFriendlyGuestDecisionError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  if (code === '42501')
    return 'Kun arrangøren eller en admin kan afgøre ansøgningen.'
  if (code === 'P0002')
    return 'Ansøgningen er allerede afgjort eller findes ikke længere.'
  if (code === 'PGRST205' || code === '42P01')
    return 'Gæsteansøgninger er ikke slået til i databasen endnu. Kontakt den, der passer appen.'
  return 'Afgørelsen kunne ikke gemmes. Prøv igen om lidt.'
}
