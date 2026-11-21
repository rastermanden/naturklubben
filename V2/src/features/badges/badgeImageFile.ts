export const MAX_BADGE_IMAGE_SIZE = 10 * 1024 * 1024

export const BADGE_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

/**
 * Samme krav som serveren håndhæver -- her alene for at kunne sige det pænt,
 * før filen sendes af sted.
 *
 * SVG er bevidst ikke med: originalen bruges som rasterforlæg til trykfilen.
 */
export function validateBadgeImageFile(file: File): string | null {
  if (!(BADGE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Badgebilledet skal være PNG, JPEG eller WebP.'
  }
  if (file.size > MAX_BADGE_IMAGE_SIZE) {
    return 'Billedet er for stort (maks. 10 MB).'
  }
  return null
}

export interface LoadedBadgeImage {
  width: number
  height: number
  objectUrl: string
}

/**
 * Målene aflæses i browseren, fordi crop-værdierne gemmes i originalens pixels.
 * `img` anvender selv EXIF-orientation.
 */
export function readBadgeImage(file: File): Promise<LoadedBadgeImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        objectUrl,
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Billedet kunne ikke læses.'))
    }
    image.src = objectUrl
  })
}
