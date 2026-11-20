import type { CachedHistory } from './historyCache'

/**
 * Opbevaring af den lokale beskedhistorik: IndexedDB, så historikken overlever,
 * at appen lukkes, og chatten kan åbnes uden at hænge på "Henter beskeder…".
 *
 * IndexedDB findes ikke overalt, hvor appen kører -- jsdom i testene og Safari
 * i privat tilstand er to eksempler. Derfor falder lageret tilbage til en Map i
 * hukommelsen: historikken virker stadig i den åbne fane, den overlever blot
 * ikke et genindlæs. Det er bedre end at kaste.
 *
 * Denne fil er det ene sted i historik-cachen, der kender en browser-API. Ren
 * logik ligger i `historyCache.ts`, som testes uden IndexedDB.
 */
const DATABASE_NAME = 'naturklubben-chat-history'
const STORE_NAME = 'messages'
const DATABASE_VERSION = 1

export interface HistoryCacheStore {
  read(key: string): Promise<CachedHistory | null>
  write(entry: CachedHistory): Promise<void>
}

function fromRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    return await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('IndexedDB er blokeret'))
    })
  } catch {
    return null
  }
}

/**
 * Ét lager pr. kald. Kalderen holder fast i det (hooken lægger det i state), så
 * forbindelsen åbnes én gang, og så hukommelses-fallback'en hører til den
 * samme cache hele sessionen.
 */
export function createHistoryCacheStore(): HistoryCacheStore {
  const memory = new Map<string, CachedHistory>()
  let databasePromise: Promise<IDBDatabase | null> | null = null

  function database() {
    databasePromise ??= openDatabase()
    return databasePromise
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T | null> {
    const db = await database()
    if (!db) return null
    try {
      const store = db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
      return await operation(store)
    } catch {
      // Databasen kan være blevet ryddet af browseren eller lukket af en anden
      // fane imens. Så tager hukommelsen over, frem for at cachen forsvinder.
      databasePromise = Promise.resolve(null)
      return null
    }
  }

  return {
    async read(key) {
      const stored = await withStore('readonly', (store) =>
        fromRequest<CachedHistory | undefined>(store.get(key)),
      )
      return stored ?? memory.get(key) ?? null
    },

    async write(entry) {
      memory.set(entry.key, entry)
      await withStore('readwrite', (store) => fromRequest(store.put(entry)))
    },
  }
}
