import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  PHOTO_MAX_EDGE,
  THUMB_MAX_EDGE,
  resizePhotoFile,
} from '../gallery/resizePhoto'
import { validateFiles } from '../gallery/useUploadPhotos'
import { PositionMapPicker } from './map'
import {
  NOTES_MAX_LENGTH,
  SPECIES_MAX_LENGTH,
  draftFromObservation,
  formatPosition,
  validateObservationDraft,
  type ObservationDraft,
} from './observationDraft'
import {
  observationErrorMessage,
  useObservationActions,
} from './useObservations'

interface ObservationFormProps {
  /** Sat, når et fund rettes; null når et nyt skrives. */
  editing: Doc<'observations'> | null
  onDone: () => void
  onCancel: () => void
}

/**
 * Formularen til et fund. Felterne og grænserne er de samme som i den gamle
 * app; positionen sættes med telefonens egen, og kan fjernes igen.
 *
 * Et nyt billede vælges eller tages herfra og lægges i galleriet. Et billede,
 * der allerede ligger der, kan også knyttes til fundet.
 */
export function ObservationForm({
  editing,
  onDone,
  onCancel,
}: ObservationFormProps) {
  const { add, update } = useObservationActions()
  const [draft, setDraft] = useState(() => draftFromObservation(editing))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [photoId, setPhotoId] = useState(editing?.photoId ?? '')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const previewUrl = photoFile ? URL.createObjectURL(photoFile) : null
  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])
  const generateUploadUrl = useMutation(api.gallery.generateUploadUrl)
  const createPhoto = useMutation(api.gallery.createPhoto)
  const photos = usePaginatedQuery(
    api.gallery.listPhotos,
    {},
    { initialNumItems: 30 },
  )

  async function postBlob(
    generateUploadUrl: () => Promise<{ uploadUrl: string }>,
    blob: Blob,
  ) {
    const { uploadUrl } = await generateUploadUrl()
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/jpeg' },
      body: blob,
    })
    if (!response.ok) throw new Error('PHOTO_UPLOAD_NOT_FOUND')
    const payload = (await response.json()) as { storageId?: Id<'_storage'> }
    if (!payload.storageId) throw new Error('PHOTO_UPLOAD_NOT_FOUND')
    return payload.storageId
  }

  async function uploadObservationPhoto(
    file: File,
    caption: string,
    generateUploadUrl: () => Promise<{ uploadUrl: string }>,
    createPhoto: (args: {
      storageId: Id<'_storage'>
      thumbnailStorageId: Id<'_storage'>
      width: number
      height: number
      caption?: string
      clientUploadId: string
    }) => Promise<Id<'photos'>>,
  ) {
    const display = await resizePhotoFile(file, PHOTO_MAX_EDGE)
    const thumb = await resizePhotoFile(file, THUMB_MAX_EDGE)
    const storageId = await postBlob(generateUploadUrl, display.blob)
    const thumbnailStorageId = await postBlob(generateUploadUrl, thumb.blob)
    const photoId = await createPhoto({
      storageId,
      thumbnailStorageId,
      width: display.width,
      height: display.height,
      caption: caption || undefined,
      clientUploadId: crypto.randomUUID(),
    })
    return photoId
  }

  function setField<K extends keyof ObservationDraft>(
    key: K,
    value: ObservationDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function clearPhoto() {
    setPhotoFile(null)
    setPhotoError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  function handleFile(files: FileList | null) {
    const file = files?.[0] ?? null
    setPhotoError(null)
    if (!file) return
    const problem = validateFiles([file])
    if (problem) {
      setPhotoError(problem)
      setPhotoFile(null)
      return
    }
    setPhotoFile(file)
  }

  function pickMyPosition() {
    if (!('geolocation' in navigator)) {
      setError('Telefonen vil ikke give sin position.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setField('latitude', position.coords.latitude)
        setField('longitude', position.coords.longitude)
      },
      () => setError('Positionen kunne ikke hentes.'),
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    const validation = validateObservationDraft(draft)
    if (!validation.ok) {
      setError(validation.message)
      return
    }

    setBusy(true)
    setError(null)
    try {
      let linked = photoId === '' ? undefined : photoId
      if (photoFile) {
        linked = await uploadObservationPhoto(
          photoFile,
          draft.species,
          generateUploadUrl,
          createPhoto,
        )
      }
      if (editing) {
        await update({
          observationId: editing._id,
          ...validation.input,
          photoId: linked,
        })
      } else {
        await add({ ...validation.input, photoId: linked })
      }
      onDone()
    } catch (cause) {
      setError(observationErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const hasPosition = draft.latitude !== null && draft.longitude !== null

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4"
    >
      <h2 className="text-lg font-semibold text-ink-body">
        {editing ? 'Ret fundet' : 'Nyt fund'}
      </h2>

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Hvad så du?
        <input
          value={draft.species}
          onChange={(event) => setField('species', event.target.value)}
          maxLength={SPECIES_MAX_LENGTH}
          required
          className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1 text-sm text-ink-muted">
          Dato
          <input
            type="date"
            value={draft.observedOn}
            onChange={(event) => setField('observedOn', event.target.value)}
            required
            className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm text-ink-muted">
          Sted
          <input
            value={draft.location}
            onChange={(event) => setField('location', event.target.value)}
            className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Note
        <textarea
          value={draft.notes}
          onChange={(event) => setField('notes', event.target.value)}
          maxLength={NOTES_MAX_LENGTH}
          rows={3}
          className="rounded-lg border border-line px-3 py-2 text-ink"
        />
      </label>

      <PositionMapPicker
        position={
          hasPosition
            ? { lat: draft.latitude ?? 0, lng: draft.longitude ?? 0 }
            : null
        }
        onChange={(position) => {
          setField('latitude', position.lat)
          setField('longitude', position.lng)
        }}
      />

      <fieldset className="flex flex-col gap-2 text-sm text-ink-body">
        <legend className="mb-1">Billede</legend>
        {editing?.photoId && !photoFile && (
          <span className="text-ink-subtle">
            Observationen har allerede et billede. Vælg et nyt for at erstatte
            det -- det gamle bliver i galleriet.
          </span>
        )}
        <input
          id="observation-photo-file"
          ref={fileInputRef}
          type="file"
          aria-label="Vælg et billede fra enheden"
          accept="image/*"
          onChange={(event) => handleFile(event.target.files)}
          aria-invalid={photoError ? true : undefined}
          aria-describedby={photoError ? 'observation-photo-error' : undefined}
          className="sr-only"
        />
        <input
          id="observation-photo-camera"
          ref={cameraInputRef}
          type="file"
          aria-label="Tag et billede med kameraet"
          accept="image/*"
          capture="environment"
          onChange={(event) => handleFile(event.target.files)}
          aria-invalid={photoError ? true : undefined}
          aria-describedby={photoError ? 'observation-photo-error' : undefined}
          className="sr-only"
        />
        {photoFile ? (
          <div className="flex flex-wrap items-center gap-3">
            {previewUrl && (
              <img
                src={previewUrl}
                alt=""
                className="h-20 w-20 rounded object-cover"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-ink-muted">
              {photoFile.name}
            </span>
            <button
              type="button"
              onClick={clearPhoto}
              className="min-h-11 rounded-lg border border-line-strong px-3 text-ink-muted"
            >
              Fjern billede
            </button>
          </div>
        ) : (
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-describedby={
                photoError ? 'observation-photo-error' : undefined
              }
              className="min-h-11 rounded-lg bg-accent px-5 py-2 text-white"
            >
              Vælg billede
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              aria-describedby={
                photoError ? 'observation-photo-error' : undefined
              }
              className="min-h-11 rounded-lg border border-accent px-5 py-2 text-ink-body"
            >
              Tag billede
            </button>
          </div>
        )}
        {photoError && (
          <span
            id="observation-photo-error"
            role="alert"
            className="text-danger"
          >
            {photoError}
          </span>
        )}
        <span className="text-xs text-ink-subtle">
          Vælg fra kamerarullen eller dine filer. Maks. 15 MB. Billedet lægges
          også i galleriet under Billeder.
        </span>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Eller vælg et billede, der allerede ligger i galleriet
        <select
          value={photoId}
          onChange={(event) => setPhotoId(event.target.value)}
          className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
        >
          <option value="">Intet billede</option>
          {photos.results.map((photo) => (
            <option key={photo.id} value={photo.id}>
              {photo.caption?.trim() || 'Billede uden tekst'}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {hasPosition ? (
          <>
            <span className="text-ink-subtle">
              {formatPosition(draft.latitude ?? 0, draft.longitude ?? 0)}
            </span>
            <button
              type="button"
              onClick={() => {
                setField('latitude', null)
                setField('longitude', null)
              }}
              className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink-muted"
            >
              Fjern position
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={pickMyPosition}
            className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink-muted"
          >
            Brug min position
          </button>
        )}
      </div>

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
          {busy ? 'Gemmer…' : 'Gem fundet'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-line px-4 py-2 text-ink-muted"
        >
          Annullér
        </button>
      </div>
    </form>
  )
}
