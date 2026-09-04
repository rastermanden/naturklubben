import { PhotoThumbnail } from '../gallery/PhotoThumbnail'
import type { Photo } from '../gallery/types'
import {
  formatObservedOn,
  formatPosition,
  mapLinkFor,
  observerName,
} from './observationInput'
import type { Observation } from './types'

interface ObservationCardProps {
  observation: Observation
  canEdit: boolean
  canDelete: boolean
  deleting: boolean
  onEdit: (observation: Observation) => void
  onDelete: (observation: Observation) => void
  onOpenPhoto: (photo: Photo) => void
}

export function ObservationCard({
  observation,
  canEdit,
  canDelete,
  deleting,
  onEdit,
  onDelete,
  onOpenPhoto,
}: ObservationCardProps) {
  const hasPosition =
    observation.latitude !== null && observation.longitude !== null

  return (
    <li className="flex min-w-0 gap-4 rounded-xl border border-line-soft bg-surface p-4 shadow-sm">
      {observation.photo && (
        <div className="w-24 shrink-0 sm:w-32 [&>button]:w-full">
          <PhotoThumbnail
            photo={observation.photo}
            onClick={() => onOpenPhoto(observation.photo!)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <h2 className="font-medium text-ink">{observation.species}</h2>
          <p className="text-sm text-ink-subtle">
            <time dateTime={observation.observed_on}>
              {formatObservedOn(observation.observed_on)}
            </time>
            {observation.location && <> · {observation.location}</>}
            <> · {observerName(observation)}</>
          </p>
        </div>

        {observation.notes && (
          <p className="whitespace-pre-wrap text-sm text-ink-body">
            {observation.notes}
          </p>
        )}

        {hasPosition && (
          <a
            href={mapLinkFor(observation.latitude!, observation.longitude!)}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-sm text-ink-muted underline"
          >
            Se på kort (
            {formatPosition(observation.latitude!, observation.longitude!)})
          </a>
        )}

        {(canEdit || canDelete) && (
          <div className="mt-1 flex flex-wrap gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(observation)}
                className="min-h-11 rounded-lg border border-line-strong px-3 text-sm text-ink-muted"
              >
                Redigér
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(observation)}
                disabled={deleting}
                className="min-h-11 rounded-lg border border-danger-line px-3 text-sm text-danger-strong disabled:opacity-60"
              >
                {deleting ? 'Sletter…' : 'Slet'}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
