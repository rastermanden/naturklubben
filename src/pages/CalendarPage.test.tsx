import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { RouteErrorBoundary } from '../components/RouteErrorBoundary'
import type { CalendarEvent } from '../features/calendar/useEvents'

const EVENT: CalendarEvent = {
  id: '00000000-0000-0000-0000-0000000000e1',
  title: 'Svampetur i Rude Skov',
  description: null,
  location: 'P-pladsen',
  // Langt ude i fremtiden, så testen ikke skifter opførsel, når datoen
  // passerer -- tidligere begivenheder vises anderledes (#257).
  start_at: '2099-09-14T08:00:00.000Z',
  end_at: null,
  created_by: 'member-id',
  is_public: false,
  max_participants: null,
}

const PAST_EVENT: CalendarEvent = {
  ...EVENT,
  id: '00000000-0000-0000-0000-0000000000e2',
  title: 'Fuglekig ved Tissø',
  start_at: '2020-05-03T06:00:00.000Z',
}

const mocks = vi.hoisted(() => ({
  eventsQuery: {
    data: undefined as CalendarEvent[] | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  // Egne mocks pr. mutation (i stedet for én delt) -- ellers kan en test,
  // der gemmer en redigering, ikke se om det gik gennem updateEvent eller
  // (fejlagtigt) createEvent.
  createEvent: { mutateAsync: vi.fn(), isPending: false },
  updateEvent: { mutateAsync: vi.fn(), isPending: false },
  deleteEvent: { mutateAsync: vi.fn(), isPending: false },
  photoCount: { data: undefined as number | undefined },
  pastEventsEnabled: vi.fn(),
  pastEventsQuery: {
    data: undefined as { pages: CalendarEvent[][] } | undefined,
    isLoading: false,
    isError: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
}))

vi.mock('../features/calendar/useEvents', () => ({
  useEvents: () => ({
    eventsQuery: mocks.eventsQuery,
    createEvent: mocks.createEvent,
    updateEvent: mocks.updateEvent,
    deleteEvent: mocks.deleteEvent,
  }),
}))
vi.mock('../features/calendar/usePastEvents', () => ({
  usePastEvents: (enabled: boolean) => {
    mocks.pastEventsEnabled(enabled)
    return mocks.pastEventsQuery
  },
  usePastMonthEvents: () => ({ data: [], isError: false, refetch: vi.fn() }),
}))
vi.mock('../features/calendar/useEventPhotoCount', () => ({
  useEventPhotoCount: () => mocks.photoCount,
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
  AttendanceSection: ({ readOnly }: { readOnly?: boolean }) =>
    readOnly ? <p>Tilmelding lukket</p> : <p>Tilmelding åben</p>,
}))
vi.mock('../features/calendar/EventTasksSection', () => ({
  EventTasksSection: () => <p>Opgaveliste</p>,
}))
vi.mock('../features/calendar/GuestRequestsSection', () => ({
  GuestRequestsSection: () => null,
}))
// Oprykningen fra ventelisten (#222) meldes i chatten via Supabase; her
// gemmes ingen begivenhed, så den kaldes aldrig.
vi.mock('../features/calendar/announceWaitlist', () => ({
  announcePromotion: vi.fn(),
  notifyPromotedMembers: vi.fn(),
}))
vi.mock('../features/chat/useProfilesMap', () => ({
  useProfilesMap: () => ({ data: undefined }),
}))

import CalendarPage from './CalendarPage'

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">{location.pathname}</output>
      <button type="button" onClick={() => navigate('/chat')}>
        Gå til chat
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Tilbage
      </button>
    </>
  )
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
        <Route path="/chat" element={<h1>Chat</h1>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  mocks.eventsQuery.data = undefined
  mocks.createEvent.mutateAsync.mockReset()
  mocks.updateEvent.mutateAsync.mockReset()
  mocks.deleteEvent.mutateAsync.mockReset()
  mocks.photoCount.data = undefined
  mocks.pastEventsEnabled.mockReset()
  mocks.pastEventsQuery.data = undefined
  mocks.pastEventsQuery.hasNextPage = false
  mocks.pastEventsQuery.fetchNextPage.mockReset()
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

  it('siger til, når begivenheden er forbi eller slettet, og går til /kalender', async () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt('/kalender/00000000-0000-0000-0000-000000000099')

    expect(
      await screen.findByText('Begivenheden er forbi eller slettet.'),
    ).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/kalender')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Kalender' })).toBeTruthy()
  })

  it('siger det kun én gang -- ikke igen efter "tilbage"', async () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt('/kalender/00000000-0000-0000-0000-000000000099')
    await screen.findByText('Begivenheden er forbi eller slettet.')

    fireEvent.click(screen.getByRole('button', { name: 'Gå til chat' }))
    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tilbage' }))

    expect(screen.getByRole('heading', { name: 'Kalender' })).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/kalender')
    expect(
      screen.queryByText('Begivenheden er forbi eller slettet.'),
    ).toBeNull()
  })

  it('venter med at dømme, til listen er hentet', () => {
    mocks.eventsQuery.data = undefined
    renderAt(`/kalender/${EVENT.id}`)

    expect(
      screen.queryByText('Begivenheden er forbi eller slettet.'),
    ).toBeNull()
    expect(screen.getByTestId('location').textContent).toBe(
      `/kalender/${EVENT.id}`,
    )
  })

  it('åbner ingenting på /kalender uden id', () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt('/kalender')

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// En begivenhed skal kunne rettes og gøres offentlig, efter den er oprettet
// -- ikke kun i selve oprettelsesflowet (se EventForm.test.tsx for selve
// formularens felter). Her måles, at redigeringsformularen faktisk gemmer
// gennem updateEvent (aldrig createEvent), og at det inkluderer at slå
// "Åben for ikke-medlemmer" til efter oprettelsen.
describe('CalendarPage: redigering af en eksisterende begivenhed', () => {
  it('gemmer en redigering gennem updateEvent, ikke createEvent', async () => {
    mocks.eventsQuery.data = [EVENT]
    mocks.updateEvent.mutateAsync.mockResolvedValue([])
    renderAt(`/kalender/${EVENT.id}`)

    fireEvent.click(await screen.findByRole('button', { name: 'Redigér' }))
    const form = await screen.findByRole('dialog', {
      name: 'Redigér begivenhed',
    })
    fireEvent.change(within(form).getByLabelText('Titel'), {
      target: { value: 'Svampetur i Rude Skov (flyttet)' },
    })
    fireEvent.submit(within(form).getByLabelText('Titel').closest('form')!)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.updateEvent.mutateAsync).toHaveBeenCalledWith({
      event: EVENT,
      input: expect.objectContaining({
        title: 'Svampetur i Rude Skov (flyttet)',
        is_public: false,
      }),
    })
    expect(mocks.createEvent.mutateAsync).not.toHaveBeenCalled()
  })

  it('kan gøre en eksisterende, privat begivenhed offentlig', async () => {
    mocks.eventsQuery.data = [EVENT]
    mocks.updateEvent.mutateAsync.mockResolvedValue([])
    renderAt(`/kalender/${EVENT.id}`)

    fireEvent.click(await screen.findByRole('button', { name: 'Redigér' }))
    const form = await screen.findByRole('dialog', {
      name: 'Redigér begivenhed',
    })
    const isPublic = within(form).getByLabelText(/Åben for ikke-medlemmer/)
    expect((isPublic as HTMLInputElement).checked).toBe(false)
    fireEvent.click(isPublic)
    fireEvent.submit(within(form).getByLabelText('Titel').closest('form')!)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.updateEvent.mutateAsync).toHaveBeenCalledWith({
      event: EVENT,
      input: expect.objectContaining({ is_public: true }),
    })
  })
})

