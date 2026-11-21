import { AppErrorBoundary } from '../../components/AppErrorBoundary'
import { EventPicker } from './EventPicker'

interface BulkMoveBarProps {
  selectedCount: number
  totalSelectableCount: number
  eventId: string
  moving: boolean
  error: string | null
  onEventChange: (eventId: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onCancel: () => void
  onSubmit: () => void
}

/**
 * Værktøjslinje i albummet "Uden begivenhed", så uploader eller admin kan
 * vælge flere billeder og knytte dem til én begivenhed i ét trin.
 */
export function BulkMoveBar({
  selectedCount,
  totalSelectableCount,
  eventId,
  moving,
  error,
  onEventChange,
  onSelectAll,
  onClearSelection,
  onCancel,
  onSubmit,
}: BulkMoveBarProps) {
  const allSelected =
    totalSelectableCount > 0 && selectedCount === totalSelectableCount
  const selectionLabel =
    selectedCount === 0
      ? 'Ingen billeder valgt'
      : selectedCount === 1
        ? '1 billede valgt'
        : `${selectedCount} billeder valgt`

  return (
    <div
      role="region"
      aria-label="Flyt billeder til en begivenhed"
      className="mb-4 flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-sunken p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-sm font-medium text-ink">
          {selectionLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={allSelected ? onClearSelection : onSelectAll}
            disabled={moving || totalSelectableCount === 0}
            className="min-h-11 rounded border border-line-strong px-3 py-2 text-sm text-ink-body disabled:opacity-50"
          >
            {allSelected ? 'Fravælg alle' : 'Vælg alle'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={moving}
            className="min-h-11 rounded border border-line-strong px-3 py-2 text-sm text-ink-body disabled:opacity-50"
          >
            Annullér
          </button>
        </div>
      </div>

      <AppErrorBoundary
        fallback={(retry) => (
          <p role="alert" className="text-sm text-danger">
            Listen over begivenheder kunne ikke hentes.{' '}
            <button
              type="button"
              onClick={retry}
              className="min-h-11 underline"
            >
              Prøv igen
            </button>
          </p>
        )}
      >
        <EventPicker
          value={eventId}
          onChange={onEventChange}
          label="Flyt til begivenhed"
          emptyLabel="Vælg begivenhed"
          hideWhenEmpty={false}
        />
      </AppErrorBoundary>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={selectedCount === 0 || eventId === '' || moving}
          className="min-h-11 rounded-lg bg-accent px-5 py-2 text-white disabled:opacity-50"
        >
          {moving ? 'Flytter…' : 'Flyt til begivenhed'}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
