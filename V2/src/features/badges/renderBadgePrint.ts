import { badgePrintGeometry } from './badgePrint'

type Drawable = {
  width: number
  height: number
  close?: () => void
}

export interface RenderBadgePrintInput {
  cropX: number
  cropY: number
  cropSize: number
  diameterMm: number
  bleedMm: number
}

function createCanvas(size: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(size, size)
  }
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return canvas
}

async function encodePng(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return await canvas.convertToBlob({ type: 'image/png' })
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png')
  })
  if (blob === null) {
    throw new Error('Trykfilen kunne ikke gemmes som PNG.')
  }
  return blob
}

/**
 * Tegner trykfilen som tabsfri PNG i browseren med bleed og stiplet skærelinje,
 * ud fra samme geometri som V1's `render-badge-print`.
 */
export async function renderBadgePrintFile(
  sourceBlob: Blob,
  input: RenderBadgePrintInput,
  decode: (blob: Blob) => Promise<Drawable> = (blob) => createImageBitmap(blob),
): Promise<Blob> {
  const bitmap = await decode(sourceBlob)
  try {
    const geometry = badgePrintGeometry({
      imageWidth: bitmap.width,
      imageHeight: bitmap.height,
      cropX: input.cropX,
      cropY: input.cropY,
      cropSize: input.cropSize,
      diameterMm: input.diameterMm,
      bleedMm: input.bleedMm,
    })

    if (geometry.regionWidth < 1 || geometry.regionHeight < 1) {
      throw new Error(
        'Beskæringen ligger uden for billedet. Vælg udsnittet igen.',
      )
    }

    const canvas = createCanvas(geometry.printPx)
    const context = canvas.getContext('2d') as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (context === null) {
      throw new Error('Trykfilen kunne ikke tegnes i browseren.')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, geometry.printPx, geometry.printPx)

    if (geometry.needsEdgeFill) {
      // Bleed'en rækker uden for originalen: stræk udsnittet under, så kanten
      // bag på knappen ikke bliver hvid.
      context.drawImage(
        bitmap as CanvasImageSource,
        geometry.regionX,
        geometry.regionY,
        geometry.regionWidth,
        geometry.regionHeight,
        0,
        0,
        geometry.printPx,
        geometry.printPx,
      )
    }

    context.drawImage(
      bitmap as CanvasImageSource,
      geometry.regionX,
      geometry.regionY,
      geometry.regionWidth,
      geometry.regionHeight,
      geometry.scaledOffsetX,
      geometry.scaledOffsetY,
      geometry.scaledRegionWidth,
      geometry.scaledRegionHeight,
    )

    const center = geometry.printPx / 2
    const lineWidth = Math.max(2, Math.round(geometry.printPx / 400))
    const dashLength = Math.max(
      4,
      Math.round((2 * Math.PI * geometry.cutRadiusPx) / 48),
    )

    context.save()
    context.lineWidth = lineWidth
    context.strokeStyle = '#ffffff'
    context.beginPath()
    context.arc(center, center, geometry.cutRadiusPx, 0, Math.PI * 2)
    context.stroke()

    context.strokeStyle = '#000000'
    context.setLineDash([dashLength, dashLength])
    context.beginPath()
    context.arc(center, center, geometry.cutRadiusPx, 0, Math.PI * 2)
    context.stroke()
    context.restore()

    return await encodePng(canvas)
  } finally {
    bitmap.close?.()
  }
}
