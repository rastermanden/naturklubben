// Lageret bag den lokale beskedhistorik.
//
// jsdom har ingen IndexedDB, så den vej, appen bruger i produktion, findes ikke
// i testmiljøet. Testen dækker derfor begge grene: hukommelses-fallbacken, som
// er den, der faktisk kører i jsdom, og IndexedDB-vejen gennem en minimal
// efterligning af de kald, lageret bruger (`open`, `get`, `put`).
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CachedHistory } from './historyCache'
import { createHistoryCacheStore } from './historyCacheStore'

function entry(key: string): CachedHistory {
  return {
    key,
    room: 'general',
    messages: [],
    hasMore: false,
    updatedAt: 0,
  }
}

/** De få dele af IndexedDB, `historyCacheStore` rører. */
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
                get: (key: string) => idbRequest(store.get(key)),
                put: (value: CachedHistory) => {
                  store.set(value.key, value)
                  return idbRequest(value.key)
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

describe('createHistoryCacheStore uden IndexedDB', () => {
  it('holder historikken i hukommelsen i stedet for at tabe den', async () => {
    expect(typeof indexedDB).toBe('undefined')

    const store = createHistoryCacheStore()
    expect(await store.read('member-1:general')).toBeNull()

    await store.write(entry('member-1:general'))
    expect((await store.read('member-1:general'))?.key).toBe(
      'member-1:general',
    )
  })
})

describe('createHistoryCacheStore med IndexedDB', () => {
  it('gemmer historikken, så den overlever, at appen lukkes', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDB())

    const first = createHistoryCacheStore()
    await first.write(entry('member-1:general'))

    // Et nyt lager ovenpå samme database er det samme som et genindlæs.
    const second = createHistoryCacheStore()
    expect((await second.read('member-1:general'))?.key).toBe(
      'member-1:general',
    )

    // En anden brugers nøgle er en anden række og læses ikke med over.
    expect(await second.read('member-2:general')).toBeNull()
  })
})
