import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addMessage,
  addMessageToHistory,
  messageFields,
  needsReplyRefetch,
  mergeMessagePages,
  normalizeMessage,
  removeMessage,
  updateMessage,
  useMessages,
  type Message,
} from './useMessages'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  rpc: vi.fn(),
  functions: { invoke: vi.fn() },
}))

vi.mock('../../lib/supabaseClient', () => ({ supabase: supabaseMocks }))

const parent: Message = {
  id: 'message-1',
  user_id: 'member-1',
  content: 'Vi mødes ved søen.',
  mentions: [],
  created_at: '2026-08-23T12:00:00.000Z',
  deleted_at: null,
  deleted_by: null,
  reply_to_message_id: null,
  reply_to: null,
}

describe('message reply data', () => {
  it('normalizes the self relation returned by PostgREST', () => {
    const message = normalizeMessage({
      id: 'message-2',
      user_id: 'member-2',
      content: 'God idé!',
      mentions: [],
      created_at: '2026-08-23T12:01:00.000Z',
      reply_to_message_id: parent.id,
      reply_to: [
        {
          id: parent.id,
          user_id: parent.user_id,
          content: parent.content,
          deleted_at: null,
          deleted_by: null,
        },
      ],
    })

    expect(message.reply_to).toEqual({
      id: parent.id,
      user_id: parent.user_id,
      content: parent.content,
      deleted_at: null,
      deleted_by: null,
    })
  })

  describe('message history pagination', () => {
    it('merges older pages chronologically and removes keyset-boundary duplicates', () => {
      const newer = {
        ...parent,
        id: 'message-3',
        created_at: '2026-08-23T12:02:00.000Z',
      }
      const boundary = {
        ...parent,
        id: 'message-2',
        created_at: '2026-08-23T12:01:00.000Z',
      }

      expect(
        mergeMessagePages([
          { messages: [newer, boundary], hasMore: true },
          { messages: [boundary, parent], hasMore: false },
        ]),
      ).toEqual([parent, boundary, newer])
    })

    it('keeps the final short page as the end of history', () => {
      const pages = [
        { messages: [parent], hasMore: false },
        { messages: [], hasMore: false },
      ]

      expect(mergeMessagePages(pages)).toEqual([parent])
      expect(pages.at(-1)?.hasMore).toBe(false)
    })

    it('preserves loaded page cursors when a realtime message arrives', () => {
      const older = {
        ...parent,
        id: 'message-0',
        created_at: '2026-08-23T11:59:00.000Z',
      }
      const realtime = {
        ...parent,
        id: 'message-2',
        created_at: '2026-08-23T12:01:00.000Z',
      }
      const history = {
        pages: [
          { messages: [parent], hasMore: true },
          { messages: [older], hasMore: false },
        ],
        pageParams: [
          undefined,
          { createdAt: parent.created_at, id: parent.id },
        ],
      }

      const updated = addMessageToHistory(history, realtime)

      expect(updated?.pages).toHaveLength(2)
      expect(updated?.pageParams).toEqual(history.pageParams)
      expect(updated?.pages[0]?.messages).toEqual([realtime, parent])
      expect(updated?.pages[1]).toBe(history.pages[1])
    })
  })

  it('enriches a Realtime insert from the cached parent message', () => {
    const realtimeReply = normalizeMessage({
      id: 'message-2',
      user_id: 'member-2',
      content: 'God idé!',
      mentions: [],
      created_at: '2026-08-23T12:01:00.000Z',
      deleted_at: null,
      deleted_by: null,
      reply_to_message_id: parent.id,
    })

    expect(addMessage([parent], realtimeReply)).toEqual([
      parent,
      {
        ...realtimeReply,
        reply_to: {
          id: parent.id,
          user_id: parent.user_id,
          content: parent.content,
          deleted_at: null,
          deleted_by: null,
        },
      },
    ])
    expect(needsReplyRefetch([parent], realtimeReply)).toBe(false)
  })

  it('requests joined reply data when the parent is outside the cache', () => {
    const realtimeReply = normalizeMessage({
      id: 'message-2',
      user_id: 'member-2',
      content: 'God idé!',
      mentions: [],
      created_at: '2026-08-23T12:01:00.000Z',
      reply_to_message_id: parent.id,
    })

    expect(needsReplyRefetch([], realtimeReply)).toBe(true)
  })

  it('does not duplicate an insert already returned by the send mutation', () => {
    expect(addMessage([parent], parent)).toEqual([parent])
  })

  it('removes a deleted parent without removing its replies', () => {
    const reply: Message = {
      id: 'message-2',
      user_id: 'member-2',
      content: 'God idé!',
      mentions: [],
      created_at: '2026-08-23T12:01:00.000Z',
      deleted_at: null,
      deleted_by: null,
      reply_to_message_id: parent.id,
      reply_to: {
        id: parent.id,
        user_id: parent.user_id,
        content: parent.content,
        deleted_at: null,
        deleted_by: null,
      },
    }

    expect(removeMessage([parent, reply], parent.id)).toEqual([
      { ...reply, reply_to_message_id: null, reply_to: null },
    ])
  })

  it('clears every cached reply preview when its parent is soft-deleted', () => {
    const reply: Message = {
      id: 'message-2',
      user_id: 'member-2',
      content: 'God idé!',
      mentions: [],
      created_at: '2026-08-23T12:01:00.000Z',
      deleted_at: null,
      deleted_by: null,
      reply_to_message_id: parent.id,
      reply_to: {
        id: parent.id,
        user_id: parent.user_id,
        content: parent.content,
        deleted_at: null,
        deleted_by: null,
      },
    }

    const result = updateMessage([parent, reply], {
      ...parent,
      content: '',
      deleted_at: '2026-08-23T12:02:00.000Z',
      deleted_by: 'admin-1',
    })

    expect(result?.[0].content).toBe('')
    expect(result?.[1].reply_to).toEqual({
      id: parent.id,
      user_id: parent.user_id,
      content: '',
      deleted_at: '2026-08-23T12:02:00.000Z',
      deleted_by: 'admin-1',
    })
  })
})

