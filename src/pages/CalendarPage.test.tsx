import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/kalender" element={<CalendarPage />} />
        <Route path="/kalender/:eventId" element={<CalendarPage />} />
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
