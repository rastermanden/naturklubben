import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GalleryAlbum, Photo } from '../features/gallery/types'
import {
  GALLERY_ACCEPT,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from '../features/gallery/galleryMedia'
import { VideoCompressionError } from '../features/gallery/videoCompressionError'

const mockState: {
  albums: GalleryAlbum[] | undefined
  photos: Photo[]
  eventOptions: { id: string; title: string; startAt: number }[]
} = {
  albums: [],
  photos: [],
  eventOptions: [],
}

const enqueueSpy = vi.fn()
const movePhotosSpy = vi.fn()
const compressVideoFileMock = vi.fn()
const loadVideoCompressorMock = vi.fn()
const scrollIntoViewMock = vi.fn()
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

vi.mock('convex/react', () => ({
  useQuery: (ref: FunctionReference<'query'>, args: unknown) => {
    if (args === 'skip') return undefined
    const name = getFunctionName(ref)
    if (name === 'gallery:listAlbums') return mockState.albums
    if (name === 'calendar:eventOptions') return mockState.eventOptions
    if (name === 'gallery:getPhoto') {
      const photoId = (args as { photoId?: string }).photoId
      return mockState.photos.find((p) => p.id === photoId) ?? null
    }
    return undefined
  },
  usePaginatedQuery: () => ({
    results: mockState.photos,
    status: 'Exhausted',
    loadMore: vi.fn(),
    isLoading: false,
  }),
  useMutation: (ref: FunctionReference<'mutation'>) => {
    const name = getFunctionName(ref)
    if (name === 'gallery:movePhotos') return movePhotosSpy
    return vi.fn()
  },
  useAction: () => vi.fn(),
}))

vi.mock('../features/gallery/useUploadPhotos', () => ({
  useUploadPhotos: () => ({
    items: [],
    enqueue: enqueueSpy,
    retry: vi.fn(),
    clearSaved: vi.fn(),
    isUploading: false,
  }),
}))

vi.mock('../features/gallery/useAutoOptimizePendingPhotos', () => ({
  useAutoOptimizePendingPhotos: () => undefined,
}))

vi.mock('../features/gallery/PhotoComments', () => ({
  PhotoComments: () => null,
}))

vi.mock('../features/gallery/videoCompressionLoader', () => ({
  loadVideoCompressor: (...args: unknown[]) => loadVideoCompressorMock(...args),
}))

import GalleryPage from './GalleryPage'

function makeItem(id: string, overrides: Partial<Photo> = {}): Photo {
  return {
    id,
    mediaKind: 'image',
    mimeType: 'image/jpeg',
    caption: `Element ${id}`,
    eventId: null,
    albumKey: 'without-event',
    uploaderId: 'p1',
    createdAt: 1,
    width: 800,
    height: 600,
    optimizationStatus: 'ready',
    optimizationAttempts: 0,
    optimizationStartedAt: null,
    optimizationError: null,
    commentCount: 0,
    canDelete: true,
    canEdit: true,
    isUploader: true,
    displayUrl: `https://example.convex.site/photo?token=${id}`,
    thumbnailUrl: `https://example.convex.site/photo?token=${id}-thumb`,
    ...overrides,
  }
}

function renderGallery(path = '/billeder') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GalleryPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  enqueueSpy.mockReset()
  compressVideoFileMock.mockReset()
  loadVideoCompressorMock
    .mockReset()
    .mockResolvedValue({ compressVideoFile: compressVideoFileMock })
  scrollIntoViewMock.mockReset()
  HTMLElement.prototype.scrollIntoView = scrollIntoViewMock
  movePhotosSpy.mockReset().mockResolvedValue({
    movedCount: 2,
    albumKey: 'event1',
    eventId: 'event1',
  })
  mockState.eventOptions = [
    {
      id: 'event1',
      title: 'Svampetur',
      startAt: Date.UTC(2026, 8, 12, 10),
    },
  ]
  mockState.albums = [
    {
      albumId: 'without-event',
      eventId: null,
      title: 'Uden begivenhed',
      photoCount: 2,
      latestPhotoAt: 2,
      coverPhotoId: 'v1',
      coverUrl: null,
      coverIsVideo: true,
    },
  ]
  mockState.photos = [
    makeItem('v1', {
      mediaKind: 'video',
      mimeType: 'video/mp4',
      caption: 'Bækken i skoven',
      displayUrl: 'https://example.convex.site/video?token=vid1',
      thumbnailUrl: 'https://example.convex.site/photo?token=vid1-thumb',
    }),
    makeItem('v2', {
      mediaKind: 'video',
      mimeType: 'video/quicktime',
      caption: null,
      displayUrl: 'https://example.convex.site/video?token=vid2',
      thumbnailUrl: null,
    }),
  ]
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (originalScrollIntoView) {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView
  } else {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown })
      .scrollIntoView
  }
})

