import type { RefObject } from 'react'
import { AppErrorBoundary } from '../../components/AppErrorBoundary'
import { EventPicker } from './EventPicker'

interface BulkMoveBarProps {
  containerRef?: RefObject<HTMLDivElement | null>
  selectedCount: number
  totalSelectableCount: number
  hasMore?: boolean
  loadedCount?: number
  totalAlbumCount?: number | null
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
  containerRef,
  selectedCount,
  totalSelectableCount,
  hasMore = false,
  loadedCount,
  totalAlbumCount = null,
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
  const selectAllLabel = allSelected
    ? 'Fravælg alle'
    : hasMore
      ? 'Vælg viste'
      : 'Vælg alle'
  const submitLabel = moving
    ? 'Flytter…'
    : selectedCount === 0
      ? 'Flyt valgte'
      : selectedCount === 1
        ? 'Flyt 1 billede'
        : `Flyt ${selectedCount} billeder`

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
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
            {selectAllLabel}
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

      {hasMore && (
        <p className="text-xs text-ink-subtle">
          {totalAlbumCount !== null &&
          loadedCount !== undefined &&
          totalAlbumCount > loadedCount
            ? `Viser ${loadedCount} af ${totalAlbumCount} billeder. Hent flere nederst for at vælge resten.`
            : 'Kun de viste billeder kan vælges. Hent flere nederst for at vælge resten.'}
        </p>
      )}

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
          label="Begivenhed"
          emptyLabel="Vælg begivenhed"
          hideWhenEmpty={false}
          disabled={moving}
          emptyListHint="Der er ingen begivenheder endnu. Opret en begivenhed i kalenderen først."
        />
      </AppErrorBoundary>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={selectedCount === 0 || eventId === '' || moving}
          className="min-h-11 rounded-lg bg-accent px-5 py-2 text-white disabled:opacity-50"
        >
          {submitLabel}
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
