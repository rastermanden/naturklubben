import { describe, expect, it } from 'vitest'
import {
  badgeArtworkStyle,
  badgeImageWarning,
  centeredCrop,
  clampCrop,
  maxCropSize,
  minCropSize,
  slugifyBadgeName,
} from './badgeCrop'

describe('clampCrop', () => {
  it('holder udsnittet inden for billedet', () => {
    const clamped = clampCrop(
      { imageWidth: 1000, imageHeight: 1000 },
      { cropX: 900, cropY: -50, cropSize: 400 },
    )

    expect(clamped).toEqual({ cropX: 600, cropY: 0, cropSize: 400 })
  })

  it('kan ikke zoome længere ud end billedets korteste side', () => {
    const clamped = clampCrop(
      { imageWidth: 1600, imageHeight: 900 },
      { cropX: 0, cropY: 0, cropSize: 5000 },
    )

    expect(clamped.cropSize).toBe(900)
    expect(maxCropSize({ imageWidth: 1600, imageHeight: 900 })).toBe(900)
  })

  it('kan ikke zoome længere ind end 8x', () => {
    const size = { imageWidth: 1600, imageHeight: 1600 }
    const clamped = clampCrop(size, { cropX: 0, cropY: 0, cropSize: 1 })

    expect(clamped.cropSize).toBe(minCropSize(size))
    expect(clamped.cropSize).toBe(200)
  })
})

describe('centeredCrop', () => {
  it('vælger det største kvadrat midt i billedet', () => {
    expect(centeredCrop({ imageWidth: 1600, imageHeight: 900 })).toEqual({
      cropX: 350,
      cropY: 0,
      cropSize: 900,
    })
  })
})

describe('badgeArtworkStyle', () => {
  it('skalerer og forskyder billedet, så udsnittet fylder rammen', () => {
    const style = badgeArtworkStyle(
      { imageWidth: 2000, imageHeight: 1000 },
      { cropX: 500, cropY: 0, cropSize: 1000 },
    )

    // Udsnittet er halvdelen af bredden, så billedet skal fylde 200 % af rammen
    // og skubbes 50 % til venstre.
    expect(style.width).toBe('200%')
    expect(style.left).toBe('-50%')
    expect(style.top).toBe('0%')
  })

  it('bruger et gyldigt udsnit, selv om de gemte tal er umulige', () => {
    const style = badgeArtworkStyle(
      { imageWidth: 1000, imageHeight: 1000 },
      { cropX: 9999, cropY: 9999, cropSize: 1000 },
    )

    expect(style.left).toBe('0%')
    expect(style.top).toBe('0%')
  })
})

describe('badgeImageWarning', () => {
  it('advarer om for lav opløsning', () => {
    expect(badgeImageWarning({ imageWidth: 800, imageHeight: 800 })).toMatch(
      /800x800/,
    )
  })

  it('advarer om et billede, der ikke er kvadratisk', () => {
    expect(badgeImageWarning({ imageWidth: 1600, imageHeight: 1200 })).toMatch(
      /ikke kvadratisk/,
    )
  })

  it('siger ingenting om et stort kvadratisk billede', () => {
    expect(
      badgeImageWarning({ imageWidth: 1200, imageHeight: 1200 }),
    ).toBeNull()
  })
})

describe('slugifyBadgeName', () => {
  it('oversætter danske bogstaver frem for at smide dem væk', () => {
    expect(slugifyBadgeName('Bonderøven')).toBe('bonderoeven')
    expect(slugifyBadgeName('Brål smelter')).toBe('braal-smelter')
    expect(slugifyBadgeName('Æblegrød')).toBe('aeblegroed')
  })

  it('giver en slug, badges_slug_check kan acceptere', () => {
    const slug = slugifyBadgeName('  Governor of Bral central bank!!  ')

    expect(slug).toBe('governor-of-bral-central-bank')
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('efterlader ikke en bindestreg, når navnet klippes af', () => {
    const slug = slugifyBadgeName(`${'a'.repeat(59)} bagefter`)

    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
})
