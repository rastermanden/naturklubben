/**
 * Fejlkoderne fra ansøgningsformularen, oversat til noget et menneske kan
 * bruge. Koderne er de samme som `httpAction`'en i `convex/probation.ts`
 * returnerer -- ikke Supabase' SQLSTATE'er, som den gamle app måtte oversætte.
 */
export type ProbationSubmissionErrorCode =
  | 'invalid_request'
  | 'rate_limited'
  | 'temporarily_unavailable'

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

function retryDescription(seconds: number | undefined) {
  if (!seconds) return 'om lidt'
  if (seconds < 90) return 'om cirka et minut'
  if (seconds < 3600) return `om cirka ${Math.ceil(seconds / 60)} minutter`
  const hours = Math.ceil(seconds / 3600)
  return `om cirka ${hours} ${hours === 1 ? 'time' : 'timer'}`
}

export function toFriendlyProbationApplicationError(error: unknown): string {
  const code =
    error instanceof ProbationSubmissionError
      ? error.code
      : typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : ''

  if (code === 'rate_limited') {
    const retryAfterSeconds =
      error instanceof ProbationSubmissionError
        ? error.retryAfterSeconds
        : undefined
    return `Der er sendt for mange ansøgninger. Prøv igen ${retryDescription(retryAfterSeconds)}.`
  }
  if (code === 'temporarily_unavailable') {
    return 'Ansøgningen kan ikke sendes lige nu. Prøv igen om lidt.'
  }
  if (code === 'invalid_request') {
    return 'Kontrollér felterne og notifikationstilladelsen, og prøv igen.'
  }
  if (error instanceof Error && error.message) return error.message
  return 'Der skete en fejl. Prøv igen om lidt.'
}
