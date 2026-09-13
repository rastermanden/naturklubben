import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePolls } from './usePolls'
import type { Message } from './useMessages'

const supabaseMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

const message: Message = {
  id: 'message-1',
  user_id: 'ada',
  content: 'Hvor skal vi hen på lørdag?',
  mentions: [],
  created_at: '2026-08-23T12:00:00.000Z',
  deleted_at: null,
  deleted_by: null,
  reply_to_message_id: null,
  reply_to: null,
}

describe('usePolls: createPoll', () => {
  it('maps create_poll\'s "options"/"votes" response (not poll_options/poll_votes) so the new poll shows its options immediately', async () => {
    // Reproducerer den faktiske form af svaret fra migrationen
    // 20260913180000_chat_polls.sql's create_poll, testet af
    // supabase/tests/rls/18_chat_polls.sql ("created -> 'options' -> 0").
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        id: 'poll-1',
        message_id: 'message-1',
        question: 'Hvor skal vi hen på lørdag?',
        created_by: 'ada',
        closed_at: null,
        closed_by: null,
        options: [
          { id: 'option-1', poll_id: 'poll-1', position: 0, label: 'Skoven' },
          {
            id: 'option-2',
            poll_id: 'poll-1',
            position: 1,
            label: 'Stranden',
          },
        ],
        votes: [],
      },
      error: null,
    })
    const chain = { on: vi.fn(), subscribe: vi.fn() }
    chain.on.mockReturnValue(chain)
    chain.subscribe.mockReturnValue(chain)
    supabaseMocks.channel.mockReturnValue(chain)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const { result } = renderHook(() => usePolls([message], 'ada'), {
      wrapper: wrapper(queryClient),
    })

    let created: { options: unknown[] } | undefined
    await act(async () => {
      created = (await result.current.createPoll.mutateAsync({
        messageId: 'message-1',
        options: ['Skoven', 'Stranden'],
      })) as { options: unknown[] }
    })

    expect(created?.options).toHaveLength(2)

    queryClient.clear()
  })
})
