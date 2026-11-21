import { errorCode } from '../auth/authErrors'

const KNOWN_CODES: Record<string, string> = {
  AUDIO_NOT_MP3: 'Kun mp3-filer kan lægges op.',
  AUDIO_EMPTY: 'Filen er tom.',
  AUDIO_TOO_LARGE: 'Filen er for stor. Maksimum er 15 MB.',
  AUDIO_TITLE_REQUIRED: 'Skriv en titel.',
  AUDIO_TITLE_TOO_LONG: 'Titlen må højst være 120 tegn.',
  AUDIO_UPLOAD_NOT_FOUND: 'Lydfilen kunne ikke gemmes. Prøv igen.',
  AUDIO_NOT_FOUND: 'Lydfilen findes ikke længere.',
  AUDIO_DELETE_NOT_AUTHORIZED: 'Du kan kun slette dine egne lydfiler.',
  ACCOUNT_DELETION_RESERVED:
    'Din konto er ved at blive slettet, så du kan ikke ændre lydfiler.',
  NOT_A_MEMBER: 'Du skal være logget ind som medlem.',
}

/** Oversætter fejlkoder fra lyd-mutationerne til danske sætninger. */
export function audioErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && KNOWN_CODES[error]) {
    return KNOWN_CODES[error]
  }
  const code = errorCode(error)
  if (code !== null && KNOWN_CODES[code]) {
    return KNOWN_CODES[code]
  }
  return fallback
}
