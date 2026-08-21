import { useRef, useState } from 'react'
import { usePhotos } from '../features/gallery/usePhotos'
import {
  useUploadPhotos,
  validateFiles,
} from '../features/gallery/useUploadPhotos'
import { useDeletePhoto } from '../features/gallery/useDeletePhoto'
import { useEventsForSelect } from '../features/gallery/useEventsForSelect'
import { PhotoThumbnail } from '../features/gallery/PhotoThumbnail'
import { PhotoLightbox } from '../features/gallery/PhotoLightbox'
import type { Photo } from '../features/gallery/types'

function GalleryPage() {
  const { data: photos, isLoading } = usePhotos()
  const { data: events } = useEventsForSelect()
  const upload = useUploadPhotos()
  const deletePhoto = useDeletePhoto()

  const [caption, setCaption] = useState('')
  const [eventId, setEventId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-semibold text-green-900">Billeder</h1>

      <div className="mb-6 flex flex-col gap-2 rounded border border-green-100 p-4">
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
          capture="environment"
          multiple
          onChange={(event) => handleFilesSelected(event.target.files)}
          disabled={upload.isPending}
          className="text-sm"
        />

        {upload.isPending && (
          <p className="text-sm text-green-800">Uploader…</p>
        )}
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
              onClick={() => setActivePhoto(photo)}
            />
          ))}
        </div>
      )}

      {activePhoto && (
        <PhotoLightbox
          photo={activePhoto}
          onClose={() => setActivePhoto(null)}
          deleting={deletePhoto.isPending}
          onDelete={(photo) => {
            deletePhoto.mutate(photo)
            setActivePhoto(null)
          }}
        />
      )}
    </main>
  )
}

export default GalleryPage
