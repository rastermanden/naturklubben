import { strict as assert } from 'node:assert'
import { readExifOrientation } from './exifOrientation.ts'

/**
 * Bygger et minimalt JPEG-hoved med ét APP1/Exif-segment, der kun indeholder
 * Orientation-taggen. Nok til at måle læseren -- resten af et JPEG er
 * ligegyldigt for den.
 */
function jpegWithOrientation(
  orientation: number,
  littleEndian = true,
): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(26))
  tiff.setUint16(0, littleEndian ? 0x4949 : 0x4d4d) // "II" / "MM"
  tiff.setUint16(2, 42, littleEndian)
  tiff.setUint32(4, 8, littleEndian) // offset til første IFD
  tiff.setUint16(8, 1, littleEndian) // ét felt
  tiff.setUint16(10, 0x0112, littleEndian) // Orientation
  tiff.setUint16(12, 3, littleEndian) // SHORT
  tiff.setUint32(14, 1, littleEndian)
  tiff.setUint16(18, orientation, littleEndian)
  tiff.setUint32(22, 0, littleEndian) // ingen næste IFD

  // SOI (2) + APP1-markør (2) + længdefelt (2) + "Exif\0\0" (6) + TIFF (26)
  const bytes = new Uint8Array(2 + 2 + 2 + 6 + 26)
  const view = new DataView(bytes.buffer)
  view.setUint16(0, 0xffd8) // SOI
  view.setUint16(2, 0xffe1) // APP1 -- længden skrives nedenfor
  bytes.set(new TextEncoder().encode('Exif'), 6)
  bytes[10] = 0
  bytes[11] = 0
  bytes.set(new Uint8Array(tiff.buffer), 12)

  // Længdefeltet dækker sig selv plus payloaden.
  const app1 = new DataView(bytes.buffer)
  app1.setUint16(4, 2 + 6 + 26)
  return bytes
}

Deno.test(
  'readExifOrientation: læser orientation fra et little endian-JPEG',
  () => {
    assert.equal(readExifOrientation(jpegWithOrientation(6)), 6)
    assert.equal(readExifOrientation(jpegWithOrientation(1)), 1)
    assert.equal(readExifOrientation(jpegWithOrientation(8)), 8)
  },
)

Deno.test('readExifOrientation: læser også big endian (MM)', () => {
  assert.equal(readExifOrientation(jpegWithOrientation(3, false)), 3)
})

Deno.test('readExifOrientation: uden JPEG-hoved roteres der ikke', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.equal(readExifOrientation(png), 1)
})

Deno.test('readExifOrientation: en afkortet fil roterer ikke', () => {
  const truncated = jpegWithOrientation(6).slice(0, 14)
  assert.equal(readExifOrientation(truncated), 1)
})
