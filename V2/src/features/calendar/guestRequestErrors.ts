// Fejl fra kalenderen og gæsteformularen.
//
// To slags fejl møder brugeren her:
//
// 1. Backend-mutationerne kaster faste koder (`NOT_EVENT_MANAGER`,
//    `EVENT_ENDS_BEFORE_START`, ...), som `convex/authz.ts` gør det. Koden
//    findes i fejlens besked, fordi Convex pakker serverfejl ind -- derfor ledes
//    der efter kendte koder frem for at vise rå tekst.
// 2. Gæsteformularen går gennem HTTP-ruten `POST /calendar/guest-request`, som
//    svarer med `{ code, retryAfterSeconds }`.

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

/** Oversætter HTTP-rutens svar til en fejl, formularen kan vise. */
export async function toGuestRequestError(
  response: Response,
): Promise<GuestRequestError> {
  let payload: unknown
  try {
    payload = await response.clone().json()
  } catch {
    payload = null
  }

  const code =
    isRecord(payload) && typeof payload.code === 'string' ? payload.code : ''

  if (response.status === 429 && code === 'rate_limited') {
    const retryAfterSeconds =
      isRecord(payload) && typeof payload.retryAfterSeconds === 'number'
        ? payload.retryAfterSeconds
        : Number(response.headers.get('Retry-After'))
    return new GuestRequestError(
      'rate_limited',
      Number.isFinite(retryAfterSeconds)
        ? Math.max(1, retryAfterSeconds)
        : undefined,
    )
  }
  if (response.status === 400 && code === 'invalid_request') {
    return new GuestRequestError('invalid_request')
  }
  if (response.status === 404 && code === 'event_unavailable') {
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
  if (error instanceof GuestRequestError) {
    if (error.code === 'rate_limited') {
      return `Der er sendt for mange ansøgninger. Prøv igen ${retryDescription(error.retryAfterSeconds)}.`
    }
    if (error.code === 'event_unavailable') {
      return 'Begivenheden tager ikke længere imod ansøgninger.'
    }
    if (error.code === 'invalid_request') {
      return 'Kontrollér navn, e-mail og antal personer, og prøv igen.'
    }
    return 'Ansøgningen kan ikke sendes lige nu. Prøv igen om lidt.'
  }
  return 'Der skete en fejl. Prøv igen om lidt.'
}

/** Findes en af backendens faste koder i fejlen? */
function hasCode(error: unknown, ...codes: string[]): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? '')
  return codes.some((code) => message.includes(code))
}

/** Fejl fra en mutation i `convex/calendar.ts`, oversat til dansk. */
export function toFriendlyCalendarError(error: unknown): string {
  if (hasCode(error, 'NOT_A_MEMBER')) {
    return 'Du skal være logget ind som medlem.'
  }
  if (hasCode(error, 'ACCOUNT_DELETION_RESERVED')) {
    return 'Din konto er ved at blive slettet, så den kan ikke ændres.'
  }
  if (hasCode(error, 'NOT_EVENT_MANAGER')) {
    return 'Kun arrangøren eller en admin kan gøre det.'
  }
  if (hasCode(error, 'NOT_EVENT_OWNER')) {
    return 'Kun den, der oprettede begivenheden, kan slette den.'
  }
  if (hasCode(error, 'EVENT_NOT_FOUND')) {
    return 'Begivenheden findes ikke længere.'
  }
  if (hasCode(error, 'EVENT_ENDS_BEFORE_START')) {
    return 'Sluttidspunktet må ikke være før starttidspunktet.'
  }
  if (hasCode(error, 'EVENT_CAP_INVALID')) {
    return 'Antal pladser skal være et helt tal på mindst 1.'
  }
  if (hasCode(error, 'EVENT_TITLE_INVALID')) {
    return 'Titel skal være udfyldt og højst 120 tegn.'
  }
  if (hasCode(error, 'TASK_TITLE_INVALID')) {
    return 'Opgaven skal have en titel.'
  }
  if (hasCode(error, 'TASK_ALREADY_CLAIMED')) {
    return 'En anden har allerede meldt sig til opgaven.'
  }
  if (hasCode(error, 'TASK_NOT_YOURS')) {
    return 'Det er ikke din opgave.'
  }
  if (hasCode(error, 'NOT_TASK_CREATOR')) {
    return 'Kun den, der oprettede opgaven, kan slette den.'
  }
  if (hasCode(error, 'GUEST_REQUEST_DECIDED')) {
    return 'Ansøgningen er allerede afgjort eller findes ikke længere.'
  }
  if (hasCode(error, 'GUEST_REQUEST_NOT_FOUND')) {
    return 'Ansøgningen findes ikke længere.'
  }
  if (hasCode(error, 'NOT_ADMIN')) {
    return 'Kun admins kan ændre aktiviteterne.'
  }
  return 'Handlingen kunne ikke gennemføres. Prøv igen om lidt.'
}