describe('GalleryPage: video i galleriet (#365)', () => {
  it('accepterer mp4/webm/mov op til 50 MB, afviser forkerte typer og for store filer på dansk uden upload', () => {
    renderGallery()

    const input = screen.getByLabelText(
      'Vælg billeder og videoer fra enheden',
    ) as HTMLInputElement
    expect(input.accept).toContain('video/mp4')
    expect(input.accept).toContain('video/webm')
    expect(input.accept).toContain('video/quicktime')

    // Ugyldig videotype og for stort billede afvises straks.
    const badVideo = new File(['avi'], 'gammel.avi', {
      type: 'video/x-msvideo',
    })
    const bigPhoto = new File(['img'], 'kæmpe.jpg', { type: 'image/jpeg' })
    Object.defineProperty(bigPhoto, 'size', { value: MAX_IMAGE_BYTES + 1 })

    fireEvent.change(input, {
      target: { files: [badVideo, bigPhoto] },
    })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(
      'gammel.avi kan ikke lægges op. Brug mp4, webm eller mov.',
    )
    expect(alert.textContent).toContain(
      'kæmpe.jpg er for stor. Billeder må højst være 15 MB.',
    )
    expect(enqueueSpy).not.toHaveBeenCalled()
    expect(loadVideoCompressorMock).not.toHaveBeenCalled()

    // Gyldig video op til og med 50 MB sendes uændret i kø uden komprimering.
    const validVideo = new File(['mp4'], 'ugle.mp4', { type: 'video/mp4' })
    Object.defineProperty(validVideo, 'size', { value: MAX_VIDEO_BYTES })
    fireEvent.change(screen.getByLabelText('Billedtekst (valgfri)'), {
      target: { value: 'Natugle i træet' },
    })
    fireEvent.change(screen.getByLabelText(/Knyt til begivenhed/), {
      target: { value: 'event1' },
    })
    fireEvent.change(input, { target: { files: [validVideo] } })

    expect(loadVideoCompressorMock).not.toHaveBeenCalled()
    expect(enqueueSpy).toHaveBeenCalledWith({
      files: [validVideo],
      caption: 'Natugle i træet',
      eventId: 'event1',
    })
  })

  it('viser albumcover med videotegn uden miniature og åbner video i lysbordet', () => {
    renderGallery('/billeder')

    // Albumcoveret for video uden thumbnail viser roligt videotegn i stedet for fejl/Intet billede.
    expect(screen.queryByText('Intet billede klar endnu')).toBeNull()
    expect(screen.getByText('Video')).toBeTruthy()

    // Åbn albummet og se både miniature med videotegn og video uden miniature.
    fireEvent.click(
      screen.getByRole('button', { name: /^Åbn album: Uden begivenhed,/ }),
    )

    const thumbBtn = screen.getByRole('button', {
      name: 'Åbn video: Bækken i skoven',
    })
    expect(thumbBtn.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.convex.site/photo?token=vid1-thumb',
    )

    const noThumbBtn = screen.getByRole('button', {
      name: 'Åbn video uden billedtekst',
    })
    expect(noThumbBtn.querySelector('img')).toBeNull()
    expect(noThumbBtn.textContent).toContain('Video')
    expect(screen.queryByText('Billedet kunne ikke hentes')).toBeNull()

    // Klik på video åbner lysbord med HTML5 <video controls playsInline>.
    fireEvent.click(thumbBtn)
    const video = document.querySelector('video')
    expect(video).not.toBeNull()
    expect(video?.hasAttribute('controls')).toBe(true)
    expect(video?.hasAttribute('playsinline')).toBe(true)
    expect(video?.getAttribute('src')).toBe(
      'https://example.convex.site/video?token=vid1',
    )
  })

  it('lader medlemmet masseflytte videoer og billeder samlet med "Flyt flere billeder"', async () => {
    mockState.photos = [
      makeItem('p1', { mediaKind: 'image', caption: 'Foto 1' }),
      makeItem('v1', {
        mediaKind: 'video',
        caption: 'Video 1',
        displayUrl: 'https://example.convex.site/video?token=vid1',
        thumbnailUrl: null,
      }),
    ]
    renderGallery('/billeder?album=without-event')

    fireEvent.click(screen.getByRole('button', { name: 'Flyt flere billeder' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Vælg billede: Foto 1' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Vælg video: Video 1' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Begivenhed' }), {
      target: { value: 'event1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Flyt 2 billeder' }))

    await waitFor(() =>
      expect(movePhotosSpy).toHaveBeenCalledWith({
        photoIds: ['p1', 'v1'],
        eventId: 'event1',
      }),
    )
  })
})

describe('GalleryPage: optag video med kameraet (#367)', () => {
  it('viser "Optag video" ved siden af "Tag billede" med accept="video/*" og capture="environment" uden at ændre foto- og filvælgeren', () => {
    renderGallery()

    const fileButton = screen.getByRole('button', {
      name: 'Vælg billeder eller video',
    })
    const photoButton = screen.getByRole('button', { name: 'Tag billede' })
    const videoButton = screen.getByRole('button', { name: 'Optag video' })

    // "Optag video" ligger lige efter "Tag billede" i samme knaprække og er touch-venlig.
    expect(photoButton.nextElementSibling).toBe(videoButton)
    expect(videoButton.className).toContain('min-h-11')

    const fileInput = screen.getByLabelText(
      'Vælg billeder og videoer fra enheden',
    ) as HTMLInputElement
    const photoInput = screen.getByLabelText(
      'Tag et billede med kameraet',
    ) as HTMLInputElement
    const videoInput = screen.getByLabelText(
      'Optag en video med kameraet',
    ) as HTMLInputElement

    // Video-input bruger video/* og bagkamera, så Android åbner kameraet i videotilstand.
    expect(videoInput.type).toBe('file')
    expect(videoInput.accept).toBe('video/*')
    expect(videoInput.getAttribute('capture')).toBe('environment')
    expect(videoInput.multiple).toBe(false)

    // Foto-input er uændret (kun foto med bagkamera).
    expect(photoInput.type).toBe('file')
    expect(photoInput.accept).toBe('image/*')
    expect(photoInput.getAttribute('capture')).toBe('environment')
    expect(photoInput.multiple).toBe(false)

    // Filvælgeren er uændret (ingen capture, GALLERY_ACCEPT og multiple).
    expect(fileInput.accept).toBe(GALLERY_ACCEPT)
    expect(fileInput.getAttribute('capture')).toBeNull()
    expect(fileInput.multiple).toBe(true)

    // Hver knap åbner sit eget skjulte input.
    const fileClickSpy = vi.spyOn(fileInput, 'click')
    const photoClickSpy = vi.spyOn(photoInput, 'click')
    const videoClickSpy = vi.spyOn(videoInput, 'click')

    fireEvent.click(videoButton)
    expect(videoClickSpy).toHaveBeenCalledTimes(1)
    expect(photoClickSpy).not.toHaveBeenCalled()
    expect(fileClickSpy).not.toHaveBeenCalled()

    fireEvent.click(photoButton)
    expect(photoClickSpy).toHaveBeenCalledTimes(1)

    fireEvent.click(fileButton)
    expect(fileClickSpy).toHaveBeenCalledTimes(1)

    // 50 MB-grænsen og skærm-vejledningen vises tæt ved knapperne, før man optager.
    expect(screen.getByText(/Videoer.*50 MB/i)).toBeTruthy()
    expect(screen.getByText(/hvis din browser kan/i)).toBeTruthy()
    expect(screen.getByText(/hold skærmen tændt/i)).toBeTruthy()
  })

  it('sender en gyldig optaget video gennem den eksisterende upload-sti med billedtekst og begivenhed', () => {
    renderGallery()

    const videoInput = screen.getByLabelText(
      'Optag en video med kameraet',
    ) as HTMLInputElement

    fireEvent.change(screen.getByLabelText('Billedtekst (valgfri)'), {
      target: { value: 'Rådyr i skovbrynet' },
    })
    fireEvent.change(screen.getByLabelText(/Knyt til begivenhed/), {
      target: { value: 'event1' },
    })

    const recorded = new File(['mp4'], 'VID_20261121.mp4', {
      type: 'video/mp4',
    })
    fireEvent.change(videoInput, { target: { files: [recorded] } })

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    expect(enqueueSpy).toHaveBeenCalledWith({
      files: [recorded],
      caption: 'Rådyr i skovbrynet',
      eventId: 'event1',
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('starter komprimering af en video over 50 MB fra video-inputtet og afviser stadig forkert videotype uden upload', async () => {
    let resolveCompress!: (res: { file: File; audioIncluded: boolean }) => void
    compressVideoFileMock.mockImplementationOnce(
      () =>
        new Promise<{ file: File; audioIncluded: boolean }>((resolve) => {
          resolveCompress = resolve
        }),
    )

    renderGallery()

    const videoInput = screen.getByLabelText(
      'Optag en video med kameraet',
    ) as HTMLInputElement

    // Video > 50 MB fra kameraet starter komprimering med dansk status og Annullér.
    const tooLarge = new File(['big'], 'lang_optagelse.mp4', {
      type: 'video/mp4',
    })
    Object.defineProperty(tooLarge, 'size', { value: MAX_VIDEO_BYTES + 1 })

    fireEvent.change(videoInput, { target: { files: [tooLarge] } })

    await waitFor(() => {
      expect(compressVideoFileMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByText('Komprimerer video')).toBeTruthy()
    expect(
      screen.getByText(/Hold skærmen tændt mens videoen komprimeres/i),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Annullér komprimering af lang_optagelse.mp4',
      }),
    ).toBeTruthy()
    expect(enqueueSpy).not.toHaveBeenCalled()

    const compressed = new File(['small'], 'lang_optagelse.mp4', {
      type: 'video/mp4',
    })
    Object.defineProperty(compressed, 'size', { value: 20 * 1024 * 1024 })
    await act(async () => {
      resolveCompress({ file: compressed, audioIncluded: true })
    })

    await waitFor(() => {
      expect(enqueueSpy).toHaveBeenCalledWith({
        files: [compressed],
        caption: '',
        eventId: null,
      })
    })

    // Forkert videotype (fx 3gp fra ældre kamerakonfiguration) afvises stadig straks.
    const wrongType = new File(['3gp'], 'klip.3gp', {
      type: 'video/3gpp',
    })
    fireEvent.change(videoInput, { target: { files: [wrongType] } })

    expect(screen.getByRole('alert').textContent).toContain(
      'klip.3gp kan ikke lægges op. Brug mp4, webm eller mov.',
    )
    expect(scrollIntoViewMock).toHaveBeenCalled()
    expect(enqueueSpy).toHaveBeenCalledTimes(1)
  })
})

describe('GalleryPage: klient-komprimering af store videoer (#369)', () => {
  it('lægger video på højst 50 MB op uændret uden at hente komprimeringsmodulet', () => {
    renderGallery()

    const input = screen.getByLabelText(
      'Vælg billeder og videoer fra enheden',
    ) as HTMLInputElement
    const exactLimit = new File(['ok'], 'praecis50.mp4', { type: 'video/mp4' })
    Object.defineProperty(exactLimit, 'size', { value: MAX_VIDEO_BYTES })

    fireEvent.change(input, { target: { files: [exactLimit] } })

    expect(loadVideoCompressorMock).not.toHaveBeenCalled()
    expect(compressVideoFileMock).not.toHaveBeenCalled()
    expect(enqueueSpy).toHaveBeenCalledWith({
      files: [exactLimit],
      caption: '',
      eventId: null,
    })
  })

  it('viser dansk fremskridt og Annullér-knap for video over 50 MB og uploader resultatet med billedtekst og begivenhed', async () => {
    let resolveCompress!: (res: { file: File; audioIncluded: boolean }) => void
    let capturedOnProgress:
      | ((p: {
          phase: 'preparing' | 'compressing' | 'paused'
          progress: number | null
        }) => void)
      | undefined
    compressVideoFileMock.mockImplementationOnce(
      (
        _file: File,
        opts?: {
          onProgress?: (p: {
            phase: 'preparing' | 'compressing' | 'paused'
            progress: number | null
          }) => void
        },
      ) => {
        capturedOnProgress = opts?.onProgress
        return new Promise<{ file: File; audioIncluded: boolean }>(
          (resolve) => {
            resolveCompress = resolve
          },
        )
      },
    )

    renderGallery()
    fireEvent.change(screen.getByLabelText('Billedtekst (valgfri)'), {
      target: { value: 'Havørn over fjorden' },
    })
    fireEvent.change(screen.getByLabelText(/Knyt til begivenhed/), {
      target: { value: 'event1' },
    })

    const largeMov = new File(['raw-mov'], 'havorn.mov', {
      type: 'video/quicktime',
    })
    Object.defineProperty(largeMov, 'size', { value: 120 * 1024 * 1024 })
    fireEvent.change(
      screen.getByLabelText('Vælg billeder og videoer fra enheden'),
      { target: { files: [largeMov] } },
    )

    await waitFor(() => {
      expect(loadVideoCompressorMock).toHaveBeenCalledTimes(1)
      expect(compressVideoFileMock).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      capturedOnProgress?.({ phase: 'compressing', progress: 0.45 })
    })
    expect(await screen.findByText('Komprimerer video… 45 %')).toBeTruthy()
    const cancelButton = screen.getByRole('button', {
      name: 'Annullér komprimering af havorn.mov',
    })
    expect(cancelButton.className).toContain('min-h-11')
    expect(enqueueSpy).not.toHaveBeenCalled()

    const compressed = new File(['mp4'], 'havorn.mp4', { type: 'video/mp4' })
    Object.defineProperty(compressed, 'size', { value: 25 * 1024 * 1024 })
    await act(async () => {
      resolveCompress({ file: compressed, audioIncluded: true })
    })

    await waitFor(() => {
      expect(enqueueSpy).toHaveBeenCalledWith({
        files: [compressed],
        caption: 'Havørn over fjorden',
        eventId: 'event1',
      })
    })
    expect(screen.queryByText('Komprimerer video')).toBeNull()
  })

  it('annullerer aktiv komprimering ved klik på Annullér, viser dansk fejl i billedet og uploader ikke', async () => {
    let capturedSignal: AbortSignal | undefined
    compressVideoFileMock.mockImplementationOnce(
      (file: File, opts?: { signal?: AbortSignal }) => {
        capturedSignal = opts?.signal
        return new Promise<{ file: File; audioIncluded: boolean }>(
          (_resolve, reject) => {
            opts?.signal?.addEventListener(
              'abort',
              () =>
                reject(
                  new VideoCompressionError(
                    'CANCELLED',
                    `Komprimeringen af ${file.name} blev annulleret. Videoen blev ikke lagt op.`,
                  ),
                ),
              { once: true },
            )
          },
        )
      },
    )

    renderGallery()
    const largeMp4 = new File(['raw'], 'skovsti.mp4', { type: 'video/mp4' })
    Object.defineProperty(largeMp4, 'size', { value: 90 * 1024 * 1024 })
    fireEvent.change(
      screen.getByLabelText('Vælg billeder og videoer fra enheden'),
      { target: { files: [largeMp4] } },
    )

    const cancelButton = await screen.findByRole('button', {
      name: 'Annullér komprimering af skovsti.mp4',
    })
    fireEvent.click(cancelButton)

    expect(capturedSignal?.aborted).toBe(true)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(
      'Komprimeringen af skovsti.mp4 blev annulleret. Videoen blev ikke lagt op.',
    )
    expect(scrollIntoViewMock).toHaveBeenCalled()
    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  it('viser synlig dansk fejl og gemmer ikke hvis komprimering fejler eller resultatet stadig er over 50 MB', async () => {
    compressVideoFileMock.mockRejectedValueOnce(
      new VideoCompressionError(
        'DECODE_FAILED',
        'hevc.mov kunne ikke læses af browseren og blev ikke lagt op. Prøv en anden video eller optag som mp4.',
      ),
    )

    renderGallery()
    const input = screen.getByLabelText(
      'Vælg billeder og videoer fra enheden',
    ) as HTMLInputElement

    const hevc = new File(['raw'], 'hevc.mov', { type: 'video/quicktime' })
    Object.defineProperty(hevc, 'size', { value: 110 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [hevc] } })

    const firstAlert = await screen.findByRole('alert')
    expect(firstAlert.textContent).toContain(
      'hevc.mov kunne ikke læses af browseren og blev ikke lagt op.',
    )
    expect(scrollIntoViewMock).toHaveBeenCalled()
    expect(enqueueSpy).not.toHaveBeenCalled()

    // Resultat stadig over 50 MB
    const stillBig = new File(['raw'], 'stadig_stor.mp4', { type: 'video/mp4' })
    Object.defineProperty(stillBig, 'size', { value: MAX_VIDEO_BYTES + 10 })
    compressVideoFileMock.mockResolvedValueOnce({
      file: stillBig,
      audioIncluded: true,
    })

    const hugeInput = new File(['raw'], 'stadig_stor.mp4', {
      type: 'video/mp4',
    })
    Object.defineProperty(hugeInput, 'size', { value: 200 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [hugeInput] } })

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'stadig_stor.mp4 var stadig over 50 MB efter komprimering og blev ikke lagt op.',
      )
    })
    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  it('viser synlig dansk fejl uden stille nederlag når browseren ikke kan komprimere', async () => {
    compressVideoFileMock.mockRejectedValueOnce(
      new VideoCompressionError(
        'UNSUPPORTED_BROWSER',
        'mobil.mp4 er over 50 MB, og din browser kan ikke komprimere videoer. Vælg en video på højst 50 MB.',
      ),
    )

    renderGallery()
    const largeMp4 = new File(['raw'], 'mobil.mp4', { type: 'video/mp4' })
    Object.defineProperty(largeMp4, 'size', { value: 80 * 1024 * 1024 })

    fireEvent.change(screen.getByLabelText('Optag en video med kameraet'), {
      target: { files: [largeMp4] },
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(
      'mobil.mp4 er over 50 MB, og din browser kan ikke komprimere videoer. Vælg en video på højst 50 MB.',
    )
    expect(scrollIntoViewMock).toHaveBeenCalled()
    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  it('låser AudioContext synkront ved klik og viser tydelig dansk besked hvis videoen blev lagt op uden lyd', async () => {
    const resumeSpy = vi.fn().mockResolvedValue(undefined)
    const closeSpy = vi.fn().mockResolvedValue(undefined)
    const fakeCtx = {
      state: 'suspended' as AudioContextState,
      resume: resumeSpy,
      close: closeSpy,
    } as unknown as AudioContext
    const AudioContextMock = vi.fn(function MockAudioContext() {
      return fakeCtx
    })
    vi.stubGlobal('AudioContext', AudioContextMock)

    const compressed = new File(['mp4'], 'silent.mp4', { type: 'video/mp4' })
    Object.defineProperty(compressed, 'size', { value: 12 * 1024 * 1024 })
    compressVideoFileMock.mockResolvedValueOnce({
      file: compressed,
      audioIncluded: false,
    })

    renderGallery()

    // Klik på Optag video åbner/genoptager AudioContext synkront i brugerhandlingen
    fireEvent.click(screen.getByRole('button', { name: 'Optag video' }))
    expect(AudioContextMock).toHaveBeenCalledTimes(1)
    expect(resumeSpy).toHaveBeenCalledTimes(1)

    const largeMov = new File(['raw'], 'udelyd.mov', {
      type: 'video/quicktime',
    })
    Object.defineProperty(largeMov, 'size', { value: 75 * 1024 * 1024 })
    fireEvent.change(screen.getByLabelText('Optag en video med kameraet'), {
      target: { files: [largeMov] },
    })

    await waitFor(() => {
      expect(enqueueSpy).toHaveBeenCalledWith({
        files: [compressed],
        caption: '',
        eventId: null,
      })
    })
    const notice = await screen.findByRole('status')
    expect(notice.textContent).toContain(
      'udelyd.mov: Videoen blev lagt op uden lyd.',
    )
  })

  it('forbereder AudioContext synkront ved træk-og-slip af stor video og frigiver den igen ved lille video', async () => {
    const resumeSpy = vi.fn().mockResolvedValue(undefined)
    const closeSpy = vi.fn().mockResolvedValue(undefined)
    const fakeCtx = {
      state: 'suspended' as AudioContextState,
      resume: resumeSpy,
      close: closeSpy,
    } as unknown as AudioContext
    const AudioContextMock = vi.fn(function MockAudioContext() {
      return fakeCtx
    })
    vi.stubGlobal('AudioContext', AudioContextMock)

    const compressed = new File(['mp4'], 'droppet.mp4', { type: 'video/mp4' })
    Object.defineProperty(compressed, 'size', { value: 14 * 1024 * 1024 })
    compressVideoFileMock.mockResolvedValueOnce({
      file: compressed,
      audioIncluded: true,
    })

    renderGallery()
    const dropZone = screen
      .getByRole('heading', { name: 'Upload billeder og videoer' })
      .closest('div')!

    const largeVideo = new File(['raw'], 'droppet.mov', {
      type: 'video/quicktime',
    })
    Object.defineProperty(largeVideo, 'size', { value: MAX_VIDEO_BYTES + 1024 })

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [largeVideo] },
    })

    expect(AudioContextMock).toHaveBeenCalledTimes(1)
    expect(resumeSpy).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(compressVideoFileMock).toHaveBeenCalledWith(
        largeVideo,
        expect.objectContaining({ audioContext: fakeCtx }),
      )
    })
    await waitFor(() => {
      expect(enqueueSpy).toHaveBeenCalledWith({
        files: [compressed],
        caption: '',
        eventId: null,
      })
    })
    expect(screen.queryByRole('status')).toBeNull()

    // Lille video (<= 50 MB) via drag-and-drop sendes stadig direkte uden komprimering.
    const smallVideo = new File(['small'], 'lille-drop.mp4', {
      type: 'video/mp4',
    })
    Object.defineProperty(smallVideo, 'size', { value: MAX_VIDEO_BYTES })
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [smallVideo] },
    })

    expect(loadVideoCompressorMock).toHaveBeenCalledTimes(1)
    expect(compressVideoFileMock).toHaveBeenCalledTimes(1)
    expect(enqueueSpy).toHaveBeenLastCalledWith({
      files: [smallVideo],
      caption: '',
      eventId: null,
    })
    expect(closeSpy).toHaveBeenCalledTimes(2)
  })

  it('viser dansk fallback ved engelsk TypeError fra komprimering og stjæler ikke fokus fra billedtekst eller forsvinder ved næste filvalg', async () => {
    let rejectCompress!: (err: Error) => void
    compressVideoFileMock.mockImplementationOnce(
      () =>
        new Promise<{ file: File; audioIncluded: boolean }>(
          (_resolve, reject) => {
            rejectCompress = reject
          },
        ),
    )

    renderGallery()
    const input = screen.getByLabelText(
      'Vælg billeder og videoer fra enheden',
    ) as HTMLInputElement
    const captionInput = screen.getByLabelText(
      'Billedtekst (valgfri)',
    ) as HTMLInputElement

    const bigMp4 = new File(['raw'], 'skov.mp4', { type: 'video/mp4' })
    Object.defineProperty(bigMp4, 'size', { value: 90 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [bigMp4] } })

    await waitFor(() => {
      expect(compressVideoFileMock).toHaveBeenCalledTimes(1)
    })

    // Medlemmet skriver i billedteksten mens komprimeringen fejler asynkront med engelsk TypeError.
    captionInput.focus()
    expect(document.activeElement).toBe(captionInput)

    await act(async () => {
      rejectCompress(new TypeError('Unexpected internal encoder error'))
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(
      'skov.mp4 kunne ikke komprimeres og blev ikke lagt op. Prøv igen eller vælg en kortere video.',
    )
    expect(alert.textContent).not.toContain('Unexpected internal encoder error')
    expect(scrollIntoViewMock).toHaveBeenCalled()
    expect(document.activeElement).toBe(captionInput)

    // Et nyt gyldigt filvalg må ikke slette en ulæst komprimeringsfejl.
    const smallVideo = new File(['ok'], 'lille.mp4', { type: 'video/mp4' })
    Object.defineProperty(smallVideo, 'size', { value: 1024 })
    fireEvent.change(input, { target: { files: [smallVideo] } })

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toContain(
      'skov.mp4 kunne ikke komprimeres og blev ikke lagt op.',
    )

    // Medlemmet kan selv lukke beskeden når den er læst.
    fireEvent.click(screen.getByRole('button', { name: 'Luk' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
