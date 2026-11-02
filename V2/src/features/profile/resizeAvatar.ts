/** Samme loft som serveren og den gamle avatars-bucket. */
export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024

/** Langeste side efter skalering. Nok til en rund avatar, lille nok til chatten. */
export const AVATAR_MAX_EDGE = 512

export function avatarOutputSize(
  width: number,
  height: number,
  maxEdge = AVATAR_MAX_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new Error('AVATAR_DIMENSIONS')
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

/**
 * Skalerer et profilbillede til JPEG i browseren.
 *
 * `createImageBitmap` og `OffscreenCanvas` er standard i browseren. Falder
 * `OffscreenCanvas` fra, bruges et almindeligt canvas-element. Ingen
 * billedpakke.
 */
export async function resizeAvatarFile(
  file: Blob,
  decode: (blob: Blob) => Promise<Drawable> = (blob) => createImageBitmap(blob),
): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('AVATAR_NOT_AN_IMAGE')
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    throw new Error('AVATAR_TOO_LARGE')
  }

  const bitmap = await decode(file)
  try {
    const size = avatarOutputSize(bitmap.width, bitmap.height)
    return await encodeJpeg(bitmap, size.width, size.height)
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
    if (context === null) throw new Error('AVATAR_ENCODE')
    context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('AVATAR_ENCODE')
  context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.85)
  })
  if (blob === null) throw new Error('AVATAR_ENCODE')
  return blob
}