describe('CalendarPage: tidligere begivenheder (#257)', () => {
  it('henter først de tidligere begivenheder, når man beder om dem', () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt('/kalender')

    expect(mocks.pastEventsEnabled).toHaveBeenLastCalledWith(false)
    fireEvent.click(
      screen.getByRole('button', { name: 'Vis tidligere begivenheder' }),
    )
    expect(mocks.pastEventsEnabled).toHaveBeenLastCalledWith(true)
  })

  it('viser de tidligere begivenheder og kan indlæse flere', () => {
    mocks.eventsQuery.data = [EVENT]
    mocks.pastEventsQuery.data = { pages: [[PAST_EVENT]] }
    mocks.pastEventsQuery.hasNextPage = true
    renderAt('/kalender')

    fireEvent.click(
      screen.getByRole('button', { name: 'Vis tidligere begivenheder' }),
    )
    const section = screen.getByRole('region', {
      name: 'Tidligere begivenheder',
    })
    expect(section.textContent).toContain('Fuglekig ved Tissø')

    fireEvent.click(
      within(section).getByRole('button', { name: 'Indlæs flere' }),
    )
    expect(mocks.pastEventsQuery.fetchNextPage).toHaveBeenCalled()
  })

  it('siger det, når der ingen tidligere begivenheder er', () => {
    mocks.eventsQuery.data = [EVENT]
    mocks.pastEventsQuery.data = { pages: [[]] }
    renderAt('/kalender')

    fireEvent.click(
      screen.getByRole('button', { name: 'Vis tidligere begivenheder' }),
    )
    expect(
      screen.getByText('Der er ingen tidligere begivenheder.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Indlæs flere' })).toBeNull()
  })

  it('åbner en tidligere begivenhed som afholdt, uden tilmelding og opgaver', () => {
    mocks.eventsQuery.data = [EVENT]
    mocks.pastEventsQuery.data = { pages: [[PAST_EVENT]] }
    renderAt('/kalender')

    fireEvent.click(
      screen.getByRole('button', { name: 'Vis tidligere begivenheder' }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Fuglekig ved Tissø/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Afholdt')).toBeTruthy()
    expect(within(dialog).getByText('Tilmelding lukket')).toBeTruthy()
    expect(within(dialog).queryByText('Opgaveliste')).toBeNull()
    expect(
      within(dialog).queryByRole('button', { name: 'Tilføj til kalender' }),
    ).toBeNull()
  })

  it('åbner en kommende begivenhed med tilmelding og opgaver', async () => {
    mocks.eventsQuery.data = [EVENT]
    renderAt(`/kalender/${EVENT.id}`)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText('Afholdt')).toBeNull()
    expect(within(dialog).getByText('Tilmelding åben')).toBeTruthy()
    expect(within(dialog).getByText('Opgaveliste')).toBeTruthy()
  })
})

