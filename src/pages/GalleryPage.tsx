import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePhotos } from '../features/gallery/usePhotos'
import {
  useUploadPhotos,
  validateFiles,
  type UploadQueueItem,
} from '../features/gallery/useUploadPhotos'
import { useDeletePhoto } from '../features/gallery/useDeletePhoto'
import { useEventsForSelect } from '../features/gallery/useEventsForSelect'
import { PhotoThumbnail } from '../features/gallery/PhotoThumbnail'
import { PhotoLightbox } from '../features/gallery/PhotoLightbox'
import {
  filterPhotosByEvent,
  updateGallerySearchParam,
  WITHOUT_EVENT_FILTER,
} from '../features/gallery/gallerySearchParams'
import { useRetryPhotoOptimization } from '../features/gallery/useRetryPhotoOptimization'
import { useAutoOptimizePendingPhotos } from '../features/gallery/useAutoOptimizePendingPhotos'
import type { Photo } from '../features/gallery/types'
import { useErrorFocus } from '../hooks/useErrorFocus'

const EMPTY_PHOTOS: Photo[] = []

function queueStatus(item: UploadQueueItem) {
  switch (item.status) {
    case 'queued':
      return 'Venter på upload'
    case 'uploading':
      return 'Uploader…'
    case 'saved':
      return 'Original gemt'
    case 'failed':
      return item.error ?? 'Upload fejlede'
  }
}

