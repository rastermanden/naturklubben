import { usePushNotifications } from './usePushNotifications'

const UNAVAILABLE_TEXT = {
  unsupported:
    'Denne browser kan ikke vise notifikationer. Valgene nedenfor gælder stadig dine andre enheder.',
  'needs-install':
    'På iPhone og iPad skal appen først lægges på hjemmeskærmen (Del → Føj til hjemmeskærm). Åbn den derfra, og slå notifikationer til der.',
  blocked:
    'Notifikationer er blokeret for siden. Slå dem til i browserens indstillinger og prøv igen.',
} as const

/**
 * Til/fra for notifikationer på netop denne enhed.
 *
 * Knappen gemmer browserens abonnement på serveren. Den kan endnu ikke sende
 * en notifikation -- `sendWebPush` i `convex/pushSend.ts` er en TODO, fordi
 * Web Push-krypteringen kræver `web-push`-pakken. Det står der i teksten, så
 * ingen tror, at de har slået noget til, der virker.
 */
export function NotificationToggle() {
  const { status, isWorking, error, enable, disable } = usePushNotifications()

  if (status.state === 'loading') {
    return (
      <p role="status" className="text-sm text-ink-subtle">
        Tjekker notifikationer…
      </p>
    )
  }

  if (status.state === 'unavailable') {
    return (
      <p className="text-sm text-ink-muted">
        {UNAVAILABLE_TEXT[status.reason]}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={isWorking}
        onClick={() => void (status.state === 'on' ? disable() : enable())}
        className="min-h-11 w-fit rounded-full border border-accent px-4 py-2 text-sm text-ink-body disabled:opacity-60"
      >
        {isWorking
          ? 'Arbejder…'
          : status.state === 'on'
            ? 'Slå notifikationer fra på denne enhed'
            : 'Slå notifikationer til på denne enhed'}
      </button>
      <p className="text-sm text-ink-subtle">
        Afsendelsen af notifikationer er ikke sat i drift endnu, så der kommer
        ingen beskeder på telefonen før videre.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
