// Geometrien bag den trykklare badge-fil (#159).
//
// Regnestykket ligger her frem for inde i render-badge-print, fordi det både
// skal kunne testes uden et rigtigt billede (deno test supabase/functions/
// _shared/*.test.ts kører i CI) og bruges af frontenden til at advare om for
// lav opløsning, *inden* filen uploades.
//
// Alle koordinater er pixels i originalen. crop-firkanten er den kvadratiske
// boks, den synlige runde badge er indskrevet i -- den svarer altså til badgens
// fysiske diameter. Bleed lægges uden om den, fordi en knapmaskine folder et
// par millimeter af trykket om bag kanten: leverer vi en hårdt beskåret cirkel,
// mangler der billede at folde om, og badget får en hvid kant.

export const PRINT_DPI = 300
export const MM_PER_INCH = 25.4

// En badge er sjældent over 75 mm; loftet er alene en sikkerhedsventil, så en
// urimelig diameter ikke får Edge-runtimen til at allokere sig ihjel.
export const MAX_PRINT_PX = 3000

export interface BadgePrintInput {
  imageWidth: number
  imageHeight: number
  cropX: number
  cropY: number
  cropSize: number
  diameterMm: number
  bleedMm: number
}

export interface BadgePrintGeometry {
  /** Trykfilens kantlængde i pixels (kvadratisk: diameter + 2 x bleed). */
  printPx: number
  /** Radius af skærelinjen i trykfilen -- den synlige badges kant. */
  cutRadiusPx: number
  /** Kantlængden af udsnittet inkl. bleed, målt i originalens pixels. */
  canvasSize: number
  /** Udsnittet, som faktisk findes i originalen (kan være mindre end canvas). */
  regionX: number
  regionY: number
  regionWidth: number
  regionHeight: number
  /** Hvor udsnittet lander på canvas'et. */
  offsetX: number
  offsetY: number
  /** Sandt, når bleed'en rækker uden for originalen og skal fyldes ud. */
  needsEdgeFill: boolean
  /** Effektiv opløsning i dpi, hvis originalen bruges som den er. */
  effectiveDpi: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** Kantlængden i millimeter af hele trykfilen, bleed medregnet. */
export function printSideMm(diameterMm: number, bleedMm: number) {
  return diameterMm + 2 * bleedMm
}

/**
 * Mindste kvadratiske udsnit (i originalens pixels), der giver 300 dpi på det
 * færdige badge. Bruges af admin-UI'et til at advare frem for at blokere.
 */
export function recommendedCropSizePx(diameterMm: number) {
  return Math.ceil((diameterMm / MM_PER_INCH) * PRINT_DPI)
}

export function badgePrintGeometry(input: BadgePrintInput): BadgePrintGeometry {
  const { imageWidth, imageHeight, cropX, cropY, cropSize } = input
  const diameterMm = input.diameterMm
  const bleedMm = input.bleedMm

  if (!(cropSize > 0)) throw new Error('crop_size skal være større end 0')
  if (!(diameterMm > 0)) throw new Error('diameter_mm skal være større end 0')
  if (bleedMm < 0) throw new Error('bleed_mm kan ikke være negativ')

  const sideMm = printSideMm(diameterMm, bleedMm)
  const printPx = Math.min(
    MAX_PRINT_PX,
    Math.max(1, Math.round((sideMm / MM_PER_INCH) * PRINT_DPI)),
  )

  // Skalaen er givet af, at crop-firkanten *er* diameteren.
  const pxPerMm = cropSize / diameterMm
  const bleedPx = bleedMm * pxPerMm
  const canvasSize = Math.max(1, Math.round(cropSize + 2 * bleedPx))

  const originX = Math.round(cropX - bleedPx)
  const originY = Math.round(cropY - bleedPx)

  const regionX = clamp(originX, 0, imageWidth)
  const regionY = clamp(originY, 0, imageHeight)
  const regionRight = clamp(originX + canvasSize, 0, imageWidth)
  const regionBottom = clamp(originY + canvasSize, 0, imageHeight)
  const regionWidth = Math.max(0, regionRight - regionX)
  const regionHeight = Math.max(0, regionBottom - regionY)

  return {
    printPx,
    cutRadiusPx: (printPx * (diameterMm / sideMm)) / 2,
    canvasSize,
    regionX,
    regionY,
    regionWidth,
    regionHeight,
    offsetX: regionX - originX,
    offsetY: regionY - originY,
    needsEdgeFill: regionWidth !== canvasSize || regionHeight !== canvasSize,
    effectiveDpi: canvasSize / (sideMm / MM_PER_INCH),
  }
}
