import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { RouteErrorBoundary } from '../components/RouteErrorBoundary'
import type { CalendarEvent } from '../features/calendar/useEvents'

const EVENT: CalendarEvent = {
  id: '00000000-0000-0000-0000-0000000000e1',
  title: 'Svampetur i Rude Skov',
  description: null,
  location: 'P-pladsen',
  start_at: '2026-09-14T08:00:00.000Z',
  end_at: null,
  created_by: 'member-id',
}

const mocks = vi.hoisted(() => ({
  eventsQuery: {
    data: undefined as CalendarEvent[] | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  mutation: { mutateAsync: vi.fn(), isPending: false },
}))

vi.mock('../features/calendar/useEvents', () => ({
  useEvents: () => ({
    eventsQuery: mocks.eventsQuery,
    createEvent: mocks.mutation,
    updateEvent: mocks.mutation,
    deleteEvent: mocks.mutation,
  }),
}))
vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'member-id' } } }),
}))
vi.mock('../features/admin/useIsAdmin', () => ({
  useIsAdmin: () => ({ isAdmin: false }),
}))
// Tilmelding og opgaver har deres egne hooks mod Supabase; her handler det
// kun om, at dialogen åbner fra URL'en.
vi.mock('../features/calendar/AttendanceSection', () => ({
  AttendanceSection: () => null,
}))
vi.mock('../features/calendar/EventTasksSection', () => ({
  EventTasksSection: () => null,
}))

import CalendarPage from './CalendarPage'

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

// Samme opsætning som App.tsx: hver navigation giver RouteErrorBoundary en ny
// nøgle, så siden starter forfra. En test uden den ville ikke opdage, at
// state sat lige før en navigation forsvinder.
function renderAt(path: string) {
  const page = (
    <RouteErrorBoundary>
      <CalendarPage />
    </RouteErrorBoundary>
  )
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/kalender" element={page} />
        <Route path="/kalender/:eventId" element={page} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  mocks.eventsQuery.data = undefined
})

describe('CalendarPage: /kalender/<id>', () => {
  it('åbner begivenheden fra en notifikation, når listen er hentet', async () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt(`/kalender/${EVENT.id}`)

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Svampetur i Rude Skov')
  })

  it('lukker tilbage til /kalender, så "tilbage" ikke åbner den igen', async () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt(`/kalender/${EVENT.id}`)

    fireEvent.click(await screen.findByRole('button', { name: 'Luk' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('location').textContent).toBe('/kalender')
  })

  it('"Redigér" fra notifikationen åbner formularen med begivenheden', async () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt(`/kalender/${EVENT.id}`)

    fireEvent.click(await screen.findByRole('button', { name: 'Redigér' }))

    const form = await screen.findByRole('dialog', {
      name: 'Redigér begivenhed',
    })
    expect(
      (within(form).getByLabelText('Titel') as HTMLInputElement).value,
    ).toBe('Svampetur i Rude Skov')
    expect(screen.getByTestId('location').textContent).toBe(
      `/kalender/${EVENT.id}`,
    )
  })

  it('lukker formularen tilbage til /kalender uden at åbne dialogen igen', async () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt(`/kalender/${EVENT.id}`)

    fireEvent.click(await screen.findByRole('button', { name: 'Redigér' }))
    fireEvent.click(
      within(
        await screen.findByRole('dialog', { name: 'Redigér begivenhed' }),
      ).getByRole('button', { name: 'Annuller' }),
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('location').textContent).toBe('/kalender')
  })

  it('åbner ingenting for et id, der ikke findes i kalenderen', () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt('/kalender/00000000-0000-0000-0000-000000000099')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Kalender' })).toBeTruthy()
  })

  it('åbner ingenting på /kalender uden id', () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt('/kalender')

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
