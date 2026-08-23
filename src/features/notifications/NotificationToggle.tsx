import { usePushNotifications } from './usePushNotifications'

const UNAVAILABLE_TEXT = {
  unsupported: 'Din browser understøtter ikke notifikationer.',
  'needs-install':
    'Læg appen på hjemmeskærmen (Del → Føj til hjemmeskærm) for at få notifikationer på iPhone.',
  blocked:
    'Notifikationer er blokeret for siden. Slå dem til igen i browserens indstillinger.',
} as const

export function NotificationToggle({ userId }: { userId: string }) {
  const { status, isWorking, error, enable, disable } =
    usePushNotifications(userId)

  if (status.state === 'loading') return null

  if (status.state === 'unavailable') {
    return (
      <p className="text-sm text-green-700">
        {UNAVAILABLE_TEXT[status.reason]}
      </p>
    )
  }

  const isOn = status.state === 'on'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void (isOn ? disable() : enable())}
        disabled={isWorking}
        aria-pressed={isOn}
        className={`min-h-11 rounded-full border px-4 py-2 text-sm disabled:opacity-50 ${
          isOn
            ? 'border-green-800 bg-green-800 text-white'
            : 'border-green-300 bg-white text-green-900'
        }`}
      >
        {isOn ? '🔔 Notifikationer til' : '🔕 Slå notifikationer til'}
      </button>
      {isWorking && (
        <span role="status" className="text-sm text-green-700">
          Arbejder…
        </span>
      )}
      {error && (
        <span role="alert" className="text-sm text-red-700">
          {error}
        </span>
      )}
    </div>
  )
}
