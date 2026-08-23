import { useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePhotos } from '../features/gallery/usePhotos'
import {
  useUploadPhotos,
  validateFiles,
} from '../features/gallery/useUploadPhotos'
import { useDeletePhoto } from '../features/gallery/useDeletePhoto'
import { useEventsForSelect } from '../features/gallery/useEventsForSelect'
import { PhotoThumbnail } from '../features/gallery/PhotoThumbnail'
import { PhotoLightbox } from '../features/gallery/PhotoLightbox'

function GalleryPage() {
  const { data: photos, isLoading } = usePhotos()
  const { data: events } = useEventsForSelect()
  const upload = useUploadPhotos()
  const deletePhoto = useDeletePhoto()

  const [caption, setCaption] = useState('')
  const [eventId, setEventId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const sharedPhotoId = searchParams.get('photo')
  const activePhoto =
    sharedPhotoId && photos
      ? photos.find((photo) => photo.id === sharedPhotoId) ?? null
      : null
  // To separate inputs: det ene uden `capture`, så telefonen viser hele
  // vælgeren (kamerarulle, Filer, Drev …), det andet med `capture`, så
  // "Tag billede" går direkte i kameraet.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  function setPhotoSearchParam(photoId: string | null) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (photoId) {
        next.set('photo', photoId)
      } else {
        next.delete('photo')
      }
      return next
    })
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)

    const validationError = validateFiles(fileArray)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    try {
      await upload.mutateAsync({
        files: fileArray,
        caption,
        eventId: eventId || null,
      })
      setCaption('')
      setEventId('')
    } catch {
      setError('Upload fejlede. Prøv igen.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (upload.isPending) return
    handleFilesSelected(event.dataTransfer.files)
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-semibold text-green-900">Billeder</h1>

      <div
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
        <h2 className="text-lg font-semibold text-green-900">
          Upload billeder
        </h2>

        <label className="flex flex-col gap-1 text-sm text-green-900">
          Billedtekst (valgfri)
          <input
            type="text"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            className="rounded border border-green-300 px-3 py-2 text-base"
          />
        </label>

        {events && events.length > 0 && (
          <label className="flex flex-col gap-1 text-sm text-green-900">
            Knyt til begivenhed (valgfri)
            <select
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              className="rounded border border-green-300 px-3 py-2 text-base"
            >
              <option value="">Ingen</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => handleFilesSelected(event.target.files)}
          className="sr-only"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => handleFilesSelected(event.target.files)}
          className="sr-only"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isPending}
            className="min-h-11 rounded-lg bg-green-800 px-5 py-2 text-white disabled:opacity-50"
          >
            {upload.isPending ? 'Uploader…' : 'Vælg billeder'}
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={upload.isPending}
            className="min-h-11 rounded-lg border border-green-800 px-5 py-2 text-green-900 disabled:opacity-50"
          >
            Tag billede
          </button>
        </div>

        <p className="text-xs text-green-700">
          Vælg fra kamerarullen eller dine filer — eller træk billeder herind.
          Maks. 15 MB pr. billede.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {isLoading && <p className="text-green-800">Henter billeder…</p>}

      {photos && photos.length === 0 && (
        <p className="text-green-800">
          Ingen billeder endnu — vær den første til at uploade et.
        </p>
      )}

      {photos && photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
            <PhotoThumbnail
              key={photo.id}
              photo={photo}
              onClick={() => setPhotoSearchParam(photo.id)}
            />
          ))}
        </div>
      )}

      {activePhoto && (
        <PhotoLightbox
          photo={activePhoto}
          onClose={() => setPhotoSearchParam(null)}
          deleting={deletePhoto.isPending}
          onDelete={(photo) => {
            deletePhoto.mutate(photo)
            setPhotoSearchParam(null)
          }}
        />
      )}
    </main>
  )
}

export default GalleryPage
