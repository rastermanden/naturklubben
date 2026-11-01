import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  positions: [] as unknown[],
  rpc: vi.fn(),
}))

vi.mock('../../lib/supabaseClient', () => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  }
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: mocks.positions, error: null }),
        }),
      }),
      rpc: mocks.rpc,
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  }
})

import { useReadReceipts } from './useReadReceipts'
import type { Message } from './useMessages'

function message(id: string, created_at: string): Message {
  return {
    id,
    user_id: 'alice',
    content: 'Hej',
    mentions: [],
    created_at,
    deleted_at: null,
    deleted_by: null,
    reply_to_message_id: null,
    reply_to: null,
  }
}

const messages = [
  message('m1', '2026-11-01T10:00:00Z'),
  message('m2', '2026-11-01T10:01:00Z'),
]

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  mocks.positions = []
  mocks.rpc.mockReset()
})

describe('useReadReceipts (#294)', () => {
  it('markerer den nyeste besked som læst, når den er på skærmen', async () => {
    mocks.rpc.mockResolvedValue({ error: null })
    renderHook(() => useReadReceipts('general', messages, 'me', true), {
      wrapper,
    })
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('mark_chat_read', {
        p_message_id: 'm2',
      }),
    )
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('markerer intet, når bunden af chatten ikke er på skærmen', async () => {
    const { result } = renderHook(
      () => useReadReceipts('general', messages, 'me', false),
      { wrapper },
    )
    await waitFor(() => expect(result.current.positions).toEqual([]))
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('markerer intet, når man allerede har læst den nyeste besked', async () => {
    mocks.positions = [
      {
        user_id: 'me',
        room: 'general',
        last_read_message_id: 'm2',
        last_read_at: '2026-11-01T10:01:00Z',
      },
    ]
    const { result } = renderHook(
      () => useReadReceipts('general', messages, 'me', true),
      { wrapper },
    )
    await waitFor(() => expect(result.current.positions).toHaveLength(1))
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
