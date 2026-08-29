import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { validateFiles } from '../gallery/useUploadPhotos'
import {
  draftFromObservation,
  formatPosition,
  localIsoDate,
  LOCATION_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  SPECIES_MAX_LENGTH,
  validateObservationDraft,
  type DraftField,
} from './observationInput'
import type { Observation, ObservationInput } from './types'

interface ObservationFormProps {
  observation: Observation | null
  submitting: boolean
  error: string | null
  onSubmit: (
    input: Omit<ObservationInput, 'photo_id'>,
    photoFile: File | null,
  ) => void
  onCancel: () => void
}

type PositionState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'error'; message: string }

function geolocationMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Appen har ikke lov til at bruge din position. Skriv stedet i stedet.'
  }
  return 'Positionen kunne ikke findes lige nu. Prøv igen, eller skriv stedet.'
}

export function ObservationForm({
  observation,
  submitting,
  error,
  onSubmit,
  onCancel,
}: ObservationFormProps) {
  const today = localIsoDate()
  const [draft, setDraft] = useState(() =>
    draftFromObservation(observation, today),
  )
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [position, setPosition] = useState<PositionState>({ status: 'idle' })
  const [validation, setValidation] = useState<{
    field: DraftField
    message: string
  } | null>(null)
  const speciesRef = useRef<HTMLInputElement>(null)
  const observedOnRef = useRef<HTMLInputElement>(null)
  const locationRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose: onCancel,
    initialFocusRef: speciesRef,
  })

  useEffect(() => {
    if (!validation) return
    const refs = {
      species: speciesRef,
      observedOn: observedOnRef,
      location: locationRef,
      notes: notesRef,
    }
    refs[validation.field].current?.focus()
  }, [validation])

  const previewUrl = photoFile ? URL.createObjectURL(photoFile) : null
  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function update<K extends keyof typeof draft>(
    field: K,
    value: (typeof draft)[K],
  ) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function locate() {
    if (!('geolocation' in navigator)) {
      setPosition({
        status: 'error',
        message: 'Din enhed kan ikke finde positionen. Skriv stedet i stedet.',
      })
      return
    }
    setPosition({ status: 'locating' })
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDraft((current) => ({
          ...current,
          latitude: coords.latitude,
          longitude: coords.longitude,
        }))
        setPosition({ status: 'idle' })
      },
      (geoError) =>
        setPosition({ status: 'error', message: geolocationMessage(geoError) }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    )
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

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault()
    const result = validateObservationDraft(draft, today)
    if (!result.ok) {
      setValidation({ field: result.field, message: result.message })
      return
    }
    setValidation(null)
    onSubmit(result.input, photoFile)
  }

  const inputClass =
    'rounded border border-green-300 px-3 py-2 text-base text-gray-950'
  const errorId = (field: DraftField) =>
    validation?.field === field ? `observation-${field}-error` : undefined
  const fieldError = (field: DraftField) =>
    validation?.field === field ? (
      <span
        id={`observation-${field}-error`}
        role="alert"
        className="text-red-700"
      >
        {validation.message}
      </span>
    ) : null

  const hasPosition = draft.latitude !== null && draft.longitude !== null

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="observation-form-title"
      tabIndex={-1}
    >
      <div className="max-h-[95svh] w-full overflow-y-auto rounded-t-xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-xl">
        <h2
          id="observation-form-title"
          className="mb-5 text-xl font-semibold text-green-900"
        >
          {observation ? 'Redigér observation' : 'Ny observation'}
        </h2>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <label className="flex flex-col gap-1 text-sm text-green-900">
            Hvad så du?
            <input
              id="observation-species"
              ref={speciesRef}
              required
              maxLength={SPECIES_MAX_LENGTH}
              placeholder="Fx rød glente, kantarel, rådyr"
              value={draft.species}
              onChange={(changeEvent) =>
                update('species', changeEvent.target.value)
              }
              aria-invalid={validation?.field === 'species' || undefined}
              aria-describedby={errorId('species')}
              className={inputClass}
            />
            {fieldError('species')}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-green-900">
              Sted
              <input
                id="observation-location"
                ref={locationRef}
                maxLength={LOCATION_MAX_LENGTH}
                placeholder="Fx Mols Bjerge"
                value={draft.location}
                onChange={(changeEvent) =>
                  update('location', changeEvent.target.value)
                }
                aria-invalid={validation?.field === 'location' || undefined}
                aria-describedby={errorId('location')}
                className={inputClass}
              />
              {fieldError('location')}
            </label>

            <label className="flex flex-col gap-1 text-sm text-green-900">
              Dato
              <input
                id="observation-observed-on"
                ref={observedOnRef}
                type="date"
                required
                max={today}
                value={draft.observedOn}
                onChange={(changeEvent) =>
                  update('observedOn', changeEvent.target.value)
                }
                aria-invalid={validation?.field === 'observedOn' || undefined}
                aria-describedby={errorId('observedOn')}
                className={inputClass}
              />
              {fieldError('observedOn')}
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm text-green-900">
            Noter
            <textarea
              id="observation-notes"
              ref={notesRef}
              rows={3}
              maxLength={NOTES_MAX_LENGTH}
              placeholder="Antal, adfærd, vejr -- hvad der er værd at huske"
              value={draft.notes}
              onChange={(changeEvent) =>
                update('notes', changeEvent.target.value)
              }
              aria-invalid={validation?.field === 'notes' || undefined}
              aria-describedby={errorId('notes')}
              className={inputClass}
            />
            {fieldError('notes')}
          </label>

          <fieldset className="flex flex-col gap-2 text-sm text-green-900">
            <legend className="mb-1">Position</legend>
            {hasPosition ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-green-800">
                  {formatPosition(draft.latitude!, draft.longitude!)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    update('latitude', null)
                    update('longitude', null)
                  }}
                  className="min-h-11 rounded-lg border border-green-300 px-3 text-green-800"
                >
                  Fjern position
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={locate}
                disabled={position.status === 'locating'}
                className="min-h-11 self-start rounded-lg border border-green-300 px-3 text-green-800 disabled:opacity-60"
              >
                {position.status === 'locating'
                  ? 'Finder din position…'
                  : 'Brug min position'}
              </button>
            )}
            {position.status === 'error' && (
              <span role="alert" className="text-red-700">
                {position.message}
              </span>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2 text-sm text-green-900">
            <legend className="mb-1">Billede</legend>
            {observation?.photo_id && !photoFile && (
              <span className="text-green-700">
                Observationen har allerede et billede. Vælg et nyt for at
                erstatte det -- det gamle bliver i galleriet.
              </span>
            )}
            <input
              id="observation-photo-file"
              ref={fileInputRef}
              type="file"
              aria-label="Vælg et billede fra enheden"
              accept="image/*"
              onChange={(changeEvent) => handleFile(changeEvent.target.files)}
              aria-invalid={photoError ? true : undefined}
              aria-describedby={
                photoError ? 'observation-photo-error' : undefined
              }
              className="sr-only"
            />
            <input
              id="observation-photo-camera"
              ref={cameraInputRef}
              type="file"
              aria-label="Tag et billede med kameraet"
              accept="image/*"
              capture="environment"
              onChange={(changeEvent) => handleFile(changeEvent.target.files)}
              aria-invalid={photoError ? true : undefined}
              aria-describedby={
                photoError ? 'observation-photo-error' : undefined
              }
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
                <span className="min-w-0 flex-1 truncate text-green-800">
                  {photoFile.name}
                </span>
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="min-h-11 rounded-lg border border-green-300 px-3 text-green-800"
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
                  className="min-h-11 rounded-lg bg-green-800 px-5 py-2 text-white"
                >
                  Vælg billede
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  aria-describedby={
                    photoError ? 'observation-photo-error' : undefined
                  }
                  className="min-h-11 rounded-lg border border-green-800 px-5 py-2 text-green-900"
                >
                  Tag billede
                </button>
              </div>
            )}

            {photoError && (
              <span
                id="observation-photo-error"
                role="alert"
                className="text-red-700"
              >
                {photoError}
              </span>
            )}
            <span className="text-xs text-green-700">
              Vælg fra kamerarullen eller dine filer. Maks. 15 MB. Billedet
              lægges også i galleriet under Billeder.
            </span>
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="min-h-11 rounded-lg border border-green-300 px-4 py-2 text-green-800"
            >
              Annullér
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 rounded-lg bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {submitting
                ? 'Gemmer…'
                : observation
                  ? 'Gem ændringer'
                  : 'Registrér observation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
