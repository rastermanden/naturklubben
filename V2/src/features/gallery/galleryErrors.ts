import { errorCode } from '../auth/authErrors'

const KNOWN_CODES: Record<string, string> = {
  NOT_PHOTO_OWNER: 'Du kan kun ændre dine egne billeder.',
  PHOTO_NOT_FOUND: 'Filen findes ikke længere.',
  PHOTO_NOT_AN_IMAGE: 'Filen er ikke et billede.',
  PHOTO_TOO_LARGE: 'Billedet er for stort. Maksimum er 15 MB.',
  PHOTO_CAPTION_TOO_LONG: 'Billedteksten må højst være 500 tegn.',
  PHOTO_EVENT_NOT_FOUND: 'Begivenheden findes ikke længere. Vælg en anden.',
  TOO_MANY_PHOTOS: 'Du kan højst flytte 100 filer ad gangen.',
  VIDEO_UPLOAD_NOT_FOUND: 'Videoen kunne ikke gemmes. Prøv igen.',
  VIDEO_UNSUPPORTED_TYPE:
    'Videoen kan ikke lægges op. Brug mp4, webm eller mov.',
  VIDEO_EMPTY: 'Filen er tom.',
  VIDEO_TOO_LARGE: 'Videoen er for stor. Maksimum er 50 MB.',
  VIDEO_THUMBNAIL_INVALID: 'Videoens miniature kunne ikke gemmes.',
  VIDEO_THUMBNAIL_TOO_LARGE: 'Videoens miniature er for stor.',
  NOT_A_MEMBER: 'Du skal være logget ind som medlem.',
  ACCOUNT_DELETION_RESERVED:
    'Din konto er ved at blive slettet, så du kan ikke ændre galleriet.',
}

/** Oversætter fejlkoder fra galleriets mutationer til danske sætninger. */
export function galleryErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && KNOWN_CODES[error]) {
    return KNOWN_CODES[error]
  }
  const code = errorCode(error)
  if (code !== null && KNOWN_CODES[code]) {
    return KNOWN_CODES[code]
  }
  return fallback
}
