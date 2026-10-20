import { useState } from 'react'
import { badgeErrorMessage, useBadgeActions, useBadgeCatalog, useNomineeCandidates } from './useBadges'

/**
 * "Indstil et medlem til en badge".
 *
 * Kataloget og medlemslisten er de to ting, der skal vælges imellem; om det er
 * tilladt at indstille netop den person til netop den badge, afgør mutationen
 * (`convex/badges.ts`) -- den kender både tildelinger, åbne indstillinger og
 * hvor mange, man har indstillet i dag.
 */
export function NominateBadgeForm({ onDone }: { onDone: () => void }) {
  const catalog = useBadgeCatalog()
  const candidates = useNomineeCandidates()
  const { nominate } = useBadgeActions()
  const [badgeId, setBadgeId] = useState('')
  const [nomineeId, setNomineeId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!badgeId || !nomineeId) {
      setError('Vælg en badge og et medlem.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await nominate({
        badgeId: badgeId as Parameters<typeof nominate>[0]['badgeId'],
        nomineeId: nomineeId as Parameters<typeof nominate>[0]['nomineeId'],
        reason,
      })
      onDone()
    } catch (cause) {
      setError(badgeErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4"
    >
      <h2 className="text-lg font-semibold text-ink-body">Indstil en badge</h2>

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Badge
        <select
          value={badgeId}
          onChange={(event) => setBadgeId(event.target.value)}
          className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
        >
          <option value="">Vælg en badge</option>
          {(catalog ?? []).map((badge) => (
            <option key={badge._id} value={badge._id}>
              {badge.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Medlem
        <select
          value={nomineeId}
          onChange={(event) => setNomineeId(event.target.value)}
          className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
        >
          <option value="">Vælg et medlem</option>
          {(candidates ?? []).map((candidate) => (
            <option key={candidate.profileId} value={candidate.profileId}>
              {candidate.fullName}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Hvorfor?
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={2000}
          required
          className="rounded-lg border border-line px-3 py-2 text-ink"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-lg bg-accent px-4 py-2 font-medium text-on-accent disabled:opacity-60"
        >
          {busy ? 'Sender…' : 'Indstil'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded-lg border border-line px-4 py-2 text-ink-muted"
        >
          Annullér
        </button>
      </div>
    </form>
  )
}
