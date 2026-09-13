import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/AuthContext'
import PublicCalendarPage from './PublicCalendarPage'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  functions: { invoke: vi.fn() },
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))

const PUBLIC_EVENT = {
  id: '3f2c1a4e-5b6d-4c7e-8f90-1a2b3c4d5e6f',
  title: 'Åben skovtur',
  description: 'Alle er velkomne. Husk madpakke.',
  location: 'Rude Skov',
  start_at: '2030-10-03T08:00:00.000Z',
  end_at: '2030-10-03T11:00:00.000Z',
}

const selectedColumns: string[] = []

beforeEach(() => {
  selectedColumns.length = 0
  supabaseMocks.functions.invoke.mockResolvedValue({
    data: { accepted: true },
    error: null,
  })
  supabaseMocks.from.mockImplementation((table: string) => {
    expect(table).toBe('public_events')
    return {
      select: (columns: string) => {
        selectedColumns.push(columns)
        return {
          gte: () => ({
            order: () => Promise.resolve({ data: [PUBLIC_EVENT], error: null }),
          }),
        }
      },
    }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage(session: Session | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{ session, loading: false, signOut: () => Promise.resolve() }}
        >
          <PublicCalendarPage />
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('PublicCalendarPage', () => {
  it('lists public events from the anon view without organiser data', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Åben skovtur' }),
    ).toBeTruthy()
    expect(screen.getByText(/Rude Skov/)).toBeTruthy()
    expect(screen.getByText('Alle er velkomne. Husk madpakke.')).toBeTruthy()
    expect(selectedColumns).toEqual([
      'id, title, description, location, start_at, end_at',
    ])
    expect(selectedColumns[0]).not.toContain('created_by')
    // Uden login peger siden på login, ikke på medlemskalenderen.
    expect(screen.getByRole('link', { name: 'Log ind' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Til medlemskalenderen' })).toBe(
      null,
    )
  })

  it('lets a visitor apply through the Edge Function and confirms by e-mail', async () => {
    renderPage()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Søg om at deltage' }),
    )

    const dialog = screen.getByRole('dialog', { name: 'Søg om at deltage' })
    expect(dialog).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Navn'), {
      target: { value: 'Gitte Gæst' },
    })
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'gitte@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Antal personer'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('Besked til arrangøren (valgfri)'), {
      target: { value: 'Vi er to voksne.' },
    })
    fireEvent.submit(screen.getByLabelText('Navn').closest('form')!)

    expect(
      await screen.findByRole('heading', { name: 'Ansøgning modtaget' }),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('heading', { name: 'Ansøgning modtaget' })
        .closest('div')!.textContent,
    ).toMatch(/du hører fra en arrangør pr\. e-mail/i)
    expect(supabaseMocks.functions.invoke).toHaveBeenCalledWith(
      'submit-event-guest-request',
      {
        body: {
          eventId: PUBLIC_EVENT.id,
          fullName: 'Gitte Gæst',
          email: 'gitte@example.com',
          message: 'Vi er to voksne.',
          partySize: 2,
        },
      },
    )
  })

  it('links a logged-in member to the full calendar', async () => {
    renderPage({ user: { id: 'member-id' } } as Session)

    expect(
      await screen.findByRole('link', { name: 'Til medlemskalenderen' }),
    ).toBeTruthy()
  })
})