describe('messageFields', () => {
  // Regressionsværn for den fejl, der væltede chatten i produktion: embeddet
  // af svarets ophav skal bruge kolonnenavnet som hint. Constraint-navnet
  // (`messages!messages_reply_to_message_id_fkey`) giver PGRST200 fra
  // PostgREST, og fordi embeddet indgår i hver beskedhentning, fejler så hele
  // chatten. Ingen enhedstest kan fange det -- Supabase er mocket -- så
  // strengen pinnes her i stedet.
  it('embeds the reply parent through the column, not the constraint', () => {
    expect(messageFields).toContain('messages!reply_to_message_id')
    expect(messageFields).not.toContain('_fkey')
  })
})

describe('beskeder sendt fra offline-køen (#219)', () => {
  it('tager skrivetidspunktet med, når serveren har det', () => {
    expect(
      normalizeMessage({
        ...parent,
        written_at: '2026-08-23T09:00:00.000Z',
      }).written_at,
    ).toBe('2026-08-23T09:00:00.000Z')
  })

  it('efterlader det tomt på en besked, der blev sendt med forbindelse', () => {
    expect(normalizeMessage(parent).written_at).toBeNull()
  })
})

describe('sendMessage uden forbindelse (#219 -- networkMode)', () => {
  function setOnline(online: boolean) {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => online,
    })
  }

  // Historikhentningen bruger den samme `.from(...)`-kæde. Den kaldes ikke,
  // når klienten er offline (den er pauset af samme grund som mutationen),
  // men mockes forsvarende, hvis det nogensinde ændrer sig.
  function tableChain() {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'order', 'limit', 'or']) {
      chain[method] = vi.fn(() => chain)
    }
    chain.then = (resolve: (value: unknown) => void) =>
      resolve({ data: [], error: null })
    return chain
  }

  function realtimeChannel() {
    const channel: Record<string, unknown> = {}
    channel.on = vi.fn(() => channel)
    channel.subscribe = vi.fn(() => channel)
    return channel
  }

  function wrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      )
    }
  }

  afterEach(() => {
    cleanup()
    setOnline(true)
    onlineManager.setOnline(true)
    vi.clearAllMocks()
  })

  it('lægger beskeden i køen med det samme, i stedet for at vente på at React Query genoptager mutationen', async () => {
    // Uden `networkMode: 'always'` holder React Query (default networkMode
    // 'online') mutationen tilbage, indtil forbindelsen er tilbage -- og
    // `mutationFn`, som lægger beskeden i køen, kører derfor aldrig. Denne
    // test kører den rigtige `useMessages`-hook gennem en rigtig
    // QueryClientProvider (ikke en mocket useMessages), så den reproducerer
    // fejlen, hvis regressionen kommer tilbage.
    setOnline(false)
    onlineManager.setOnline(false)
    supabaseMocks.from.mockReturnValue(tableChain())
    supabaseMocks.channel.mockReturnValue(realtimeChannel())

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const { result } = renderHook(() => useMessages('general', 'member-1'), {
      wrapper: wrapper(queryClient),
    })

    await act(async () => {
      result.current.sendMessage.mutate({
        userId: 'member-1',
        content: 'Hej fra skoven',
        replyToMessageId: null,
      })
    })

    await waitFor(() => expect(result.current.queuedMessages).toHaveLength(1))
    expect(result.current.queuedMessages[0]).toMatchObject({
      content: 'Hej fra skoven',
      status: 'queued',
    })
    // Den skal aldrig prøve at sende, mens den er offline.
    expect(supabaseMocks.rpc).not.toHaveBeenCalled()
  })
})
