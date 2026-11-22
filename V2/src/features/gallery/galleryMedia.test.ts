import { describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  detectGalleryMediaKind,
  isOversizeGalleryVideo,
  validateGalleryFile,
  validateGalleryFiles,
  validateImageFile,
} from './galleryMedia'

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('galleryMedia', () => {
  it('har samme loft som serveren: 95 MB', () => {
    // Skal svare til `MAX_VIDEO_BYTES` i `convex/gallery.ts`, som har sin egen
    // test af samme værdi. Ligger de to skævt, afviser serveren en video, som
    // klienten har lagt op uden at komprimere -- efter hele uploaden.
    expect(MAX_VIDEO_BYTES).toBe(95 * 1024 * 1024)
  })

  it('accepterer mp4, webm og mov op til 95 MB og billeder op til 15 MB', () => {
    expect(
      validateGalleryFile(makeFile('klip.mp4', 'video/mp4', MAX_VIDEO_BYTES)),
    ).toBeNull()
    expect(
      validateGalleryFile(makeFile('klip.webm', 'video/webm', 1024)),
    ).toBeNull()
    expect(
      validateGalleryFile(makeFile('klip.mov', 'video/quicktime', 1024 * 1024)),
    ).toBeNull()
    expect(
      validateGalleryFile(makeFile('foto.jpg', 'image/jpeg', MAX_IMAGE_BYTES)),
    ).toBeNull()
    expect(
      validateGalleryFile(
        makeFile('codec.mp4', 'video/mp4; codecs="avc1.42E01E"', 2048),
      ),
    ).toBeNull()
  })

  it('falder tilbage på filendelse når MIME-type er tom, men afviser forkert ikke-tom MIME', () => {
    expect(detectGalleryMediaKind(makeFile('mobil.mov', '', 100))).toEqual({
      kind: 'video',
      mimeType: 'video/quicktime',
    })
    expect(detectGalleryMediaKind(makeFile('mobil.mp4', '', 100))).toEqual({
      kind: 'video',
      mimeType: 'video/mp4',
    })
    expect(
      detectGalleryMediaKind(makeFile('falsk.mp4', 'text/plain', 100)),
    ).toBeNull()
  })

  it('afviser for store videoer, for store billeder, tomme filer og ukendte typer på dansk', () => {
    expect(
      validateGalleryFile(
        makeFile('stor.mp4', 'video/mp4', MAX_VIDEO_BYTES + 1),
      ),
    ).toBe('stor.mp4 er for stor. Videoer må højst være 95 MB.')

    expect(
      validateGalleryFile(
        makeFile('stor.jpg', 'image/jpeg', MAX_IMAGE_BYTES + 1),
      ),
    ).toBe('stor.jpg er for stor. Billeder må højst være 15 MB.')

    expect(validateGalleryFile(makeFile('tom.mp4', 'video/mp4', 0))).toBe(
      'tom.mp4 er tom.',
    )

    expect(
      validateGalleryFile(makeFile('film.avi', 'video/x-msvideo', 100)),
    ).toBe('film.avi kan ikke lægges op. Brug mp4, webm eller mov.')

    expect(
      validateGalleryFile(makeFile('dokument.pdf', 'application/pdf', 100)),
    ).toBe(
      'dokument.pdf kan ikke lægges op. Brug et billede eller en video (mp4, webm eller mov).',
    )

    expect(
      validateGalleryFiles([
        makeFile('ok.jpg', 'image/jpeg', 100),
        makeFile('nej.mp3', 'audio/mpeg', 100),
      ]),
    ).toBe(
      'nej.mp3 kan ikke lægges op. Brug et billede eller en video (mp4, webm eller mov).',
    )
  })

  it('genkender kun understøttede videoer over 95 MB til klient-komprimering', () => {
    expect(
      isOversizeGalleryVideo(
        makeFile('stor.mp4', 'video/mp4', MAX_VIDEO_BYTES + 1),
      ),
    ).toBe(true)
    expect(
      isOversizeGalleryVideo(
        makeFile('stor.webm', 'video/webm', MAX_VIDEO_BYTES + 1),
      ),
    ).toBe(true)
    expect(
      isOversizeGalleryVideo(
        makeFile('iphone.mov', '', MAX_VIDEO_BYTES + 1024),
      ),
    ).toBe(true)

    expect(
      isOversizeGalleryVideo(
        makeFile('grænse.mp4', 'video/mp4', MAX_VIDEO_BYTES),
      ),
    ).toBe(false)
    expect(
      isOversizeGalleryVideo(
        makeFile('billede.jpg', 'image/jpeg', MAX_VIDEO_BYTES + 1),
      ),
    ).toBe(false)
    expect(
      isOversizeGalleryVideo(
        makeFile('gammel.avi', 'video/x-msvideo', MAX_VIDEO_BYTES + 1),
      ),
    ).toBe(false)
  })

  it('validerer enkeltbilleder til Naturlog-formularen', () => {
    expect(
      validateImageFile(makeFile('blomst.jpg', 'image/jpeg', MAX_IMAGE_BYTES)),
    ).toBeNull()
    expect(validateImageFile(makeFile('klip.mp4', 'video/mp4', 1024))).toBe(
      'klip.mp4 er ikke et billede.',
    )
    expect(
      validateImageFile(
        makeFile('kæmpe.png', 'image/png', MAX_IMAGE_BYTES + 1),
      ),
    ).toBe('kæmpe.png er for stor (maks. 15 MB).')
  })
})
