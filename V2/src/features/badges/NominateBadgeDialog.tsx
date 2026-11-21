import { useState, type FormEvent } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { BadgeMedal } from './BadgeMedal'
import { badgeErrorMessage, useBadgeActions } from './useBadges'
import type { CatalogBadge } from './types'

interface NominateBadgeDialogProps {
  nomineeId: Id<'profiles'>
  nomineeName: string
  badges: CatalogBadge[]
  onClose: () => void
  onNominated: (badgeName: string) => void
}

export function NominateBadgeDialog({
  nomineeId,
  nomineeName,
  badges,
  onClose,
  onNominated,
}: NominateBadgeDialogProps) {
  const { nominate } = useBadgeActions()
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useDialogFocus<HTMLDivElement>({ onClose })

  // Falder tilbage til den første badge, så listen aldrig står uden et valg --
  // fx hvis kataloget først blev hentet færdigt, efter dialogen åbnede.
  const selected =
    badges.find((badge) => badge._id === selectedId) ?? badges[0] ?? null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!selected) {
      setError('Vælg en badge.')
      return
    }
    if (!reason.trim()) {
      setError('Skriv en kort begrundelse.')
      return
    }

    setSubmitting(true)
    try {
      await nominate({
        badgeId: selected._id,
        nomineeId,
        reason: reason.trim(),
      })
      onNominated(selected.name)
      onClose()
    } catch (mutationError) {
      setError(badgeErrorMessage(mutationError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Indstil ${nomineeName} til en badge`}
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-6"
      >
        <div>
          <h2 className="text-xl font-semibold text-ink">
            Indstil {nomineeName}
          </h2>
          <p className="text-sm text-ink-subtle">
            To administratorer skal godkende, før badgen tildeles. Den, der
            indstiller, tæller ikke med som godkender.
          </p>
        </div>

        {badges.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Der er ingen aktive badges at indstille til lige nu.
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink-body">
              Vælg badge
            </legend>
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {badges.map((badge) => (
                <li key={badge._id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-2 has-checked:border-accent-soft has-checked:bg-surface-sunken">
                    <input
                      type="radio"
                      name="badge"
                      value={badge._id}
                      checked={selected?._id === badge._id}
                      onChange={() => setSelectedId(badge._id)}
                      className="h-5 w-5"
                    />
                    <BadgeMedal badge={badge} size="sm" decorative />
                    <span className="min-w-0">
                      <span className="block truncate text-ink">
                        {badge.name}
                      </span>
                      {badge.description && (
                        <span className="block truncate text-xs text-ink-subtle">
                          {badge.description}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Begrundelse
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            maxLength={2000}
            required
            placeholder={`Hvorfor fortjener ${nomineeName} badgen?`}
            className="rounded border border-line-strong px-3 py-2 text-base text-ink"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={submitting || badges.length === 0}
            className="min-h-11 rounded-lg bg-accent px-6 py-2 text-white disabled:opacity-50"
          >
            {submitting ? 'Sender…' : 'Send indstilling'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-line-strong px-4 py-2 text-ink-muted"
          >
            Annullér
          </button>
        </div>
      </form>
    </div>
  )
}
