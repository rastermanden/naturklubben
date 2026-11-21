import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { MAX_AUDIO_BYTES } from '../features/audio/audioValidation'

interface AudioClipView {
  id: string
  title: string
  sizeBytes: number
  createdAt: number
  uploaderId: string
  uploaderName: string
  canDelete: boolean
  audioUrl: string | null
}

const mockClips = vi.hoisted(() => ({
  current: [] as AudioClipView[] | undefined,
}))
const generateUploadUrlMock = vi.hoisted(() => vi.fn())
const createClipMock = vi.hoisted(() => vi.fn())
const deleteClipMock = vi.hoisted(() => vi.fn())

vi.mock('convex/react', () => ({
  useQuery: () => mockClips.current,
  useMutation: (ref: unknown) => {
    const name = getFunctionName(ref as never)
    if (name === 'audio:generateUploadUrl') return generateUploadUrlMock
    if (name === 'audio:createClip') return createClipMock
    if (name === 'audio:deleteClip') return deleteClipMock
    return vi.fn()
  },
}))

import AudioPage from './AudioPage'

beforeEach(() => {
  mockClips.current = []
  generateUploadUrlMock.mockReset()
  createClipMock.mockReset()
  deleteClipMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AudioPage', () => {
  it('viser tom tilstand, når der ingen lydfiler er', () => {
    mockClips.current = []
    render(<AudioPage />)

    expect(screen.getByRole('heading', { name: 'Lyd' })).toBeTruthy()
    expect(
      screen.getByText(
        'Ingen lydfiler endnu. Læg den første mp3-fil op ovenfor.',
      ),
    ).toBeTruthy()
  })

  it('viser listen med afsender, dato, HTML5-afspiller og slet-knap kun for canDelete', () => {
    mockClips.current = [
      {
        id: 'clip-2',
        title: 'Morgensang i skoven',
        sizeBytes: 2 * 1024 * 1024,
        createdAt: Date.UTC(2026, 4, 10, 12, 0, 0),
        uploaderId: 'p1',
        uploaderName: 'Maja',
        canDelete: true,
        audioUrl: 'https://example.convex.site/audio?token=abc123',
      },
      {
        id: 'clip-1',
        title: 'Bølgeskvulp',
        sizeBytes: 512 * 1024,
        createdAt: Date.UTC(2026, 4, 9, 12, 0, 0),
        uploaderId: 'p2',
        uploaderName: 'Kasper',
        canDelete: false,
        audioUrl: 'https://example.convex.site/audio?token=def456',
      },
    ]
    render(<AudioPage />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('Morgensang i skoven')
    expect(items[0]?.textContent).toContain('Maja')
    expect(items[1]?.textContent).toContain('Bølgeskvulp')
    expect(items[1]?.textContent).toContain('Kasper')

    const players = document.querySelectorAll('audio')
    expect(players).toHaveLength(2)
    expect(players[0]?.hasAttribute('controls')).toBe(true)
    expect(players[0]?.getAttribute('src')).toBe(
      'https://example.convex.site/audio?token=abc123',
    )

    const deleteButtons = screen.getAllByRole('button', { name: 'Slet' })
    expect(deleteButtons).toHaveLength(1)
  })

  it('viser dansk fejl og gemmer ikke ved forkert filtype eller fil over 15 MB', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<AudioPage />)

    const fileInput = screen.getByLabelText('Vælg mp3-fil') as HTMLInputElement

    const wavFile = new File(['wavdata'], 'optagelse.wav', {
      type: 'audio/wav',
    })
    fireEvent.change(fileInput, { target: { files: [wavFile] } })
    expect(screen.getByRole('alert').textContent).toBe(
      'Kun mp3-filer kan lægges op.',
    )

    const bigFile = new File(['x'], 'lang-tur.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(bigFile, 'size', { value: MAX_AUDIO_BYTES + 1 })
    fireEvent.change(fileInput, { target: { files: [bigFile] } })
    expect(screen.getByRole('alert').textContent).toBe(
      'Filen er for stor. Maksimum er 15 MB.',
    )

    expect(generateUploadUrlMock).not.toHaveBeenCalled()
    expect(createClipMock).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('udfylder standardtitel fra filnavn og uploader gyldig mp3', async () => {
    generateUploadUrlMock.mockResolvedValue({
      uploadUrl: 'https://upload.example.test/put',
    })
    createClipMock.mockResolvedValue({ ok: true, id: 'clip-new' })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ storageId: 'storage-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(<AudioPage />)

    const fileInput = screen.getByLabelText('Vælg mp3-fil') as HTMLInputElement
    const titleInput = screen.getByLabelText('Titel') as HTMLInputElement
    const mp3File = new File(['mp3bytes'], 'ugle-i-natten.mp3', {
      type: 'audio/mpeg',
    })

    fireEvent.change(fileInput, { target: { files: [mp3File] } })
    expect(titleInput.value).toBe('ugle-i-natten')

    fireEvent.click(screen.getByRole('button', { name: 'Læg op' }))

    await waitFor(() => {
      expect(createClipMock).toHaveBeenCalledWith({
        storageId: 'storage-1',
        title: 'ugle-i-natten',
      })
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://upload.example.test/put',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    )
    expect(screen.getByRole('status').textContent).toBe('Lydfilen er lagt op.')
  })

  it('viser dansk fejl, hvis serveren afviser filen', async () => {
    generateUploadUrlMock.mockResolvedValue({
      uploadUrl: 'https://upload.example.test/put',
    })
    createClipMock.mockResolvedValue({ ok: false, error: 'AUDIO_NOT_MP3' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ storageId: 'storage-bad' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(<AudioPage />)

    const fileInput = screen.getByLabelText('Vælg mp3-fil')
    const mp3File = new File(['mp3bytes'], 'forkert.mp3', {
      type: 'audio/mpeg',
    })
    fireEvent.change(fileInput, { target: { files: [mp3File] } })
    fireEvent.click(screen.getByRole('button', { name: 'Læg op' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'Kun mp3-filer kan lægges op.',
      )
    })
  })

  it('sletter et klip efter bekræftelse', async () => {
    deleteClipMock.mockResolvedValue(null)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    mockClips.current = [
      {
        id: 'clip-1',
        title: 'Regnvejr',
        sizeBytes: 2048,
        createdAt: Date.UTC(2026, 4, 10),
        uploaderId: 'p1',
        uploaderName: 'Maja',
        canDelete: true,
        audioUrl: 'https://example.convex.site/audio?token=tok',
      },
    ]

    render(<AudioPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Slet' }))

    await waitFor(() => {
      expect(deleteClipMock).toHaveBeenCalledWith({ clipId: 'clip-1' })
    })
  })
})
