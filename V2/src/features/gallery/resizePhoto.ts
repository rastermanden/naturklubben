/** Samme loft som galleriets server-tjek og den gamle bucket. */
export const PHOTO_MAX_INPUT_BYTES = 15 * 1024 * 1024

/** Langeste side på det billede, lysbordet viser. */
export const PHOTO_MAX_EDGE = 1600

/** Langeste side på miniaturen i gitteret. */
export const THUMB_MAX_EDGE = 400

export function photoOutputSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new Error('PHOTO_DIMENSIONS')
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

type Drawable = {
  width: number
  height: number
  close?: () => void
}

export type ResizedPhoto = {
  blob: Blob
  width: number
  height: number
}

/**
 * Skalerer et galleribillede til JPEG i browseren.
 *
 * `createImageBitmap` og `OffscreenCanvas` er standard i browseren. Falder
 * `OffscreenCanvas` fra, bruges et almindeligt canvas-element. Ingen
 * billedpakke, og originalen i fuld størrelse forlader ikke enheden.
 */
export async function resizePhotoFile(
  file: Blob,
  maxEdge: number,
  decode: (blob: Blob) => Promise<Drawable> = (blob) => createImageBitmap(blob),
): Promise<ResizedPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new Error('PHOTO_NOT_AN_IMAGE')
  }
  if (file.size > PHOTO_MAX_INPUT_BYTES) {
    throw new Error('PHOTO_TOO_LARGE')
  }

  const bitmap = await decode(file)
  try {
    const size = photoOutputSize(bitmap.width, bitmap.height, maxEdge)
    const blob = await encodeJpeg(bitmap, size.width, size.height)
    return { blob, width: size.width, height: size.height }
  } finally {
    bitmap.close?.()
  }
}

async function encodeJpeg(
  bitmap: Drawable,
  width: number,
  height: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('PHOTO_ENCODE')
    context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 })
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('PHOTO_ENCODE')
  context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.82)
  })
  if (blob === null) throw new Error('PHOTO_ENCODE')
  return blob
}