describe('CalendarPage: flerdagsbegivenheder (#259)', () => {
  it('viser en weekendtur på alle tre dage i månedsvisningen', () => {
    const today = new Date()
    const month = today.getMonth()
    const year = today.getFullYear()
    mocks.eventsQuery.data = [
      {
        ...EVENT,
        id: '00000000-0000-0000-0000-0000000000e3',
        title: 'Weekend i Mols Bjerge',
        start_at: new Date(year, month, 10, 16, 0).toISOString(),
        end_at: new Date(year, month, 12, 14, 0).toISOString(),
      },
    ]
    renderAt('/kalender')

    const monthView = screen.getByRole('region', { name: 'Månedsvisning' })
    const chips = within(monthView).getAllByRole('button', {
      name: /Weekend i Mols Bjerge/,
    })
    expect(chips).toHaveLength(3)
    expect(chips[0]!.textContent).toMatch(/^16.00 Weekend i Mols Bjerge/)
    expect(chips[1]!.textContent).toContain('(fortsat)')
    expect(chips[2]!.textContent).toContain('til kl. 14.00')

    // Detaljerne skriver slutdatoen ud, ikke kun klokkeslættet.
    fireEvent.click(chips[1]!)
    expect(screen.getByRole('dialog').textContent).toMatch(
      /kl\. 16\.00 – \S+ den 12\. .*, kl\. 14\.00/,
    )
  })
})

describe('CalendarPage: link til billederne (#261)', () => {
  it('linker til begivenhedens album, når der er billeder', async () => {
    mocks.eventsQuery.data = [EVENT]
    mocks.photoCount.data = 12
    renderAt(`/kalender/${EVENT.id}`)

    const link = within(await screen.findByRole('dialog')).getByRole('link', {
      name: 'Se billeder (12)',
    })
    expect(link.getAttribute('href')).toBe(`/billeder?album=${EVENT.id}`)
  })

  it('viser intet link uden billeder, eller mens tallet hentes', async () => {
    mocks.eventsQuery.data = [EVENT]
    mocks.photoCount.data = 0
    renderAt(`/kalender/${EVENT.id}`)
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).queryByRole('link', { name: /Se billeder/ }),
    ).toBeNull()

    cleanup()
    mocks.photoCount.data = undefined
    renderAt(`/kalender/${EVENT.id}`)
    expect(
      within(await screen.findByRole('dialog')).queryByRole('link', {
        name: /Se billeder/,
      }),
    ).toBeNull()
  })
})
