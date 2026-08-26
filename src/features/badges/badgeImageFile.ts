import { BADGE_IMAGE_MIME_TYPES, MAX_BADGE_IMAGE_SIZE } from './useBadges'

/**
 * Samme krav som bucketten håndhæver (allowed_mime_types og file_size_limit) --
 * her alene for at kunne sige det pænt, før filen sendes af sted.
 *
 * SVG er bevidst ikke med: en SVG i en offentlig bucket kan indeholde script,
 * og imagescript kan ikke rasterisere vektor, så trykfilen kunne ikke laves.
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
 * `img` anvender selv EXIF-orientation, og det samme gør render-badge-print --
 * så de to er enige om, hvad "bredde" betyder.
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
