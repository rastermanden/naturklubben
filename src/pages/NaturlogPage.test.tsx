import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Observation } from '../features/naturlog/types'

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'user-a' } } as { user: { id: string } } | null,
  isAdmin: false,
  observationsQuery: {
    data: undefined as Observation[] | undefined,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  },
  createObservation: { mutateAsync: vi.fn() },
  updateObservation: { mutateAsync: vi.fn() },
  deleteObservation: {
    mutate: vi.fn(),
    isPending: false,
    variables: undefined as string | undefined,
  },
  uploadObservationPhoto: vi.fn(),
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({ session: mocks.session, loading: false, signOut: vi.fn() }),
}))
vi.mock('../features/admin/useIsAdmin', () => ({
  useIsAdmin: () => ({ isAdmin: mocks.isAdmin, loading: false }),
}))
vi.mock('../features/naturlog/useObservations', () => ({
  observationsQueryKey: ['observations'],
  useObservations: () => mocks.observationsQuery,
  useObservationMutations: () => ({
    createObservation: mocks.createObservation,
    updateObservation: mocks.updateObservation,
    deleteObservation: mocks.deleteObservation,
  }),
  uploadObservationPhoto: mocks.uploadObservationPhoto,
}))
vi.mock('../features/gallery/useUploadPhotos', () => ({
  validateFiles: () => null,
}))
vi.mock('../features/gallery/useDeletePhoto', () => ({
  useDeletePhoto: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../features/gallery/useRetryPhotoOptimization', () => ({
  useRetryPhotoOptimization: () => ({
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  }),
}))
vi.mock('../features/gallery/PhotoThumbnail', () => ({
  PhotoThumbnail: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Åbn billede
    </button>
  ),
}))
vi.mock('../features/gallery/PhotoLightbox', () => ({
  PhotoLightbox: () => <div role="dialog">Lightbox</div>,
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import NaturlogPage from './NaturlogPage'

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    species: 'Rød glente',
    location: 'Mols Bjerge',
    observed_on: '2026-08-29',
    notes: null,
    latitude: null,
    longitude: null,
    photo_id: null,
    photo: null,
    created_by: 'user-a',
    observer: { id: 'user-a', full_name: 'Alice' },
    created_at: '2026-08-29T10:00:00Z',
    updated_at: '2026-08-29T10:00:00Z',
    ...overrides,
  }
}

describe('NaturlogPage', () => {
  beforeEach(() => {
    mocks.session = { user: { id: 'user-a' } }
    mocks.isAdmin = false
    mocks.observationsQuery.data = undefined
    mocks.observationsQuery.isPending = false
    mocks.observationsQuery.isError = false
    mocks.observationsQuery.isSuccess = true
    mocks.deleteObservation.mutate.mockReset()
    mocks.createObservation.mutateAsync.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('viser en tom tilstand, når der ikke er observationer', () => {
    mocks.observationsQuery.data = []
    render(<NaturlogPage />)
    expect(screen.getByText(/Naturloggen er tom endnu/)).toBeTruthy()
  })

  it('viser observationer med art, dato, sted og observatør', () => {
    mocks.observationsQuery.data = [observation()]
    render(<NaturlogPage />)
    expect(screen.getByRole('heading', { name: 'Rød glente' })).toBeTruthy()
    const meta = screen.getByText('29. august 2026').closest('p')
    expect(meta?.textContent).toBe('29. august 2026 · Mols Bjerge · Alice')
  })

  it('filtrerer listen ud fra søgefeltet', () => {
    mocks.observationsQuery.data = [
      observation({ id: '1', species: 'Rød glente' }),
      observation({ id: '2', species: 'Ravn', location: 'Rold Skov' }),
    ]
    render(<NaturlogPage />)
    fireEvent.change(screen.getByLabelText('Søg i loggen'), {
      target: { value: 'rold' },
    })
    expect(screen.queryByRole('heading', { name: 'Rød glente' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ravn' })).toBeTruthy()
  })

  it('lader kun observatøren redigere sit eget fund', () => {
    mocks.observationsQuery.data = [
      observation({ id: '1', species: 'Mit fund' }),
      observation({
        id: '2',
        species: 'Bobs fund',
        created_by: 'user-b',
        observer: { id: 'user-b', full_name: 'Bob' },
      }),
    ]
    render(<NaturlogPage />)
    expect(screen.getAllByRole('button', { name: 'Redigér' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Slet' })).toHaveLength(1)
  })

  it('lader en admin slette andres fund, men ikke redigere dem', () => {
    mocks.isAdmin = true
    mocks.observationsQuery.data = [
      observation({
        id: '2',
        species: 'Bobs fund',
        created_by: 'user-b',
        observer: { id: 'user-b', full_name: 'Bob' },
      }),
    ]
    render(<NaturlogPage />)
    expect(screen.queryByRole('button', { name: 'Redigér' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Slet' })).toBeTruthy()
  })

  it('spørger, før en observation slettes', () => {
    mocks.observationsQuery.data = [observation()]
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<NaturlogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Slet' }))
    expect(mocks.deleteObservation.mutate).not.toHaveBeenCalled()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Slet' }))
    expect(mocks.deleteObservation.mutate).toHaveBeenCalledWith(
      'obs-1',
      expect.anything(),
    )
  })

  it('åbner formularen og gemmer en ny observation', async () => {
    mocks.observationsQuery.data = []
    mocks.createObservation.mutateAsync.mockResolvedValue(undefined)
    render(<NaturlogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Ny observation' }))
    const dialog = screen.getByRole('dialog', { name: 'Ny observation' })
    expect(dialog).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Hvad så du?'), {
      target: { value: 'Kantarel' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Registrér observation' }),
    )

    expect(
      await screen.findByText('Kantarel er skrevet i naturloggen.'),
    ).toBeTruthy()
    expect(mocks.createObservation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ species: 'Kantarel', photo_id: null }),
    )
    expect(mocks.uploadObservationPhoto).not.toHaveBeenCalled()
  })

  it('viser en fejl, når arten mangler', () => {
    mocks.observationsQuery.data = []
    render(<NaturlogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Ny observation' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Registrér observation' }),
    )
    expect(screen.getByRole('alert').textContent).toBe('Skriv, hvad du så.')
    expect(mocks.createObservation.mutateAsync).not.toHaveBeenCalled()
  })

  it('linker til et kort, når observationen har en position', () => {
    mocks.observationsQuery.data = [
      observation({ latitude: 56.22, longitude: 10.55 }),
    ]
    render(<NaturlogPage />)
    const link = screen.getByRole('link', { name: /Se på kort/ })
    expect(link.getAttribute('href')).toContain('openstreetmap.org')
  })

  it('viser en fejl med genforsøg, når loggen ikke kan hentes', () => {
    mocks.observationsQuery.isError = true
    mocks.observationsQuery.isSuccess = false
    render(<NaturlogPage />)
    expect(screen.getByRole('alert').textContent).toContain(
      'Naturloggen kunne ikke hentes.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Prøv igen' }))
    expect(mocks.observationsQuery.refetch).toHaveBeenCalled()
  })
})
