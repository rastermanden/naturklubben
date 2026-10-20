/**
 * Fejlkoder fra V2's Convex-funktioner og fra Convex Auth, oversat til
 * danske beskeder.
 *
 * Backend'en kaster `ConvexError` med en fast streng (se `convex/members.ts`),
 * fordi en almindelig fejlbesked sløres i produktion. `errorCode` læser den
 * streng ud, og `toFriendlyAuthError` oversætter den. Ukendte fejl ender i en
 * generisk sætning: Convex Auth's egne tekster er ikke en del af en kontrakt,
 * så de kan ikke oversættes ord for ord uden at gætte.
 */

/** Fejlkoden fra en `ConvexError`, eller fejlens besked, hvis der ikke er en. */
export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: unknown }).data
    if (typeof data === 'string') return data
  }
  if (error instanceof Error) return error.message
  return null
}

/** De koder, backend'en selv kaster. Se `convex/authz.ts` og `convex/members.ts`. */
const KNOWN_CODES: Record<string, string> = {
  EMAIL_NOT_ALLOWED: 'Denne e-mailadresse er ikke inviteret til Naturklubben.',
  NOT_AUTHENTICATED: 'Du er ikke logget ind. Log ind og prøv igen.',
  NOT_A_MEMBER: 'Din konto er endnu ikke medlem af Naturklubben.',
  INVALID_PROFILE:
    'Noget i profilen kunne ikke gemmes. Tjek felterne og prøv igen.',
  ACCOUNT_DELETION_RESERVED:
    'Din konto er ved at blive slettet, så den kan ikke ændres.',
  NOT_ADMIN: 'Du har ikke længere adgang til denne handling.',
  PROFILE_NOT_FOUND: 'Profilen kunne ikke findes. Genindlæs siden.',
  PROFILE_NOT_CREATED: 'Profilen kunne ikke oprettes. Prøv igen om lidt.',
}

/**
 * Til login, oprettelse og adgangskode-flowene. Kender både vores egne koder
 * og de almindelige fejl fra Convex Auth's adgangskode-provider.
 */
export function toFriendlyAuthError(error: unknown): string {
  const raw = errorCode(error)
  if (raw === null) return 'Der skete en fejl. Prøv igen om lidt.'

  const known = KNOWN_CODES[raw]
  if (known) return known

  const message = raw.toLowerCase()
  if (message.includes('already') || message.includes('exists')) {
    return 'Der findes allerede en bruger med den e-mail.'
  }
  if (
    message.includes('invalid') ||
    message.includes('secret') ||
    message.includes('credentials')
  ) {
    return 'Forkert e-mail eller adgangskode.'
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
