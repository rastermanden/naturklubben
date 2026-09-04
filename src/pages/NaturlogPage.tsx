import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useIsAdmin } from '../features/admin/useIsAdmin'
import { useAuth } from '../features/auth/useAuth'
import { PhotoLightbox } from '../features/gallery/PhotoLightbox'
import type { Photo } from '../features/gallery/types'
import { useDeletePhoto } from '../features/gallery/useDeletePhoto'
import { useRetryPhotoOptimization } from '../features/gallery/useRetryPhotoOptimization'
import { ObservationCard } from '../features/naturlog/ObservationCard'
import { ObservationForm } from '../features/naturlog/ObservationForm'
import {
  filterObservations,
  toFriendlyObservationError,
} from '../features/naturlog/observationInput'
import type { Observation, ObservationInput } from '../features/naturlog/types'
import {
  observationsQueryKey,
  uploadObservationPhoto,
  useObservationMutations,
  useObservations,
} from '../features/naturlog/useObservations'

type FormState =
  | { mode: 'closed' }
  | { mode: 'new' }
  | { mode: 'edit'; observation: Observation }

function NaturlogLoadingState() {
  return (
    <div
      role="status"
      aria-label="Henter naturloggen"
      className="flex flex-col gap-3"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex flex-col gap-2 rounded-xl border border-line-soft bg-surface p-4"
        >
          <span className="h-5 w-1/2 rounded bg-surface-raised motion-safe:animate-pulse" />
          <span className="h-4 w-3/4 rounded bg-surface-sunken motion-safe:animate-pulse" />
        </div>
      ))}
      <span className="sr-only">Henter naturloggen…</span>
    </div>
  )
}

