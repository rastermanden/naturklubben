import { errorCode } from '../auth/authErrors'

const KNOWN_CODES: Record<string, string> = {
  NOT_PHOTO_OWNER: 'Du kan kun ændre dine egne billeder.',
  PHOTO_NOT_FOUND: 'Billedet findes ikke længere.',
  PHOTO_CAPTION_TOO_LONG: 'Billedteksten må højst være 500 tegn.',
  PHOTO_EVENT_NOT_FOUND: 'Begivenheden findes ikke længere. Vælg en anden.',
  TOO_MANY_PHOTOS: 'Du kan højst flytte 100 billeder ad gangen.',
  ACCOUNT_DELETION_RESERVED:
    'Din konto er ved at blive slettet, så du kan ikke ændre billeder.',
}

/** Oversætter fejlkoder fra galleriets mutationer til danske sætninger. */
export function galleryErrorMessage(error: unknown, fallback: string): string {
  const code = errorCode(error)
  if (code !== null && KNOWN_CODES[code]) {
    return KNOWN_CODES[code]
  }
  return fallback
}
