import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeatureAnnouncementBanner } from './FeatureAnnouncementBanner'
import { resetFeatureAnnouncementDelivery } from './useFeatureAnnouncements'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  functions: { invoke: vi.fn() },
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))

const upsert = vi.fn()

const ANNOUNCEMENT = {
  id: 'announcement-1',
  slug: 'kalender-i-appen',
  title: 'Kalenderen er kommet i appen',
  body: 'Se klubbens ture og meld dig til.',
  path: 'kalender',
  released_at: new Date().toISOString(),
}

function mockTables(readIds: string[]) {
  supabaseMocks.from.mockImplementation((table: string) => {
    if (table === 'feature_announcements') {
      return {
        select: () => ({
          order: () => Promise.resolve({ data: [ANNOUNCEMENT], error: null }),
        }),
      }
    }
    return {
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: readIds.map((id) => ({ announcement_id: id })),
            error: null,
          }),
      }),
      upsert,
    }
  })
}

function renderBanner(path = '/chat') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <FeatureAnnouncementBanner userId="member-id" />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  resetFeatureAnnouncementDelivery()
  upsert.mockResolvedValue({ error: null })
  supabaseMocks.functions.invoke.mockResolvedValue({ error: null })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FeatureAnnouncementBanner', () => {
  it('viser den nyhed, medlemmet ikke har set', async () => {
    mockTables([])
    renderBanner()

    expect(
      await screen.findByRole('heading', { name: ANNOUNCEMENT.title }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Prøv den' })).toBeTruthy()
  })

  it('forsvinder, når medlemmet har kvitteret', async () => {
    mockTables([])
    renderBanner()

    fireEvent.click(await screen.findByRole('button', { name: 'Fik den' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: ANNOUNCEMENT.title }),
      ).toBeNull(),
    )
    expect(upsert).toHaveBeenCalledWith(
      [{ announcement_id: 'announcement-1', user_id: 'member-id' }],
      { onConflict: 'announcement_id,user_id', ignoreDuplicates: true },
    )
  })

  it('viser intet, når nyheden allerede er set', async () => {
    mockTables(['announcement-1'])
    renderBanner()

    await waitFor(() =>
      expect(supabaseMocks.functions.invoke).toHaveBeenCalled(),
    )
    expect(
      screen.queryByRole('heading', { name: ANNOUNCEMENT.title }),
    ).toBeNull()
  })

  it('gentager ikke siden Nyheder, når man står på den', async () => {
    mockTables([])
    renderBanner('/nyheder')

    await waitFor(() =>
      expect(supabaseMocks.functions.invoke).toHaveBeenCalled(),
    )
    expect(
      screen.queryByRole('heading', { name: ANNOUNCEMENT.title }),
    ).toBeNull()
  })
})