function NaturlogPage() {
  const { session } = useAuth()
  const { isAdmin } = useIsAdmin()
  const queryClient = useQueryClient()
  const userId = session?.user.id
  const observationsQuery = useObservations()
  const { createObservation, updateObservation, deleteObservation } =
    useObservationMutations(userId)
  const deletePhoto = useDeletePhoto()
  const retryOptimization = useRetryPhotoOptimization()

  const [form, setForm] = useState<FormState>({ mode: 'closed' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null)
  const [photoActionError, setPhotoActionError] = useState<string | null>(null)

  const observations = observationsQuery.data ?? []
  const visible = filterObservations(observations, search)

  function openNew() {
    setStatus(null)
    setFormError(null)
    setForm({ mode: 'new' })
  }

  function openEdit(observation: Observation) {
    setStatus(null)
    setFormError(null)
    setForm({ mode: 'edit', observation })
  }

  async function handleSubmit(
    input: Omit<ObservationInput, 'photo_id'>,
    photoFile: File | null,
  ) {
    if (!userId || form.mode === 'closed') return
    setSaving(true)
    setFormError(null)
    try {
      const existingPhotoId =
        form.mode === 'edit' ? form.observation.photo_id : null
      let photoId = existingPhotoId
      if (photoFile) {
        try {
          const caption = [input.species, input.location]
            .filter(Boolean)
            .join(' -- ')
          photoId = await uploadObservationPhoto(photoFile, userId, caption)
        } catch (error) {
          console.error('Observationens billede kunne ikke uploades', error)
          setFormError('Billedet kunne ikke uploades. Prøv igen.')
          return
        }
      }

      const fullInput: ObservationInput = { ...input, photo_id: photoId }
      if (form.mode === 'new') {
        await createObservation.mutateAsync(fullInput)
        setStatus(`${input.species} er skrevet i naturloggen.`)
      } else {
        await updateObservation.mutateAsync({
          id: form.observation.id,
          input: fullInput,
        })
        setStatus('Observationen er opdateret.')
      }
      setForm({ mode: 'closed' })
    } catch (error) {
      console.error('Observationen kunne ikke gemmes', error)
      setFormError(toFriendlyObservationError(error))
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(observation: Observation) {
    if (
      !window.confirm(`Vil du slette "${observation.species}" fra naturloggen?`)
    ) {
      return
    }
    setStatus(null)
    deleteObservation.mutate(observation.id, {
      onSuccess: () => setStatus('Observationen er slettet.'),
      onError: () => setStatus('Observationen kunne ikke slettes. Prøv igen.'),
    })
  }

  function removePhoto(photo: Photo) {
    setPhotoActionError(null)
    deletePhoto.mutate(photo, {
      onSuccess: () => {
        setActivePhoto(null)
        void queryClient.invalidateQueries({ queryKey: observationsQueryKey })
      },
      onError: () =>
        setPhotoActionError('Billedet kunne ikke slettes. Prøv igen.'),
    })
  }

  function retryPhoto(photo: Photo) {
    setPhotoActionError(null)
    retryOptimization.mutate(photo.id, {
      onError: () =>
        setPhotoActionError('Optimeringen kunne ikke startes. Prøv igen.'),
    })
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
        {userId && (
          <button
            type="button"
            onClick={openNew}
            className="min-h-11 shrink-0 rounded-lg bg-accent-soft px-4 py-2 font-medium text-white"
          >
            Ny observation
          </button>
        )}
      </div>

      {status && (
        <p role="status" className="text-sm text-ink-subtle">
          {status}
        </p>
      )}

      {observations.length > 0 && (
        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Søg i loggen
          <input
            type="search"
            value={search}
            onChange={(changeEvent) => setSearch(changeEvent.target.value)}
            placeholder="Art, sted eller noter"
            className="rounded border border-line-strong px-3 py-2 text-base text-ink"
          />
        </label>
      )}

      {observationsQuery.isPending && <NaturlogLoadingState />}

      {observationsQuery.isError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-danger-line bg-danger-surface p-4 text-danger-strong sm:flex-row sm:items-center sm:justify-between"
        >
          <p>Naturloggen kunne ikke hentes.</p>
          <button
            type="button"
            onClick={() => observationsQuery.refetch()}
            className="min-h-11 rounded-lg border border-danger-line px-4 py-2 font-medium"
          >
            Prøv igen
          </button>
        </div>
      )}

      {observationsQuery.isSuccess && observations.length === 0 && (
        <div className="rounded-xl border border-line-soft bg-surface px-4 py-12 text-center text-ink-subtle">
          Naturloggen er tom endnu. Vær den første til at skrive, hvad du har
          set.
        </div>
      )}

      {observations.length > 0 && visible.length === 0 && (
        <p role="status" className="text-ink-subtle">
          Ingen observationer matcher &quot;{search.trim()}&quot;.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visible.map((observation) => {
            const isOwner = Boolean(userId) && observation.created_by === userId
            return (
              <ObservationCard
                key={observation.id}
                observation={observation}
                canEdit={isOwner}
                canDelete={isOwner || isAdmin}
                deleting={
                  deleteObservation.isPending &&
                  deleteObservation.variables === observation.id
                }
                onEdit={openEdit}
                onDelete={handleDelete}
                onOpenPhoto={(photo) => {
                  setPhotoActionError(null)
                  setActivePhoto(photo)
                }}
              />
            )
          })}
        </ul>
      )}

      {form.mode !== 'closed' && (
        <ObservationForm
          observation={form.mode === 'edit' ? form.observation : null}
          submitting={saving}
          error={formError}
          onSubmit={handleSubmit}
          onCancel={() => setForm({ mode: 'closed' })}
        />
      )}

      {activePhoto && (
        <PhotoLightbox
          photo={activePhoto}
          onClose={() => setActivePhoto(null)}
          deleting={deletePhoto.isPending}
          onDelete={removePhoto}
          retrying={
            retryOptimization.isPending &&
            retryOptimization.variables === activePhoto.id
          }
          onRetryOptimization={retryPhoto}
          actionError={photoActionError}
        />
      )}
    </main>
  )
}

export default NaturlogPage
