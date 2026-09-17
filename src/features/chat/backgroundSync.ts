// Background Sync til offline-køen (#219).
//
// Kan browseren det, vækker den service workeren, når telefonen igen har
// forbindelse -- også når appen er lukket eller ligger i baggrunden, hvor
// `online`-hændelsen i fanen ikke bliver afleveret. Er API'et der ikke (Safari
// og Firefox har det ikke), sker der ingenting her: køen bliver liggende i
// IndexedDB og sendes ved næste app-start. Det er den aftalte fallback, ikke en
// fejl.
import { CHAT_QUEUE_SYNC_TAG } from '../../lib/chatQueueSync'

/**
 * Eksterne typer: `SyncManager` er ikke med i TypeScripts DOM-lib, og
 * `registration.sync` findes derfor ikke i typen. Vi erklærer kun det, vi
 * bruger, frem for at slå hele registreringen om til `any`.
 */
interface SyncCapableRegistration extends ServiceWorkerRegistration {
  sync?: { register(tag: string): Promise<void> }
}

function syncRegistration(
  registration: ServiceWorkerRegistration,
): SyncCapableRegistration['sync'] {
  return (registration as SyncCapableRegistration).sync
}

/**
 * Venter på en aktiv service worker, men giver op efter et par sekunder:
 * `navigator.serviceWorker.ready` resolver aldrig, hvis der ingen registrering
 * er -- fx på et PR-preview, hvor PWA'en er slået fra.
 */
async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ])
}

/**
 * Beder browseren om at vække appen, når der igen er forbindelse. Returnerer
 * om det lykkedes; kalderen behøver ikke gøre noget ved et nej.
 */
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
    // Både et manglende API og en afvist registrering (fx manglende
    // tilladelse) ender her, og begge betyder det samme: køen sendes ved
    // næste app-start i stedet.
    return false
  }
}
