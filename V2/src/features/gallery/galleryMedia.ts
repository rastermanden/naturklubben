export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024

export const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

export const GALLERY_ACCEPT =
  'image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'

export type GalleryMediaKind = 'image' | 'video'

export function normalizeMime(type: string): string {
  return type.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
}

const VIDEO_EXTENSIONS: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
}

function fileExtension(name: string): string {
  const trimmed = name.trim().toLowerCase()
  const dot = trimmed.lastIndexOf('.')
  return dot >= 0 ? trimmed.slice(dot) : ''
}

export function detectGalleryMediaKind(
  file: Pick<File, 'name' | 'type'>,
): { kind: GalleryMediaKind; mimeType: string } | null {
  const mime = normalizeMime(file.type)
  if (mime !== '') {
    if (mime.startsWith('image/')) {
      return { kind: 'image', mimeType: mime }
    }
    if (ALLOWED_VIDEO_MIME_TYPES.has(mime)) {
      return { kind: 'video', mimeType: mime }
    }
    return null
  }

  const ext = fileExtension(file.name)
  if (VIDEO_EXTENSIONS[ext]) {
    return { kind: 'video', mimeType: VIDEO_EXTENSIONS[ext] }
  }
  if (IMAGE_EXTENSIONS[ext]) {
    return { kind: 'image', mimeType: IMAGE_EXTENSIONS[ext] }
  }
  return null
}

const OTHER_VIDEO_EXTENSIONS = new Set([
  '.avi',
  '.mkv',
  '.wmv',
  '.flv',
  '.mpeg',
  '.mpg',
  '.ogv',
  '.3gp',
  '.m4v',
])

export function validateGalleryFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
): string | null {
  const detected = detectGalleryMediaKind(file)
  if (detected === null) {
    const mime = normalizeMime(file.type)
    const ext = fileExtension(file.name)
    if (mime.startsWith('video/') || OTHER_VIDEO_EXTENSIONS.has(ext)) {
      return `${file.name} kan ikke lægges op. Brug mp4, webm eller mov.`
    }
    return `${file.name} kan ikke lægges op. Brug et billede eller en video (mp4, webm eller mov).`
  }

  if (file.size <= 0) {
    return `${file.name} er tom.`
  }

  if (detected.kind === 'image' && file.size > MAX_IMAGE_BYTES) {
    return `${file.name} er for stor. Billeder må højst være 15 MB.`
  }

  if (detected.kind === 'video' && file.size > MAX_VIDEO_BYTES) {
    return `${file.name} er for stor. Videoer må højst være 50 MB.`
  }

  return null
}

export function validateGalleryFiles(
  files: ReadonlyArray<Pick<File, 'name' | 'type' | 'size'>>,
): string | null {
  for (const file of files) {
    const error = validateGalleryFile(file)
    if (error !== null) return error
  }
  return null
}
