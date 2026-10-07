// Opbevaring af offline-køen: IndexedDB, så beskeder skrevet uden dækning
// overlever, at appen lukkes (#219).
//
// IndexedDB findes ikke overalt, hvor appen kører -- jsdom i testene og
// Safari i privat tilstand er to eksempler. Derfor falder lageret tilbage til
// en Map i hukommelsen: køen virker stadig i den åbne fane, den overlever blot
// ikke et genindlæs. Det er bedre end at kaste og tabe beskeden.
import type { QueuedMessage } from './offlineQueue'

const DATABASE_NAME = 'naturklubben-chat-queue'
const STORE_NAME = 'messages'
const DATABASE_VERSION = 1

export interface QueueStore {
  list(): Promise<QueuedMessage[]>
  put(message: QueuedMessage): Promise<void>
  remove(clientId: string): Promise<void>
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
          database.createObjectStore(STORE_NAME, { keyPath: 'clientId' })
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
 * samme kø hele sessionen.
 */
export function createQueueStore(): QueueStore {
  const memory = new Map<string, QueuedMessage>()
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
      // fane imens. Så tager hukommelsen over, frem for at køen forsvinder.
      databasePromise = Promise.resolve(null)
      return null
    }
  }

  return {
    async list() {
      const stored = await withStore('readonly', (store) =>
        fromRequest<QueuedMessage[]>(store.getAll()),
      )
      return stored ?? [...memory.values()]
    },

    async put(message) {
      memory.set(message.clientId, message)
      await withStore('readwrite', (store) => fromRequest(store.put(message)))
    },

    async remove(clientId) {
      memory.delete(clientId)
      await withStore('readwrite', (store) =>
        fromRequest(store.delete(clientId)),
      )
    },
  }
}
