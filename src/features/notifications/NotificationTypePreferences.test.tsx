import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationTypePreferences } from './NotificationTypePreferences'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))

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
  supabaseMocks.rpc.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('NotificationTypePreferences', () => {
  it('viser de tre typer slået til, når medlemmet ikke har valgt noget', async () => {
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
    expect(
      (
        screen.getByLabelText(
          'Når jeg bliver indstillet til en badge',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true)
  })

  it('viser et gemt fravalg', async () => {
    mockPreferenceRows([{ kind: 'badge_nomination', enabled: false }])
    renderPreferences()

    const nomination = await screen.findByLabelText(
      'Når jeg bliver indstillet til en badge',
    )
    expect((nomination as HTMLInputElement).checked).toBe(false)
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

  it('fortæller, når valget ikke kunne gemmes', async () => {
    mockPreferenceRows([])
    supabaseMocks.rpc.mockResolvedValue({
      data: null,
      error: new Error('nede'),
    })
    renderPreferences()

    fireEvent.click(
      await screen.findByLabelText('Når jeg bliver indstillet til en badge'),
    )

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Valget kunne ikke gemmes. Prøv igen.',
    )
  })
})
