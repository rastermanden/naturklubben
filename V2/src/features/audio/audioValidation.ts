export const MAX_AUDIO_BYTES = 15 * 1024 * 1024
export const MAX_AUDIO_TITLE_LENGTH = 120

const ALLOWED_AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3'])

function normalizedMime(type: string): string {
  return type.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

export function isSupportedMp3File(file: Pick<File, 'name' | 'type'>): boolean {
  const mime = normalizedMime(file.type)
  if (mime !== '') {
    return ALLOWED_AUDIO_MIME_TYPES.has(mime)
  }
  // Nogle mobile filvælgere rapporterer tom MIME-type for .mp3-filer.
  return file.name.trim().toLowerCase().endsWith('.mp3')
}

export function uploadMimeForFile(file: Pick<File, 'type'>): string {
  const mime = normalizedMime(file.type)
  if (ALLOWED_AUDIO_MIME_TYPES.has(mime)) {
    return mime
  }
  return 'audio/mpeg'
}

export function validateAudioFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
): string | null {
  if (!isSupportedMp3File(file)) {
    return 'Kun mp3-filer kan lægges op.'
  }
  if (file.size <= 0) {
    return 'Filen er tom.'
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return 'Filen er for stor. Maksimum er 15 MB.'
  }
  return null
}

export function defaultTitleFromFilename(fileName: string): string {
  const trimmed = fileName.trim()
  const withoutExtension = trimmed.replace(/\.[^./\\]+$/, '')
  return withoutExtension.trim().slice(0, MAX_AUDIO_TITLE_LENGTH)
}

export function validateAudioTitle(title: string): string | null {
  const trimmed = title.trim()
  if (trimmed.length === 0) {
    return 'Skriv en titel.'
  }
  if (trimmed.length > MAX_AUDIO_TITLE_LENGTH) {
    return `Titlen må højst være ${MAX_AUDIO_TITLE_LENGTH} tegn.`
  }
  return null
}

const audioDateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function formatAudioDate(timestampMs: number): string {
  return audioDateFormatter.format(new Date(timestampMs))
}

const decimalFormatter = new Intl.NumberFormat('da-DK', {
  maximumFractionDigits: 1,
})

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${decimalFormatter.format(bytes / (1024 * 1024))} MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${bytes} B`
}
