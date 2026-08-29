import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/AuthContext'
import NewsPage from './NewsPage'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  functions: { invoke: vi.fn() },
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))

vi.mock('../features/notifications/NotificationToggle', () => ({
  NotificationToggle: () => null,
}))

vi.mock('../features/announcements/FeatureNotificationPreference', () => ({
  FeatureNotificationPreference: () => null,
}))

const upsert = vi.fn()

const ANNOUNCEMENT = {
  id: 'announcement-1',
  slug: 'kalender-i-appen',
  title: 'Kalenderen er kommet i appen',
  body: 'Se klubbens ture og meld dig til.',
  path: 'kalender',
  released_at: '2026-08-20T09:00:00.000Z',
}

beforeEach(() => {
  upsert.mockResolvedValue({ error: null })
  supabaseMocks.functions.invoke.mockResolvedValue({ error: null })
  supabaseMocks.from.mockImplementation((table: string) => {
    if (table === 'feature_announcements') {
      return {
        select: () => ({
          order: () => Promise.resolve({ data: [ANNOUNCEMENT], error: null }),
        }),
      }
    }
    return {
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      upsert,
    }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{
            session: { user: { id: 'member-id' } } as Session,
            loading: false,
            signOut: () => Promise.resolve(),
          }}
        >
          <NewsPage />
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('NewsPage', () => {
  it('viser nyheden med dato og et Ny-mærke, så længe man er på siden', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: ANNOUNCEMENT.title }),
    ).toBeTruthy()
    expect(screen.getByText('20. august 2026')).toBeTruthy()
    expect(screen.getByText('Ny')).toBeTruthy()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('markerer nyhederne som læst, når siden forlades', async () => {
    const { unmount } = renderPage()
    await screen.findByRole('heading', { name: ANNOUNCEMENT.title })

    unmount()

    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith(
        [{ announcement_id: 'announcement-1', user_id: 'member-id' }],
        { onConflict: 'announcement_id,user_id', ignoreDuplicates: true },
      ),
    )
  })
})
