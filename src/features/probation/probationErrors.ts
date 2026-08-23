export type ProbationSubmissionErrorCode =
  'invalid_request' | 'rate_limited' | 'temporarily_unavailable'

export class ProbationSubmissionError extends Error {
  readonly code: ProbationSubmissionErrorCode
  readonly retryAfterSeconds?: number

  constructor(code: ProbationSubmissionErrorCode, retryAfterSeconds?: number) {
    super(code)
    this.name = 'ProbationSubmissionError'
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function toProbationSubmissionError(
  error: unknown,
): Promise<Error> {
  if (!isRecord(error) || !(error.context instanceof Response)) {
    return error instanceof Error
      ? error
      : new ProbationSubmissionError('temporarily_unavailable')
  }

  let payload: unknown
  try {
    payload = await error.context.clone().json()
  } catch {
    payload = null
  }

  const code =
    isRecord(payload) && typeof payload.code === 'string' ? payload.code : ''
  if (error.context.status === 429 && code === 'rate_limited') {
    const retryAfterSeconds =
      isRecord(payload) && typeof payload.retryAfterSeconds === 'number'
        ? payload.retryAfterSeconds
        : Number(error.context.headers.get('Retry-After'))
    return new ProbationSubmissionError(
      'rate_limited',
      Number.isFinite(retryAfterSeconds)
        ? Math.max(1, retryAfterSeconds)
        : undefined,
    )
  }
  if (error.context.status === 400 && code === 'invalid_request') {
    return new ProbationSubmissionError('invalid_request')
  }
  return new ProbationSubmissionError('temporarily_unavailable')
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

export function toFriendlyProbationApplicationError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : ''

  if (code === 'rate_limited') {
    const retryAfterSeconds =
      error instanceof ProbationSubmissionError
        ? error.retryAfterSeconds
        : undefined
    return `Der er sendt for mange ansøgninger. Prøv igen ${retryDescription(retryAfterSeconds)}.`
  }
  if (code === 'temporarily_unavailable')
    return 'Ansøgningen kan ikke sendes lige nu. Prøv igen om lidt.'
  if (code === 'invalid_request')
    return 'Kontrollér felterne og notifikationstilladelsen, og prøv igen.'
  if (code === '42501')
    return 'Du har ikke rettigheder til at behandle ansøgningen.'
  if (code === 'P0002')
    return 'Ansøgningen blev ikke fundet. Opdater siden og prøv igen.'
  if (code === '22023')
    return 'Alle felter og tilladelse til notifikationer er påkrævet.'
  if (code === '22001')
    return 'Et eller flere felter er for lange. Forkort teksten og prøv igen.'
  if (code === 'PGRST205' || code === '42P01')
    return 'Ansøgninger er ikke slået til i databasen endnu. Kontakt den, der passer appen.'
  if (message) return message
  if (error instanceof Error) return error.message
  return 'Der skete en fejl. Prøv igen om lidt.'
}
