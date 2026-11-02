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
 * Knappen gemmer browserens abonnement på serveren. Afsendelsen sker i
 * `convex/pushSend.ts` med den samme Web Crypto-kode som den nuværende app.
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
            ? 'Notifikationer til'
            : 'Slå notifikationer til'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
