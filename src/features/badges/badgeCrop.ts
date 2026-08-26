import type { CSSProperties } from 'react'

// Den runde visning i appen har ingen brug for en Edge Function: en cirkel er
// `border-radius: 50%` plus et billede, der er skaleret og forskudt, så det
// gemte udsnit (crop_x/crop_y/crop_size i originalens pixels) fylder rammen.
// Trykfilen bruger de *samme* tal -- se supabase/functions/_shared/badgePrint.ts.

export interface BadgeCropValues {
  cropX: number
  cropY: number
  cropSize: number
}

export interface BadgeImageSize {
  imageWidth: number
  imageHeight: number
}

/** Den mindste side af billedet -- det største kvadratiske udsnit, der findes. */
export function maxCropSize({ imageWidth, imageHeight }: BadgeImageSize) {
  return Math.max(1, Math.min(imageWidth, imageHeight))
}

/** Zoom ind til højst 8x. Under det bliver et udsnit ubrugeligt til tryk. */
export function minCropSize(size: BadgeImageSize) {
  return Math.max(1, Math.round(maxCropSize(size) / 8))
}

/**
 * Holder udsnittet inden for billedet. Kaldes hver gang zoom eller position
 * ændres, så `badges_crop_within_image`-constrainten aldrig kan blive brudt fra
 * UI'et.
 */
export function clampCrop(
  size: BadgeImageSize,
  crop: BadgeCropValues,
): BadgeCropValues {
  const largest = maxCropSize(size)
  const cropSize = Math.min(Math.max(crop.cropSize, minCropSize(size)), largest)
  return {
    cropSize,
    cropX: Math.min(
      Math.max(crop.cropX, 0),
      Math.max(size.imageWidth - cropSize, 0),
    ),
    cropY: Math.min(
      Math.max(crop.cropY, 0),
      Math.max(size.imageHeight - cropSize, 0),
    ),
  }
}

/** Et centreret udsnit -- udgangspunktet, når et nyt billede vælges. */
export function centeredCrop(size: BadgeImageSize): BadgeCropValues {
  const cropSize = maxCropSize(size)
  return clampCrop(size, {
    cropSize,
    cropX: (size.imageWidth - cropSize) / 2,
    cropY: (size.imageHeight - cropSize) / 2,
  })
}

// Uden normaliseringen bliver 0 til "-0%" for et udsnit i hjørnet, og lange
// decimalhaler ender i markuppen.
function percent(value: number) {
  const rounded = Number(value.toFixed(4))
  return `${rounded === 0 ? 0 : rounded}%`
}

/**
 * Style til `img`-elementet inde i en kvadratisk, `overflow: hidden`-ramme med
 * `border-radius: 50%`. Billedet skaleres, så crop-firkanten præcis fylder
 * rammen, og forskydes, så udsnittet lander rigtigt.
 */
export function badgeArtworkStyle(
  size: BadgeImageSize,
  crop: BadgeCropValues,
): CSSProperties {
  const { cropSize, cropX, cropY } = clampCrop(size, crop)
  const scale = 100 / cropSize
  return {
    position: 'absolute',
    width: percent(size.imageWidth * scale),
    height: 'auto',
    maxWidth: 'none',
    left: percent(-cropX * scale),
    top: percent(-cropY * scale),
  }
}

/**
 * Advarsel om billedkvalitet -- vist i UI'et, aldrig som en blokering. Et
 * kvadratisk billede på mindst 1000x1000 px giver 300 dpi med god margin på et
 * 58 mm badge (den synlige cirkel kræver ~685 px).
 */
export function badgeImageWarning(size: BadgeImageSize): string | null {
  const smallest = Math.min(size.imageWidth, size.imageHeight)
  if (smallest < 1000) {
    return `Billedet er ${size.imageWidth}x${size.imageHeight} px. Mindst 1000x1000 px anbefales, ellers bliver det fysiske badge uskarpt.`
  }
  if (size.imageWidth !== size.imageHeight) {
    return 'Billedet er ikke kvadratisk. Det kan godt bruges, men vælg udsnittet med omhu -- resten af billedet kommer ikke med.'
  }
  return null
}

/**
 * Danske bogstaver skal med i slug'en som noget læsbart -- `badges.slug` har en
 * check-constraint, der kun tillader a-z, 0-9 og bindestreg.
 */
export function slugifyBadgeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}