function GalleryPage() {
  const photosQuery = usePhotos()
  const eventsQuery = useEventsForSelect()
  const upload = useUploadPhotos()
  const deletePhoto = useDeletePhoto()
  const retryOptimization = useRetryPhotoOptimization()

  const [caption, setCaption] = useState('')
  const [eventId, setEventId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formErrorSource, setFormErrorSource] = useState<
    'files' | 'camera' | null
  >(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const sharedPhotoId = searchParams.get('photo')
  const eventFilter = searchParams.get('event')
  const photos = photosQuery.data ?? EMPTY_PHOTOS
  useAutoOptimizePendingPhotos(photos)
  const filteredPhotos = useMemo(
    () => filterPhotosByEvent(photos, eventFilter),
    [eventFilter, photos],
  )
  const eventOptions = useMemo(() => {
    const options = new Map<string, string>()
    for (const photo of photos) {
      if (photo.event) options.set(photo.event.id, photo.event.title)
    }
    return [...options.entries()].sort(([, first], [, second]) =>
      first.localeCompare(second, 'da'),
    )
  }, [photos])
  const selectedFilterIsUnknown =
    eventFilter !== null &&
    eventFilter !== WITHOUT_EVENT_FILTER &&
    !eventOptions.some(([id]) => id === eventFilter)
  const activePhoto =
    sharedPhotoId !== null
      ? (photos.find((photo) => photo.id === sharedPhotoId) ?? null)
      : null

  // To separate inputs: det ene uden `capture`, så telefonen viser hele
  // vælgeren; det andet med `capture`, så kameraet åbner direkte.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileButtonRef = useRef<HTMLButtonElement>(null)
  const cameraButtonRef = useRef<HTMLButtonElement>(null)
  const [focusFileError, fileErrorAnnouncement] = useErrorFocus(fileButtonRef)
  const [focusCameraError, cameraErrorAnnouncement] =
    useErrorFocus(cameraButtonRef)
  const errorAnnouncement =
    formErrorSource === 'files'
      ? fileErrorAnnouncement
      : formErrorSource === 'camera'
        ? cameraErrorAnnouncement
        : 0

  function setGalleryParam(key: 'event' | 'photo', value: string | null) {
    setSearchParams((current) => updateGallerySearchParam(current, key, value))
  }

  function handleFilesSelected(
    files: FileList | null,
    source: 'files' | 'camera',
  ) {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    const validFiles = fileArray.filter((file) => !validateFiles([file]))
    const validationErrors = fileArray
      .map((file) => validateFiles([file]))
      .filter((message): message is string => message !== null)

    setFormError(
      validationErrors.length > 0 ? validationErrors.join(' ') : null,
    )
    setFormErrorSource(validationErrors.length > 0 ? source : null)
    if (validationErrors.length > 0) {
      if (source === 'files') focusFileError()
      else focusCameraError()
    }
    if (validFiles.length > 0) {
      upload.enqueue({
        files: validFiles,
        caption,
        eventId: eventId || null,
      })
      setCaption('')
      setEventId('')
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    handleFilesSelected(event.dataTransfer.files, 'files')
  }

  function retryPhoto(photo: Photo) {
    setActionError(null)
    retryOptimization.mutate(photo.id, {
      onError: () =>
        setActionError('Optimeringen kunne ikke startes. Prøv igen.'),
    })
  }

  function removePhoto(photo: Photo) {
    setActionError(null)
    deletePhoto.mutate(photo, {
      onSuccess: () => setGalleryParam('photo', null),
      onError: () => setActionError('Billedet kunne ikke slettes. Prøv igen.'),
    })
  }

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-green-900">Billeder</h1>
          <p className="mt-1 text-green-700">
            Billeder fra klubbens ture og begivenheder.
          </p>
        </div>
        <label className="flex min-w-60 flex-col gap-1 text-sm text-green-900">
          Filtrér efter begivenhed
          <select
            id="gallery-filter-event"
            value={eventFilter ?? ''}
            onChange={(event) =>
              setGalleryParam('event', event.target.value || null)
            }
            className="min-h-11 rounded border border-green-300 bg-white px-3 py-2 text-base"
          >
            <option value="">Alle billeder</option>
            <option value={WITHOUT_EVENT_FILTER}>Uden begivenhed</option>
            {selectedFilterIsUnknown && eventFilter && (
              <option value={eventFilter}>Ukendt begivenhed</option>
            )}
            {eventOptions.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section
        aria-labelledby="upload-heading"
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`mb-6 flex flex-col gap-3 rounded-lg border-2 border-dashed p-4 ${
          dragActive
            ? 'border-green-700 bg-green-50'
            : 'border-green-200 bg-white'
        }`}
      >
        <h2
          id="upload-heading"
          className="text-lg font-semibold text-green-900"
        >
          Upload billeder
        </h2>

        <label className="flex flex-col gap-1 text-sm text-green-900">
          Billedtekst (valgfri)
          <input
            id="gallery-upload-caption"
            type="text"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            className="min-h-11 rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        {eventsQuery.data && eventsQuery.data.length > 0 && (
          <label className="flex flex-col gap-1 text-sm text-green-900">
            Knyt til begivenhed (valgfri)
            <select
              id="gallery-upload-event"
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              className="min-h-11 rounded border border-green-300 bg-white px-3 py-2 text-base"
            >
              <option value="">Ingen</option>
              {eventsQuery.data.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {eventsQuery.isError && (
          <p role="alert" className="text-sm text-red-700">
            Begivenheder kunne ikke hentes. Du kan stadig uploade uden at vælge
            en begivenhed.
          </p>
        )}

        <input
          id="gallery-upload-files"
          ref={fileInputRef}
          type="file"
          aria-label="Vælg billeder fra enheden"
          accept="image/*"
          multiple
          onChange={(event) => handleFilesSelected(event.target.files, 'files')}
          aria-invalid={formErrorSource === 'files' ? true : undefined}
          aria-describedby={
            formErrorSource === 'files' ? 'gallery-upload-error' : undefined
          }
          className="sr-only"
        />
        <input
          id="gallery-upload-camera"
          ref={cameraInputRef}
          type="file"
          aria-label="Tag et billede med kameraet"
          accept="image/*"
          capture="environment"
          onChange={(event) =>
            handleFilesSelected(event.target.files, 'camera')
          }
          aria-invalid={formErrorSource === 'camera' ? true : undefined}
          aria-describedby={
            formErrorSource === 'camera' ? 'gallery-upload-error' : undefined
          }
          className="sr-only"
        />

        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <button
            ref={fileButtonRef}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-describedby={
              formErrorSource === 'files' ? 'gallery-upload-error' : undefined
            }
            className="min-h-11 rounded-lg bg-green-800 px-5 py-2 text-white"
          >
            Vælg billeder
          </button>
          <button
            ref={cameraButtonRef}
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            aria-describedby={
              formErrorSource === 'camera' ? 'gallery-upload-error' : undefined
            }
            className="min-h-11 rounded-lg border border-green-800 px-5 py-2 text-green-900"
          >
            Tag billede
          </button>
        </div>

        <p className="text-xs text-green-700">
          Vælg fra kamerarullen eller dine filer — eller træk billeder herind.
          Maks. 15 MB pr. billede.
        </p>

        {formError && (
          <p
            key={errorAnnouncement}
            id="gallery-upload-error"
            role={errorAnnouncement > 0 ? 'alert' : undefined}
            className="text-sm text-red-700"
          >
            {formError}
          </p>
        )}

        {upload.items.length > 0 && (
          <div className="mt-1 border-t border-green-100 pt-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-medium text-green-900">Uploadstatus</h3>
              {upload.items.some((item) => item.status === 'saved') && (
                <button
                  type="button"
                  onClick={upload.clearSaved}
                  className="min-h-11 text-sm text-green-800 underline"
                >
                  Skjul færdige
                </button>
              )}
            </div>
            <ul className="grid gap-2" aria-live="polite">
              {upload.items.map((item) => (
                <li
                  key={item.id}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded bg-green-50 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-green-950">
                      {item.file.name}
                    </span>
                    <span
                      className={
                        item.status === 'failed'
                          ? 'text-red-700'
                          : 'text-green-700'
                      }
                    >
                      {queueStatus(item)}
                    </span>
                  </span>
                  {item.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => upload.retry(item)}
                      className="min-h-11 rounded border border-red-700 px-3 py-2 text-red-700"
                    >
                      Prøv upload igen
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {upload.isUploading && (
          <p role="status" className="sr-only">
            Billeder uploades
          </p>
        )}
      </section>

      {photosQuery.isLoading && (
        <p role="status" className="py-12 text-center text-green-800">
          Henter billeder…
        </p>
      )}

      {photosQuery.isError && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-red-800"
        >
          Galleriet kunne ikke hentes.
          <button
            type="button"
            onClick={() => photosQuery.refetch()}
            className="ml-2 min-h-11 underline"
          >
            Prøv igen
          </button>
        </div>
      )}

      {photosQuery.isSuccess && photos.length === 0 && (
        <p className="rounded bg-green-50 p-5 text-green-800">
          Ingen billeder endnu — vær den første til at uploade et.
        </p>
      )}

      {photosQuery.isSuccess &&
        photos.length > 0 &&
        filteredPhotos.length === 0 && (
          <div className="rounded bg-green-50 p-5 text-green-800">
            <p>Der er ingen billeder for det valgte filter.</p>
            <button
              type="button"
              onClick={() => setGalleryParam('event', null)}
              className="mt-2 min-h-11 underline"
            >
              Vis alle billeder
            </button>
          </div>
        )}

      {filteredPhotos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {filteredPhotos.map((photo) => (
            <PhotoThumbnail
              key={photo.id}
              photo={photo}
              onClick={() => {
                setActionError(null)
                setGalleryParam('photo', photo.id)
              }}
            />
          ))}
        </div>
      )}

      {photosQuery.isSuccess && sharedPhotoId && !activePhoto && (
        <div
          role="alert"
          className="fixed right-4 bottom-4 z-30 rounded bg-red-50 p-4 text-red-800 shadow"
        >
          Billedlinket findes ikke længere.
          <button
            type="button"
            onClick={() => setGalleryParam('photo', null)}
            className="ml-2 min-h-11 underline"
          >
            Luk
          </button>
        </div>
      )}

      {activePhoto && (
        <PhotoLightbox
          key={activePhoto.id}
          photo={activePhoto}
          onClose={() => setGalleryParam('photo', null)}
          deleting={deletePhoto.isPending}
          onDelete={removePhoto}
          retrying={
            retryOptimization.isPending &&
            retryOptimization.variables === activePhoto.id
          }
          onRetryOptimization={retryPhoto}
          actionError={actionError}
        />
      )}
    </main>
  )
}

export default GalleryPage
