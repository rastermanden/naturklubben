// Lageret bag offline-køen (#219).
//
// jsdom har ingen IndexedDB, så den vej, appen bruger i produktion, findes ikke
// i testmiljøet. Testen dækker derfor begge grene: hukommelses-fallbacken, som
// er den, der faktisk kører i jsdom, og IndexedDB-vejen gennem en minimal
// efterligning af de fire kald, lageret bruger (`open`, `getAll`, `put`,
// `delete`). Efterligningen er ikke en rigtig IndexedDB -- den er tilstrækkelig
// til at vise, at koden kalder den rigtigt og læser det rigtige tilbage.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueuedMessage, type QueuedMessage } from './offlineQueue'
import { createQueueStore } from './offlineQueueStore'

function entry(clientId: string): QueuedMessage {
  return createQueuedMessage(
    { userId: 'member-1', room: 'general', content: 'Hej fra skoven' },
    clientId,
    '2026-09-17T09:00:00.000Z',
  )
}

/** De få dele af IndexedDB, `offlineQueueStore` rører. */
function fakeIndexedDB() {
  const data = new Map<string, Map<string, unknown>>()

  function idbRequest<T>(result: T) {
    const request = {
      result: undefined as unknown as T,
      error: null,
      onsuccess: null as null | (() => void),
      onerror: null as null | (() => void),
    }
    queueMicrotask(() => {
      request.result = result
      request.onsuccess?.()
    })
    return request
  }

  function storeFor(storeName: string) {
    let store = data.get(storeName)
    if (!store) {
      store = new Map()
      data.set(storeName, store)
    }
    return store
  }

  return {
    open() {
      const request = {
        result: undefined as unknown as IDBDatabase,
        error: null,
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        onupgradeneeded: null as null | (() => void),
        onblocked: null as null | (() => void),
      }
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          close: () => {},
          transaction: (storeName: string) => ({
            objectStore: () => {
              const store = storeFor(storeName)
              return {
                getAll: () => idbRequest([...store.values()]),
                put: (value: QueuedMessage) => {
                  store.set(value.clientId, value)
                  return idbRequest(value.clientId)
                },
                delete: (key: string) => {
                  store.delete(key)
                  return idbRequest(undefined)
                },
              }
            },
          }),
        } as unknown as IDBDatabase
        request.onsuccess?.()
      })
      return request
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createQueueStore uden IndexedDB', () => {
  it('holder køen i hukommelsen i stedet for at tabe den', async () => {
    expect(typeof indexedDB).toBe('undefined')

    const store = createQueueStore()
    expect(await store.list()).toEqual([])

    await store.put(entry('client-1'))
    expect((await store.list()).map((item) => item.clientId)).toEqual([
      'client-1',
    ])

    await store.remove('client-1')
    expect(await store.list()).toEqual([])
  })
})

describe('createQueueStore med IndexedDB', () => {
  it('gemmer køen, så den overlever appen bliver lukket', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDB())

    const first = createQueueStore()
    await first.put(entry('client-1'))

    // Et nyt lager ovenpå samme database er det samme som et genindlæs.
    const second = createQueueStore()
    expect((await second.list()).map((item) => item.clientId)).toEqual([
      'client-1',
    ])

    const third = createQueueStore()
    await third.remove('client-1')
    expect(await createQueueStore().list()).toEqual([])
  })
})
