import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetFeatureAnnouncementDelivery,
  useFeatureAnnouncementDelivery,
  useFeatureAnnouncements,
} from './useFeatureAnnouncements'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  functions: { invoke: vi.fn() },
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))

const ANNOUNCEMENT = {
  id: 'announcement-1',
  slug: 'nyheder-om-nye-funktioner',
  title: 'Du får nu besked, når appen får noget nyt',
  body: 'Nye funktioner dukker op under Nyheder.',
  path: 'nyheder',
  released_at: new Date().toISOString(),
}

const upsert = vi.fn()

function mockTables({
  announcements = [ANNOUNCEMENT],
  readIds = [] as string[],
}) {
  supabaseMocks.from.mockImplementation((table: string) => {
    if (table === 'feature_announcements') {
      return {
        select: () => ({
          order: () => Promise.resolve({ data: announcements, error: null }),
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

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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

describe('useFeatureAnnouncements', () => {
  it('regner en nyhed, medlemmet ikke har set, som ulæst', async () => {
    mockTables({})

    const { result } = renderHook(() => useFeatureAnnouncements('member-id'), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.unread.map(({ id }) => id)).toEqual([
      'announcement-1',
    ])
  })

  it('regner en set nyhed som læst', async () => {
    mockTables({ readIds: ['announcement-1'] })

    const { result } = renderHook(() => useFeatureAnnouncements('member-id'), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.unread).toHaveLength(0)
    expect(result.current.announcements[0].isRead).toBe(true)
  })

  it('gemmer læsemarkeringen på medlemmets egen række', async () => {
    mockTables({})

    const { result } = renderHook(() => useFeatureAnnouncements('member-id'), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.markAsRead(['announcement-1'])
    })

    expect(upsert).toHaveBeenCalledWith(
      [{ announcement_id: 'announcement-1', user_id: 'member-id' }],
      { onConflict: 'announcement_id,user_id', ignoreDuplicates: true },
    )
    await waitFor(() => expect(result.current.unread).toHaveLength(0))
  })

  it('skriver ikke en tom markering', async () => {
    mockTables({ readIds: ['announcement-1'] })

    const { result } = renderHook(() => useFeatureAnnouncements('member-id'), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.markAsRead([])
    })

    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('useFeatureAnnouncementDelivery', () => {
  it('beder serveren sende en ny nyhed -- og kun én gang pr. indlæsning', () => {
    const { rerender } = renderHook(
      () => useFeatureAnnouncementDelivery([ANNOUNCEMENT]),
      { wrapper: Wrapper },
    )
    rerender()

    expect(supabaseMocks.functions.invoke).toHaveBeenCalledTimes(1)
    expect(supabaseMocks.functions.invoke).toHaveBeenCalledWith(
      'feature-announcements',
      { method: 'POST' },
    )
  })

  it('lader være for en nyhed, der er faldet ud af leveringsvinduet', () => {
    const old = {
      ...ANNOUNCEMENT,
      released_at: new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    }

    renderHook(() => useFeatureAnnouncementDelivery([old]), {
      wrapper: Wrapper,
    })

    expect(supabaseMocks.functions.invoke).not.toHaveBeenCalled()
  })

  it('lader være, når der ingen nyheder er', () => {
    renderHook(() => useFeatureAnnouncementDelivery([]), { wrapper: Wrapper })

    expect(supabaseMocks.functions.invoke).not.toHaveBeenCalled()
  })
})
