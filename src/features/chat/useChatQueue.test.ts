// Køen i appen (#219): hvornår den tømmes, og hvad der sker, når et forsøg
// fejler. IndexedDB findes ikke i jsdom, så lageret falder tilbage til
// hukommelsen (se offlineQueueStore.test.ts) -- kø-adfærden er den samme.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useChatQueue } from './useChatQueue'
import type { QueuedMessage } from './offlineQueue'
import type { Message } from './useMessages'

const serverMessage: Message = {
  id: 'client-1',
  user_id: 'member-1',
  content: 'Hej fra skoven',
  message_type: 'text',
  mentions: [],
  created_at: '2026-09-17T11:00:00.000Z',
  written_at: '2026-09-17T09:00:00.000Z',
  deleted_at: null,
  deleted_by: null,
  reply_to_message_id: null,
  reply_to: null,
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => online,
  })
}

function setup(
  options: { send?: (entry: QueuedMessage) => Promise<unknown> } = {},
) {
  const send = vi.fn(
    options.send ?? (async () => ({ message: serverMessage, inserted: true })),
  )
  const deliver = vi.fn()
  const hook = renderHook(() =>
    useChatQueue({
      room: 'general',
      userId: 'member-1',
      send: send as never,
      deliver,
    }),
  )
  return { hook, send, deliver }
}

function enqueue(hook: ReturnType<typeof setup>['hook']) {
  return act(async () => {
    await hook.result.current.enqueue({
      userId: 'member-1',
      room: 'general',
      content: 'Hej fra skoven',
    })
  })
}

afterEach(() => {
  cleanup()
  setOnline(true)
  vi.restoreAllMocks()
})

describe('useChatQueue', () => {
  it('lægger beskeden i køen og rører ikke netværket, når der ikke er forbindelse', async () => {
    setOnline(false)
    const { hook, send, deliver } = setup()

    await enqueue(hook)

    expect(hook.result.current.isOffline).toBe(true)
    expect(hook.result.current.messages).toHaveLength(1)
    expect(hook.result.current.messages[0]).toMatchObject({
      content: 'Hej fra skoven',
      status: 'queued',
    })
    expect(send).not.toHaveBeenCalled()
    expect(deliver).not.toHaveBeenCalled()
  })

  it('sender den ventende besked, når forbindelsen vender tilbage, og tømmer køen', async () => {
    setOnline(false)
    const { hook, send, deliver } = setup()
    await enqueue(hook)
    await waitFor(() => expect(hook.result.current.messages).toHaveLength(1))

    setOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => expect(hook.result.current.messages).toHaveLength(0))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({
      content: 'Hej fra skoven',
      clientId: expect.any(String),
      writtenAt: expect.any(String),
    })
    expect(deliver).toHaveBeenCalledWith(serverMessage, { notify: true })
  })

  it('beholder beskeden som fejlet, når forsøget ikke kunne gennemføres, og prøver igen på kommando', async () => {
    setOnline(false)
    const { hook, send, deliver } = setup()
    await enqueue(hook)

    setOnline(true)
    send.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() =>
      expect(hook.result.current.messages[0]?.status).toBe('failed'),
    )
    expect(hook.result.current.messages[0]?.lastError).toBe('Failed to fetch')
    expect(deliver).not.toHaveBeenCalled()

    send.mockResolvedValueOnce({ message: serverMessage, inserted: true })
    await act(async () => {
      hook.result.current.retry(hook.result.current.messages[0].clientId)
    })

    await waitFor(() => expect(hook.result.current.messages).toHaveLength(0))
    expect(deliver).toHaveBeenCalledWith(serverMessage, { notify: true })
  })

  it('fortæller, at en gentagelse ikke er en ny besked, så der ikke pushes to gange', async () => {
    setOnline(false)
    const { hook, send, deliver } = setup({
      send: async () => ({ message: serverMessage, inserted: false }),
    })
    await enqueue(hook)
    expect(send).not.toHaveBeenCalled()

    setOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => expect(hook.result.current.messages).toHaveLength(0))
    expect(deliver).toHaveBeenCalledWith(serverMessage, { notify: false })
  })

  it('sender og viser ikke en besked, en tidligere bruger efterlod i køen', async () => {
    setOnline(false)
    const { hook, send } = setup()
    await act(async () => {
      await hook.result.current.enqueue({
        userId: 'member-2',
        room: 'general',
        content: 'Fra en anden bruger',
      })
    })

    setOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(send).not.toHaveBeenCalled()
    expect(hook.result.current.messages).toHaveLength(0)
  })

  it('kender forskel på en besked, der venter, og en der er sendt', async () => {
    setOnline(false)
    const { hook } = setup()
    await enqueue(hook)

    const [entry] = hook.result.current.messages
    expect(hook.result.current.isQueued(entry.clientId)).toBe(true)

    await act(async () => {
      hook.result.current.discard(entry.clientId)
    })

    expect(hook.result.current.isQueued(entry.clientId)).toBe(false)
    expect(hook.result.current.messages).toHaveLength(0)
  })
})
