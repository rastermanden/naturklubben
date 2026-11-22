// Geometrien bag den trykklare badge-fil.
//
// Alle koordinater er pixels i originalen. crop-firkanten er den kvadratiske
// boks, den synlige runde badge er indskrevet i -- den svarer altså til badgens
// fysiske diameter. Bleed lægges uden om den, fordi en knapmaskine folder et
// par millimeter af trykket om bag kanten: leverer vi en hårdt beskåret cirkel,
// mangler der billede at folde om, og badget får en hvid kant.

export const PRINT_DPI = 300
export const MM_PER_INCH = 25.4
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
  /** Skalaen fra originalens pixels til trykfilens (printPx / canvasSize). */
  renderScale: number
  /** Udsnittet målt i trykfilens pixels -- det, der faktisk komponeres. */
  scaledRegionWidth: number
  scaledRegionHeight: number
  /** Udsnittets placering, målt i trykfilens pixels. */
  scaledOffsetX: number
  scaledOffsetY: number
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
 * færdige badge.
 */
export function recommendedCropSizePx(diameterMm: number) {
  return Math.ceil((diameterMm / MM_PER_INCH) * PRINT_DPI)
}

export function badgePrintGeometry(input: BadgePrintInput): BadgePrintGeometry {
  const { imageWidth, imageHeight, cropX, cropY, cropSize } = input
  const diameterMm = input.diameterMm
  const bleedMm = input.bleedMm

  if (!(cropSize > 0)) throw new Error('cropSize skal være større end 0')
  if (!(diameterMm > 0)) throw new Error('diameterMm skal være større end 0')
  if (bleedMm < 0) throw new Error('bleedMm kan ikke være negativ')

  const sideMm = printSideMm(diameterMm, bleedMm)
  const printPx = Math.min(
    MAX_PRINT_PX,
    Math.max(1, Math.round((sideMm / MM_PER_INCH) * PRINT_DPI)),
  )

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

  const offsetX = regionX - originX
  const offsetY = regionY - originY

  const renderScale = printPx / canvasSize
  const scaledRegionWidth =
    regionWidth > 0 ? Math.max(1, Math.round(regionWidth * renderScale)) : 0
  const scaledRegionHeight =
    regionHeight > 0 ? Math.max(1, Math.round(regionHeight * renderScale)) : 0

  return {
    printPx,
    cutRadiusPx: (printPx * (diameterMm / sideMm)) / 2,
    canvasSize,
    regionX,
    regionY,
    regionWidth,
    regionHeight,
    offsetX,
    offsetY,
    renderScale,
    scaledRegionWidth,
    scaledRegionHeight,
    scaledOffsetX: clamp(
      Math.round(offsetX * renderScale),
      0,
      Math.max(0, printPx - scaledRegionWidth),
    ),
    scaledOffsetY: clamp(
      Math.round(offsetY * renderScale),
      0,
      Math.max(0, printPx - scaledRegionHeight),
    ),
    needsEdgeFill: regionWidth !== canvasSize || regionHeight !== canvasSize,
    effectiveDpi: canvasSize / (sideMm / MM_PER_INCH),
  }
}
