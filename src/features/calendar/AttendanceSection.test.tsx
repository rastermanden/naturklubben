import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttendanceSection } from './AttendanceSection'
import type { EventAttendance } from './useEventAttendance'
import type { CalendarEvent } from './useEvents'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))
const announceInChat = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabaseClient', () => ({ supabase: supabaseMocks }))
vi.mock('../profile/announceInChat', () => ({ announceInChat }))

const EVENT: CalendarEvent = {
  id: 'event-1',
  title: 'Skovtur',
  description: null,
  location: null,
  start_at: '2026-09-20T08:00:00Z',
  end_at: null,
  created_by: 'alice',
  max_participants: 2,
}

const PROFILES = [
  { id: 'alice', full_name: 'Alice Andersen' },
  { id: 'bob', full_name: 'Bo Berg' },
  { id: 'carol', full_name: 'Carol Hansen' },
  { id: 'dave', full_name: 'Dave Dahl' },
  { id: 'erik', full_name: 'Erik Eriksen' },
].map((profile) => ({
  ...profile,
  pronouns: null,
  causes: [],
  avatar_url: null,
  chat_color: null,
}))

function entry(
  user_id: string,
  status: EventAttendance['status'],
  minute: number,
): EventAttendance {
  return {
    event_id: EVENT.id,
    user_id,
    status,
    created_at: `2026-09-01T10:0${minute}:00Z`,
  }
}

function mockTables(attendance: EventAttendance[]) {
  supabaseMocks.from.mockImplementation((table: string) => {
    if (table === 'event_attendance') {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: attendance, error: null }),
          }),
        }),
      }
    }
    if (table === 'profiles') {
      return {
        select: () => Promise.resolve({ data: PROFILES, error: null }),
      }
    }
    throw new Error(`Uventet tabel: ${table}`)
  })
}

function renderSection(userId: string, canManage = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AttendanceSection event={EVENT} userId={userId} canManage={canManage} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockTables([
    entry('alice', 'attending', 0),
    entry('bob', 'attending', 1),
    entry('dave', 'waitlisted', 3),
    entry('carol', 'waitlisted', 2),
    entry('erik', 'declined', 4),
  ])
  supabaseMocks.rpc.mockResolvedValue({
    data: { status: null, promoted: [] },
    error: null,
  })
  announceInChat.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AttendanceSection', () => {
  it('viser pladser, ventelisten i rækkefølge og egen placering', async () => {
    renderSection('dave')

    await screen.findByText('(2/2 pladser)')
    const waitlist = screen.getByRole('list', { name: 'Venteliste' })
    // Avataren er skjult for skærmlæsere (initialer), så navnet læses fra
    // det synlige tekstspan alene.
    const names = within(waitlist)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('span.truncate')?.textContent)
    expect(names).toEqual(['Carol Hansen', 'Dave Dahl (dig)'])
    expect(within(waitlist).getByText('1.')).toBeTruthy()
    expect(within(waitlist).getByText('2.')).toBeTruthy()
    expect(
      screen.getByText(/Du står som nr\. 2 på ventelisten/).textContent,
    ).toContain('nr. 2')
    expect(
      screen.getByRole('button', { name: 'Forlad ventelisten' }),
    ).toBeTruthy()
    expect(
      within(screen.getByRole('list', { name: 'Kan ikke' })).getByText(
        'Erik Eriksen',
      ),
    ).toBeTruthy()
  })

  it('tilbyder ventelisten, når der er fyldt op, og et afbud', async () => {
    renderSection('frida')

    await screen.findByText('(2/2 pladser)')
    expect(
      screen.getByRole('button', { name: 'Skriv mig på ventelisten' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Kan ikke' }))

    await waitFor(() =>
      expect(supabaseMocks.rpc).toHaveBeenCalledWith('respond_to_event', {
        p_event_id: 'event-1',
        p_response: 'declined',
      }),
    )
  })

  it('viser afbuddet og lader det fortryde', async () => {
    mockTables([entry('alice', 'attending', 0), entry('frida', 'declined', 1)])
    renderSection('frida')

    await screen.findByText('Du har meldt afbud.')
    fireEvent.click(screen.getByRole('button', { name: 'Fortryd afbud' }))

    await waitFor(() =>
      expect(supabaseMocks.rpc).toHaveBeenCalledWith('respond_to_event', {
        p_event_id: 'event-1',
        p_response: 'none',
      }),
    )
  })

  it('fortæller den oprykkede i chatten, når et afbud gav en plads', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: { status: null, promoted: ['carol'] },
      error: null,
    })
    renderSection('bob')

    await screen.findByText('(2/2 pladser)')
    fireEvent.click(screen.getByRole('button', { name: 'Frameld' }))

    await waitFor(() =>
      expect(announceInChat).toHaveBeenCalledWith(
        'bob',
        'har meldt afbud til «Skovtur», så @Carol Hansen har fået pladsen fra ventelisten',
        ['carol'],
      ),
    )
  })

  it('viser en fejl, når svaret ikke kunne gemmes', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: new Error('nej') })
    renderSection('bob')

    await screen.findByText('(2/2 pladser)')
    fireEvent.click(screen.getByRole('button', { name: 'Frameld' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Tilmeldingen kunne ikke ændres',
    )
    expect(announceInChat).not.toHaveBeenCalled()
  })

  it('skjuler "hvem mangler at svare" for almindelige medlemmer', async () => {
    renderSection('bob')

    await screen.findByText('(2/2 pladser)')
    expect(screen.queryByText('Hvem mangler at svare?')).toBeNull()
    expect(supabaseMocks.rpc).not.toHaveBeenCalledWith(
      'event_members_without_response',
      expect.anything(),
    )
  })

  it('lader arrangøren se, hvem der mangler at svare, og minde dem om det', async () => {
    supabaseMocks.rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'event_members_without_response'
          ? { data: [{ user_id: 'frida' }, { user_id: 'gorm' }], error: null }
          : { data: null, error: new Error('uventet') },
      ),
    )
    renderSection('alice', true)

    await screen.findByText('(2/2 pladser)')
    fireEvent.click(
      screen.getByRole('button', { name: 'Hvem mangler at svare?' }),
    )

    await screen.findByText('2 har ikke svaret endnu.')
    expect(supabaseMocks.rpc).toHaveBeenCalledWith(
      'event_members_without_response',
      { p_event_id: 'event-1' },
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Send påmindelse i chatten' }),
    )

    await screen.findByRole('button', {
      name: 'Påmindelsen er sendt i chatten',
    })
    const [userId, content, mentions] = announceInChat.mock.calls[0]
    expect(userId).toBe('alice')
    expect(mentions).toEqual(['frida', 'gorm'])
    expect(content).toMatch(
      /^minder om «Skovtur» .*: @Medlem og @Medlem har ikke svaret endnu/,
    )
  })
})
