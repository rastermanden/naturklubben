import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationTypePreferences } from './NotificationTypePreferences'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))
const adminMock = vi.hoisted(() => ({ isAdmin: false }))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))
vi.mock('../admin/useIsAdmin', () => ({
  useIsAdmin: () => ({ isAdmin: adminMock.isAdmin, loading: false }),
}))

const REVIEW_LABEL = 'Når et medlem indstilles til en badge, der skal godkendes'

function mockPreferenceRows(rows: { kind: string; enabled: boolean }[]) {
  supabaseMocks.from.mockImplementation(() => ({
    select: () => ({
      eq: () => Promise.resolve({ data: rows, error: null }),
    }),
  }))
}

function renderPreferences() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationTypePreferences userId="member-id" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  adminMock.isAdmin = false
  supabaseMocks.rpc.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('NotificationTypePreferences', () => {
  it('viser kalendertyperne slået til, når medlemmet ikke har valgt noget', async () => {
    mockPreferenceRows([])
    renderPreferences()

    const reminder = await screen.findByLabelText(
      'Dagen før en begivenhed, jeg er tilmeldt',
    )
    expect((reminder as HTMLInputElement).checked).toBe(true)
    expect(
      (
        screen.getByLabelText(
          'Når der kommer en ny begivenhed i kalenderen',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true)
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('viser ikke admin-valget for et almindeligt medlem', async () => {
    mockPreferenceRows([])
    renderPreferences()

    await screen.findByLabelText('Dagen før en begivenhed, jeg er tilmeldt')
    expect(screen.queryByLabelText(REVIEW_LABEL)).toBeNull()
  })

  it('viser admin-valget for en admin, slået til som standard', async () => {
    adminMock.isAdmin = true
    mockPreferenceRows([])
    renderPreferences()

    const review = await screen.findByLabelText(REVIEW_LABEL)
    expect((review as HTMLInputElement).checked).toBe(true)
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('viser et gemt fravalg', async () => {
    adminMock.isAdmin = true
    mockPreferenceRows([{ kind: 'badge_nomination_review', enabled: false }])
    renderPreferences()

    const review = await screen.findByLabelText(REVIEW_LABEL)
    expect((review as HTMLInputElement).checked).toBe(false)
    expect(
      (
        screen.getByLabelText(
          'Dagen før en begivenhed, jeg er tilmeldt',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true)
  })

  it('gemmer et fravalg gennem RPC og viser det med det samme', async () => {
    mockPreferenceRows([])
    renderPreferences()

    const reminder = await screen.findByLabelText(
      'Dagen før en begivenhed, jeg er tilmeldt',
    )
    fireEvent.click(reminder)

    await vi.waitFor(() =>
      expect(supabaseMocks.rpc).toHaveBeenCalledWith(
        'set_notification_preference',
        { p_kind: 'event_reminder', p_enabled: false },
      ),
    )
    await vi.waitFor(() =>
      expect((reminder as HTMLInputElement).checked).toBe(false),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('fortæller, når indstillingerne ikke kunne hentes', async () => {
    supabaseMocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => Promise.resolve({ data: null, error: new Error('nede') }),
      }),
    }))
    renderPreferences()

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Indstillingerne kunne ikke hentes. Prøv igen om lidt.',
    )
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('fortæller, når valget ikke kunne gemmes', async () => {
    mockPreferenceRows([])
    supabaseMocks.rpc.mockResolvedValue({
      data: null,
      error: new Error('nede'),
    })
    renderPreferences()

    fireEvent.click(
      await screen.findByLabelText(
        'Når der kommer en ny begivenhed i kalenderen',
      ),
    )

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Valget kunne ikke gemmes. Prøv igen.',
    )
  })
})
