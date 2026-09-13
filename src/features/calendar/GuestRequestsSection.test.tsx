import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuestRequestsSection } from './GuestRequestsSection'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  functions: { invoke: vi.fn() },
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))

const EVENT_ID = '3f2c1a4e-5b6d-4c7e-8f90-1a2b3c4d5e6f'

const PENDING = {
  id: 'a1',
  event_id: EVENT_ID,
  full_name: 'Gitte Gæst',
  email: 'gitte@example.com',
  message: 'Vi er to voksne.',
  party_size: 2,
  status: 'pending',
  created_at: '2030-09-01T10:00:00.000Z',
  decision_notification_status: null,
  decision_notification_error: null,
}

const APPROVED_WITH_FAILED_MAIL = {
  ...PENDING,
  id: 'a2',
  full_name: 'Tobias',
  email: 'tobias@example.com',
  message: null,
  party_size: 1,
  status: 'approved',
  decision_notification_status: 'failed',
  decision_notification_error:
    'Der er ikke sat en mailudbyder op (RESEND_API_KEY mangler). Giv gæsten besked på anden vis.',
}

let requests: unknown[]

beforeEach(() => {
  requests = [PENDING, APPROVED_WITH_FAILED_MAIL]
  supabaseMocks.rpc.mockResolvedValue({ data: null, error: null })
  supabaseMocks.functions.invoke.mockResolvedValue({
    data: { status: 'sent' },
    error: null,
  })
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

  it('shows pending requests with their details and the failed mail state', async () => {
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
    expect(screen.getByText(/RESEND_API_KEY mangler/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send igen' })).toBeTruthy()
  })

  it('approves through the RPC and then triggers the e-mail delivery', async () => {
    renderSection()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Godkend Gitte Gæst' }),
    )

    await vi.waitFor(() => {
      expect(supabaseMocks.rpc).toHaveBeenCalledWith(
        'approve_event_guest_request',
        { request_id: 'a1' },
      )
      expect(supabaseMocks.functions.invoke).toHaveBeenCalledWith(
        'event-guest-notifications',
        { body: { requestId: 'a1' } },
      )
    })
  })

  it('does not report a failure when only the status call after a decision fails', async () => {
    supabaseMocks.functions.invoke.mockResolvedValue({
      data: null,
      error: new Error('Failed to send a request to the Edge Function'),
    })
    renderSection()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Godkend Gitte Gæst' }),
    )

    const notice = await screen.findByText(
      'Afgørelsen er gemt. Svaret sendes automatisk – se status ved gæsten.',
    )
    expect(notice.getAttribute('role')).toBe('status')
    expect(
      screen.queryByText(/Afgørelsen er gemt, men mailen kunne ikke sendes/),
    ).toBeNull()
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

  it('retries a failed e-mail and shows why it still did not go out', async () => {
    supabaseMocks.functions.invoke.mockResolvedValue({
      data: {
        status: 'failed',
        error: 'Mailudbyderen svarede 403: Domain not verified',
      },
      error: null,
    })
    renderSection()

    fireEvent.click(await screen.findByRole('button', { name: 'Send igen' }))

    await vi.waitFor(() => {
      expect(supabaseMocks.functions.invoke).toHaveBeenCalledWith(
        'event-guest-notifications',
        { body: { requestId: 'a2' } },
      )
    })
    expect(
      await screen.findByText('Mailudbyderen svarede 403: Domain not verified'),
    ).toBeTruthy()
  })

  it('shows no error when another delivery is already in flight', async () => {
    supabaseMocks.functions.invoke.mockResolvedValue({
      data: { status: 'sending', skipped: true },
      error: null,
    })
    renderSection()

    fireEvent.click(await screen.findByRole('button', { name: 'Send igen' }))

    await vi.waitFor(() => {
      expect(supabaseMocks.functions.invoke).toHaveBeenCalledWith(
        'event-guest-notifications',
        { body: { requestId: 'a2' } },
      )
    })
    expect(
      screen.queryByText('Mailen blev ikke sendt. Prøv igen om lidt.'),
    ).toBeNull()
    expect(screen.queryByText('Mailen kunne ikke sendes.')).toBeNull()
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
