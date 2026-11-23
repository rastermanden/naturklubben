/**
 * Fejlkoder fra V2's Convex-funktioner og fra `@convex-dev/auth` 2.x,
 * oversat til danske beskeder.
 */

export type AuthUserError = {
  error: string
  minimumLength?: number
  maximumLength?: number
  retryAfterMs?: number
}

/** Fejlkoden fra en `ConvexError`, eller fejlens besked, hvis der ikke er en. */
export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: unknown }).data
    if (typeof data === 'string') return data
  }
  if (error instanceof Error) return error.message
  return null
}

/** De koder, backend'en selv returnerer eller kaster. */
const KNOWN_CODES: Record<string, string> = {
  EMAIL_NOT_ALLOWED: 'Denne e-mailadresse er ikke inviteret til Naturklubben.',
  EMAIL_TAKEN: 'Der findes allerede en bruger med den e-mail.',
  INVALID_EMAIL: 'Skriv en gyldig e-mailadresse.',
  EMAIL_NOT_FOUND: 'Ingen bruger med den e-mailadresse.',
  USER_NOT_FOUND: 'Forkert e-mail eller adgangskode.',
  NOT_AUTHENTICATED: 'Du er ikke logget ind. Log ind og prøv igen.',
  NOT_LOGGED_IN: 'Du er ikke logget ind. Log ind og prøv igen.',
  NOT_A_MEMBER: 'Din konto er endnu ikke medlem af Naturklubben.',
  INVALID_PROFILE:
    'Noget i profilen kunne ikke gemmes. Tjek felterne og prøv igen.',
  ACCOUNT_DELETION_RESERVED:
    'Din konto er ved at blive slettet, så den kan ikke ændres.',
  PASSWORD_TOO_SHORT: 'Adgangskoden skal være på mindst 10 tegn.',
  PASSWORD_TOO_LONG: 'Adgangskoden må højst være på 100 tegn.',
  PASSWORD_HAS_SURROUNDING_WHITESPACE:
    'Adgangskoden må ikke starte eller slutte med mellemrum.',
  PASSWORD_TOO_COMMON:
    'Adgangskoden er for almindelig. Vælg en stærkere adgangskode.',
  MISSING_SECRET:
    'Åbn linket i den samme browser, hvor du begyndte. Prøv igen derfra.',
  INVALID_CHALLENGE: 'Linket er udløbet eller allerede brugt.',
  INCORRECT_CODE: 'Linket er ugyldigt eller allerede brugt.',
  WRONG_USER: 'Linket hører til en anden bruger.',
  AUTH_EMAIL_NOT_SENT: 'Mailen kunne ikke sendes. Prøv igen om lidt.',
  NOT_ADMIN: 'Du har ikke længere adgang til denne handling.',
  PROFILE_NOT_FOUND: 'Profilen kunne ikke findes. Genindlæs siden.',
  PROFILE_NOT_CREATED: 'Profilen kunne ikke oprettes. Prøv igen om lidt.',
  AVATAR_NOT_AN_IMAGE: 'Filen er ikke et billede.',
  AVATAR_TOO_LARGE: 'Billedet er for stort (maks. 5 MB).',
  AVATAR_UPLOAD_NOT_FOUND: 'Billedet kunne ikke gemmes. Prøv igen.',
  AVATAR_ENCODE: 'Billedet kunne ikke behandles. Prøv et andet.',
  INVALID_CREDENTIALS: 'Forkert e-mail eller adgangskode.',
  RATE_LIMITED:
    'Der er forsøgt for mange gange på kort tid. Prøv igen om lidt.',
  PREVIEW_AUTH_UNAVAILABLE:
    'Kunne ikke tjekke dit login lige nu. Prøv igen om lidt.',
}

export function userErrorToAuthError(userError: AuthUserError): string {
  if (userError.error === 'PASSWORD_TOO_SHORT') {
    const min = userError.minimumLength ?? 10
    return `Adgangskoden skal være på mindst ${min} tegn.`
  }
  if (userError.error === 'PASSWORD_TOO_LONG') {
    const max = userError.maximumLength ?? 100
    return `Adgangskoden må højst være på ${max} tegn.`
  }
  const known = KNOWN_CODES[userError.error]
  if (known) return known
  return toFriendlyAuthError({ data: userError.error })
}

/**
 * Til login, oprettelse og adgangskode-flowene.
 */
export function toFriendlyAuthError(error: unknown): string {
  const raw = errorCode(error)
  if (raw === null) return 'Der skete en fejl. Prøv igen om lidt.'

  const known = KNOWN_CODES[raw]
  if (known) return known

  const message = raw.toLowerCase()
  if (
    message.includes('already') ||
    message.includes('exists') ||
    message.includes('email_taken')
  ) {
    return 'Der findes allerede en bruger med den e-mail.'
  }
  if (
    message.includes('invalid') ||
    message.includes('secret') ||
    message.includes('credentials')
  ) {
    return 'Forkert e-mail eller adgangskode.'
  }
  if (
    message.includes('at least 10') ||
    message.includes('at least 6') ||
    message.includes('password_too_short')
  ) {
    return KNOWN_CODES.PASSWORD_TOO_SHORT
  }
  if (message.includes('auth_email_not_sent')) {
    return 'Mailen kunne ikke sendes. Prøv igen om lidt.'
  }
  if (message.includes('email_not_allowed')) {
    return KNOWN_CODES.EMAIL_NOT_ALLOWED
  }
  if (message.includes('password')) {
    return 'Adgangskoden opfylder ikke kravene.'
  }
  if (message.includes('rate') || message.includes('too many')) {
    return 'Der er forsøgt for mange gange på kort tid. Prøv igen om lidt.'
  }

  return 'Der skete en fejl. Prøv igen om lidt.'
}

/** Til profil-, medlems- og adminsiderne, hvor fejlen oftest er en af vores koder. */
export function toFriendlyMemberError(error: unknown): string {
  const raw = errorCode(error)
  if (raw !== null) {
    const known = KNOWN_CODES[raw]
    if (known) return known
  }
  return 'Handlingen kunne ikke gennemføres. Prøv igen om lidt.'
}
