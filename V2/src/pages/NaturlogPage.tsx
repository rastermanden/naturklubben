import { useMemo, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { PhotoLightbox } from '../features/gallery/PhotoLightbox'
import type { Photo } from '../features/gallery/types'
import { ObservationCard } from '../features/naturlog/ObservationCard'
import { ObservationForm } from '../features/naturlog/ObservationForm'
import { filterObservations } from '../features/naturlog/observationInput'
import { observationsInYear } from '../features/naturlog/summary'
import type { Observation } from '../features/naturlog/types'
import {
  ObservationMap,
  SpeciesOverview,
  DEFAULT_ZOOM,
  DENMARK_CENTER,
  type MapView,
} from '../features/naturlog/map'
import {
  observationErrorMessage,
  useObservationActions,
  useObservations,
} from '../features/naturlog/useObservations'

type Tab = 'liste' | 'kort' | 'arter'

function toView(
  row: Doc<'observations'> & {
    photo: Observation['photo']
    isOwn: boolean
    canDelete: boolean
  },
): Observation {
  return {
    id: row._id,
    species: row.species,
    location: row.location ?? null,
    observed_on: row.observedOn,
    notes: row.notes ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    photo_id: row.photoId ?? null,
    photo: row.photo,
    created_by: row.createdById ?? null,
    observer: {
      id: row.createdById ?? '',
      full_name: row.createdByName,
    },
    created_at: new Date(row.createdAt).toISOString(),
    updated_at: new Date(row.updatedAt).toISOString(),
  }
}

export default function NaturlogPage() {
  const rows = useObservations()
  const { remove } = useObservationActions()
  const [query, setQuery] = useState('')
  const [writing, setWriting] = useState(false)
  const [editing, setEditing] = useState<Doc<'observations'> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('liste')
  const [chosenYear, setChosenYear] = useState<number | 'alle' | null>(null)
  const [mapView, setMapView] = useState<MapView>({
    center: DENMARK_CENTER,
    zoom: DEFAULT_ZOOM,
  })
  const [activePhotoId, setActivePhotoId] = useState<Id<'photos'> | null>(null)
  const [photoActionError, setPhotoActionError] = useState<string | null>(null)
  const [deletingPhoto, setDeletingPhoto] = useState(false)
  const [retryingPhoto, setRetryingPhoto] = useState(false)
  const activePhoto = useQuery(
    api.gallery.getPhoto,
    activePhotoId === null ? 'skip' : { photoId: activePhotoId },
  )
  const deletePhoto = useMutation(api.gallery.deletePhoto)
  const optimizePhoto = useAction(api.gallery.optimizePhoto)

  const observations = useMemo(
    () => (rows ?? []).map((row) => toView(row)),
    [rows],
  )
  const visible = filterObservations(observations, query)
  const years = useMemo(
    () =>
      [
        ...new Set(observations.map((item) => item.observed_on.slice(0, 4))),
      ].sort((a, b) => b.localeCompare(a)),
    [observations],
  )
  const year =
    chosenYear === 'alle'
      ? null
      : (chosenYear ?? (years.length > 0 ? Number(years[0]) : null))
  const yearObservations = year ? observationsInYear(visible, year) : visible

  function closeForm() {
    setWriting(false)
    setEditing(null)
  }

  async function deleteObservation(observation: Observation) {
    if (
      !window.confirm(`Vil du slette "${observation.species}" fra naturloggen?`)
    ) {
      return
    }
    setError(null)
    try {
      await remove({
        observationId: observation.id as Doc<'observations'>['_id'],
      })
    } catch (cause) {
      setError(observationErrorMessage(cause))
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-body">Naturlog</h1>
          <p className="text-ink-subtle">
            Hvad har vi set derude? Skriv arten, stedet og datoen -- og læg
            gerne et billede ved.
          </p>
        </div>
        {!writing && editing === null && (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="min-h-11 shrink-0 rounded-lg bg-accent-soft px-4 py-2 font-medium text-white"
          >
            Ny observation
          </button>
        )}
      </div>

      {(writing || editing !== null) && (
        <ObservationForm
          editing={editing}
          onDone={closeForm}
          onCancel={closeForm}
        />
      )}

      <div
        role="tablist"
        aria-label="Visning af naturloggen"
        className="flex gap-1 self-start rounded-lg border border-line-strong bg-surface p-1"
      >
        {(
          [
            ['liste', 'Liste'],
            ['kort', 'Kort'],
            ['arter', 'Arter'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              tab === value
                ? 'bg-accent-soft text-white'
                : 'text-ink-muted hover:text-ink-body'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== 'liste' && years.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-ink-subtle">
          År
          <select
            aria-label="År"
            value={year === null ? '' : String(year)}
            onChange={(event) =>
              setChosenYear(
                event.target.value === '' ? 'alle' : Number(event.target.value),
              )
            }
            className="rounded border border-line-strong bg-surface px-2 py-1.5 text-ink"
          >
            <option value="">Alle år</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-ink-body">
        Søg i loggen
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Art, sted eller noter"
          className="rounded border border-line-strong px-3 py-2 text-base text-ink"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {rows === undefined && (
        <p className="text-ink-subtle">Henter naturloggen…</p>
      )}

      {rows !== undefined && observations.length === 0 && (
        <div className="rounded-xl border border-line-soft bg-surface px-4 py-12 text-center text-ink-subtle">
          Naturloggen er tom endnu. Vær den første til at skrive, hvad du har
          set.
        </div>
      )}

      {tab === 'liste' && visible.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visible.map((observation) => {
            const row = rows?.find((item) => item._id === observation.id)
            return (
              <ObservationCard
                key={observation.id}
                observation={observation}
                canEdit={row?.isOwn === true}
                canDelete={row?.canDelete === true}
                deleting={false}
                onEdit={() => {
                  if (row) setEditing(row)
                }}
                onDelete={(item) => void deleteObservation(item)}
                onOpenPhoto={(photo) => {
                  setPhotoActionError(null)
                  setActivePhotoId(photo.id as Id<'photos'>)
                }}
              />
            )
          })}
        </ul>
      )}

      {tab === 'kort' && rows !== undefined && (
        <ObservationMap
          observations={yearObservations}
          view={mapView}
          onViewChange={setMapView}
          emptyMessage={
            yearObservations.length === 0 && year !== null
              ? `Ingen observationer fra ${year} matcher.`
              : undefined
          }
        />
      )}

      {tab === 'arter' && visible.length > 0 && (
        <SpeciesOverview observations={yearObservations} year={year} />
      )}

      {activePhoto && (
        <PhotoLightbox
          photo={activePhoto as Photo}
          onClose={() => setActivePhotoId(null)}
          deleting={deletingPhoto}
          onDelete={(photo) => {
            setPhotoActionError(null)
            setDeletingPhoto(true)
            void deletePhoto({ photoId: photo.id as Id<'photos'> })
              .then(() => setActivePhotoId(null))
              .catch(() =>
                setPhotoActionError('Billedet kunne ikke slettes. Prøv igen.'),
              )
              .finally(() => setDeletingPhoto(false))
          }}
          retrying={retryingPhoto}
          onRetryOptimization={(photo) => {
            setPhotoActionError(null)
            setRetryingPhoto(true)
            void optimizePhoto({ photoId: photo.id as Id<'photos'> })
              .catch(() =>
                setPhotoActionError(
                  'Optimeringen kunne ikke startes. Prøv igen.',
                ),
              )
              .finally(() => setRetryingPhoto(false))
          }}
          actionError={photoActionError}
        />
      )}
    </main>
  )
}
