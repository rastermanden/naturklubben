import { CHAT_QUEUE_SYNC_TAG } from '../../lib/chatQueueSync'

interface SyncCapableRegistration extends ServiceWorkerRegistration {
  sync?: { register(tag: string): Promise<void> }
}

function syncRegistration(
  registration: ServiceWorkerRegistration,
): SyncCapableRegistration['sync'] {
  return (registration as SyncCapableRegistration).sync
}

async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ])
}

/** Beder browseren vække workeren, når der igen er forbindelse. */
export async function requestChatQueueSync(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await activeRegistration()
    if (!registration) return false
    const sync = syncRegistration(registration)
    if (!sync) return false
    await sync.register(CHAT_QUEUE_SYNC_TAG)
    return true
  } catch {
    return false
  }
}
