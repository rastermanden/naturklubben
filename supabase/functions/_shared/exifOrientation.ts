// EXIF-orientation: den samme rotation, browseren allerede viser.
//
// Ligger i _shared, fordi to functions har brug for præcis samme svar.
// optimize-image (#13) roterer galleriets afledte filer, og render-badge-print
// (#159) skal beskære efter de crop-værdier, admin valgte i browseren -- og
// browseren viser billedet *med* orientation anvendt. Læste de to koder EXIF
// forskelligt, ville trykfilen blive beskåret et andet sted, end admin så.

import type { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

/**
 * Læser EXIF-orientation-tag fra JPEG-bytes (APP1/Exif-segment).
 * Returnerer 1–8 jf. EXIF-standarden, eller 1 (ingen transformation) ved fejl.
 */
export function readExifOrientation(bytes: Uint8Array): number {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    // JPEG starter altid med FF D8
    if (view.getUint16(0) !== 0xffd8) return 1

    let offset = 2
    while (offset + 4 <= bytes.length) {
      const marker = view.getUint16(offset)
      const segmentLength = view.getUint16(offset + 2)
      // APP1-markør (0xFFE1) kan indeholde Exif
      if (marker === 0xffe1) {
        // "Exif\0\0" = 45 78 69 66 00 00
        if (
          offset + 10 <= bytes.length &&
          view.getUint32(offset + 4) === 0x45786966 &&
          view.getUint16(offset + 8) === 0x0000
        ) {
          const tiffOffset = offset + 10
          if (tiffOffset + 8 > bytes.length) return 1
          const littleEndian = view.getUint16(tiffOffset) === 0x4949
          const ifdOffset =
            tiffOffset +
            (littleEndian
              ? view.getUint32(tiffOffset + 4, true)
              : view.getUint32(tiffOffset + 4, false))
          if (ifdOffset + 2 > bytes.length) return 1
          const entryCount = littleEndian
            ? view.getUint16(ifdOffset, true)
            : view.getUint16(ifdOffset, false)
          for (let i = 0; i < entryCount; i++) {
            const entryOffset = ifdOffset + 2 + i * 12
            if (entryOffset + 12 > bytes.length) break
            const tag = littleEndian
              ? view.getUint16(entryOffset, true)
              : view.getUint16(entryOffset, false)
            if (tag === 0x0112) {
              // Orientation
              return littleEndian
                ? view.getUint16(entryOffset + 8, true)
                : view.getUint16(entryOffset + 8, false)
            }
          }
        }
      }
      if (segmentLength < 2) break
      offset += 2 + segmentLength
    }
  } catch {
    // Malformed EXIF — ingen transformation
  }
  return 1
}

/**
 * Anvender EXIF-orientation på et Image-objekt in-place.
 * Orientation 1 = ingen transform; 2–8 = spejl/rotation kombinationer.
 */
export function applyOrientation(img: Image, orientation: number) {
  switch (orientation) {
    case 2:
      return img.flip('horizontal')
    case 3:
      return img.rotate(180)
    case 4:
      return img.flip('vertical')
    case 5:
      return img.rotate(270).flip('horizontal')
    case 6:
      return img.rotate(90)
    case 7:
      return img.rotate(90).flip('horizontal')
    case 8:
      return img.rotate(270)
    default:
      return img
  }
}
