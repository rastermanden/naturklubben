import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuestRequestsSection } from './GuestRequestsSection'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))

const EVENT_ID = '3f2c1a4e-5b6d-4c7e-8f90-1a2b3c4d5e6f'

const EVENT = {
  title: 'Åben skovtur',
  location: 'Dyrehaven',
  start_at: '2030-09-10T09:00:00.000Z',
  end_at: '2030-09-10T11:00:00.000Z',
}

const PENDING = {
  id: 'a1',
  event_id: EVENT_ID,
  full_name: 'Gitte Gæst',
  email: 'gitte@example.com',
  message: 'Vi er to voksne.',
  party_size: 2,
  status: 'pending',
  created_at: '2030-09-01T10:00:00.000Z',
}

const APPROVED = {
  ...PENDING,
  id: 'a2',
  full_name: 'Tobias',
  email: 'tobias@example.com',
  message: null,
  party_size: 1,
  status: 'approved',
}

let requests: unknown[]

beforeEach(() => {
  requests = [PENDING, APPROVED]
  supabaseMocks.rpc.mockResolvedValue({ data: null, error: null })
  supabaseMocks.from.mockImplementation((table: string) => {
    expect(table).toBe('event_guest_requests')
    return {
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: requests, error: null }),
        }),
      }),
    }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderSection(canManage = true, isPublic = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <GuestRequestsSection
        eventId={EVENT_ID}
        isPublic={isPublic}
        canManage={canManage}
        event={EVENT}
      />
    </QueryClientProvider>,
  )
}

describe('GuestRequestsSection', () => {
  it('renders nothing for members who cannot manage the event', () => {
    const { container } = renderSection(false)

    expect(container.innerHTML).toBe('')
    expect(supabaseMocks.from).not.toHaveBeenCalled()
  })

  it('keeps showing requests after the organiser closes the event again', async () => {
    renderSection(true, false)

    expect(await screen.findByText('Gitte Gæst · 2 personer')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Godkend Gitte Gæst' }),
    ).toBeTruthy()
  })

  it('renders nothing for a private event without requests', async () => {
    requests = []
    const { container } = renderSection(true, false)

    await vi.waitFor(() => expect(supabaseMocks.from).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('tells the organiser when nobody has applied to a public event', async () => {
    requests = []
    renderSection()

    expect(
      await screen.findByText('Ingen har søgt om at deltage endnu.'),
    ).toBeTruthy()
  })

  it('shows pending requests with their e-mail and details', async () => {
    renderSection()

    expect(await screen.findByText('Gitte Gæst · 2 personer')).toBeTruthy()
    expect(screen.getByText('(1 venter)')).toBeTruthy()
    expect(screen.getByText('Vi er to voksne.')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'gitte@example.com' })
        .getAttribute('href'),
    ).toBe('mailto:gitte@example.com')
    expect(screen.getByText('Tobias')).toBeTruthy()
  })

  it('approves through the RPC', async () => {
    renderSection()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Godkend Gitte Gæst' }),
    )

    await vi.waitFor(() => {
      expect(supabaseMocks.rpc).toHaveBeenCalledWith(
        'approve_event_guest_request',
        { request_id: 'a1' },
      )
    })
  })

  it('rejects through the RPC', async () => {
    renderSection()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Afvis Gitte Gæst' }),
    )

    await vi.waitFor(() => {
      expect(supabaseMocks.rpc).toHaveBeenCalledWith(
        'reject_event_guest_request',
        { request_id: 'a1' },
      )
    })
  })

  it('shows a "Skriv til gæsten" mailto link for an approved guest', async () => {
    renderSection()

    const link = await screen.findByRole('link', { name: 'Skriv til gæsten' })
    const href = decodeURIComponent(link.getAttribute('href') ?? '')

    expect(href.startsWith('mailto:tobias@example.com?')).toBe(true)
    expect(href).toContain('subject=Du er velkommen til "Åben skovtur"')
    expect(href).toContain('Sted: Dyrehaven')
  })

  it('shows a rejected reply mailto with the neutral wording', async () => {
    requests = [
      {
        ...APPROVED,
        id: 'a3',
        full_name: 'Rejected Person',
        status: 'rejected',
      },
    ]
    renderSection()

    const link = await screen.findByRole('link', { name: 'Skriv til gæsten' })
    const href = decodeURIComponent(link.getAttribute('href') ?? '')

    expect(href).toContain(
      'Vi kan desværre ikke tage imod din ansøgning denne gang.',
    )
  })

  it('explains a refused decision', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    })
    renderSection()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Godkend Gitte Gæst' }),
    )

    expect(
      (
        await screen.findByText(
          'Kun arrangøren eller en admin kan afgøre ansøgningen.',
        )
      ).textContent,
    ).toBeTruthy()
  })
})
