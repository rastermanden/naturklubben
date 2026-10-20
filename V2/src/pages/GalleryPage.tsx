import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAction, useMutation, useQuery, usePaginatedQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useAutoOptimizePendingPhotos } from './useAutoOptimizePendingPhotos'
import { useUploadPhotos, validateFiles, type UploadQueueItem } from './useUploadPhotos'
import { GalleryAlbumGrid } from './GalleryAlbumGrid'
import { PhotoThumbnail } from './PhotoThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import {
  clearAlbumSearchParams,
  updateGallerySearchParam,
} from './gallerySearchParams'
import type { GalleryAlbum, Photo } from './types'

/**
 * Gallerisiden. Porteret fra `src/pages/GalleryPage.tsx`.
 *
 * Siden er blevet enklere, fordi Convex-abonnementet erstatter både
 * React Query og Realtime-kanalerne: `usePaginatedQuery` og `useQuery` holder
 * selv gitteret, albummene og kommentarerne opdaterede, når en mutation gemmer.
 *
 * To ting er *ikke* porteret, fordi de afhænger af dele af V2, der ikke findes
 * endnu:
 *
 * - Vælgeren "knyt til begivenhed" i upload-formularen. Den hentede listen af
 *   begivenheder i den gamle app; `events`-tabellen hører til kalender-slicen
 *   og findes ikke her. `createPhoto` tager allerede `eventId`, så en
 *   kalender-slice kan sende det med via `?album=<eventId>`.
 * - Den delte `useErrorFocus`-hook og `useDialogFocus`. Fokus sættes her med
 *   en ref, og lysbordet lukker med Escape.
 */

const PHOTO_PAGE_SIZE = 40

function queueStatus(item: UploadQueueItem) {
  switch (item.status) {
    case 'queued':
      return 'Venter på upload'
    case 'uploading':
      return 'Uploader…'
    case 'saved':
      return 'Gemt'
    case 'failed':
      return item.error ?? 'Upload fejlede'
  }
}

function albumDateLabel(album: GalleryAlbum) {
  if (album.latestPhotoAt === null) return null
  return new Date(album.latestPhotoAt).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function GalleryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const albumParam = searchParams.get('album')
  const photoParam = searchParams.get('photo')

  const albums = useQuery(api.gallery.listAlbums)
  const photosQuery = usePaginatedQuery(
    api.gallery.listPhotos,
    albumParam ? { albumKey: albumParam } : {},
    { initialNumItems: PHOTO_PAGE_SIZE },
  )
  const sharedPhoto = useQuery(
    api.gallery.getPhoto,
    photoParam ? { photoId: photoParam as Id<'photos'> } : 'skip',
  )

  const deletePhoto = useMutation(api.gallery.deletePhoto)
  const optimizePhoto = useAction(api.gallery.optimizePhoto)
  const upload = useUploadPhotos()
  useAutoOptimizePendingPhotos()

  const [caption, setCaption] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null)
  const [retryingPhotoId, setRetryingPhotoId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const photos: Photo[] = photosQuery.results
  const activePhoto =
    photoParam === null
      ? null
      : (photos.find((photo) => photo.id === photoParam) ?? sharedPhoto ?? null)
  const activeIndex = activePhoto
    ? photos.findIndex((photo) => photo.id === activePhoto.id)
    : -1
  const previousPhoto = activeIndex > 0 ? photos[activeIndex - 1] : undefined
  const nextPhoto =
    activeIndex >= 0 ? photos[activeIndex + 1] : undefined
  const currentAlbum = albumParam
    ? (albums?.find((album) => album.albumId === albumParam) ?? null)
    : null

  // Hent næste side, inden man bladrer ud til kanten af det indlæste galleri.
  useEffect(() => {
    if (activeIndex < 0) return
    if (activeIndex < photos.length - 5) return
    if (photosQuery.status !== 'CanLoadMore') return
    photosQuery.loadMore(PHOTO_PAGE_SIZE)
  }, [activeIndex, photos.length, photosQuery])

  function setGalleryParam(
    key: 'album' | 'photo',
    value: string | null,
    options?: { replace?: boolean },
  ) {
    setSearchParams(
      (current) => updateGallerySearchParam(current, key, value),
      options,
    )
  }

  function openAlbum(album: GalleryAlbum) {
    setActionError(null)
    setGalleryParam('album', album.albumId)
  }

  function backToAlbums() {
    setActionError(null)
    setSearchParams((current) => clearAlbumSearchParams(current))
  }

  function showPhoto(photo: Photo | undefined) {
    if (!photo) return
    setActionError(null)
    setGalleryParam('photo', photo.id, { replace: true })
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    const errors = fileArray
      .map((file) => validateFiles([file]))
      .filter((message): message is string => message !== null)
    setFormError(errors.length > 0 ? errors.join(' ') : null)

    const validFiles = fileArray.filter((file) => validateFiles([file]) === null)
    if (validFiles.length > 0) {
      upload.enqueue({
        files: validFiles,
        caption,
        eventId: currentAlbum?.eventId ?? null,
        eventTitle: currentAlbum?.title,
      })
      setCaption('')
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    handleFilesSelected(event.dataTransfer.files)
  }

  function removePhoto(photo: Photo) {
    setActionError(null)
    setBusyPhotoId(photo.id)
    void deletePhoto({ photoId: photo.id as Id<'photos'> })
      .then(() => setGalleryParam('photo', null))
      .catch(() =>
        setActionError('Billedet kunne ikke slettes. Prøv igen.'),
      )
      .finally(() => setBusyPhotoId(null))
  }

  function retryOptimization(photo: Photo) {
    setActionError(null)
    setRetryingPhotoId(photo.id)
    void optimizePhoto({ photoId: photo.id as Id<'photos'> })
      .catch(() => setActionError('Optimeringen kunne ikke startes. Prøv igen.'))
      .finally(() => setRetryingPhotoId(null))
  }

  const positionLabel =
    activeIndex >= 0
      ? `Billede ${activeIndex + 1} af ${photos.length}${
          photosQuery.status === 'CanLoadMore' ? '+' : ''
        }`
      : null

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Billeder</h1>
        <p className="mt-1 text-ink-muted">
          Billeder fra klubbens ture og begivenheder, samlet i album.
        </p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`flex flex-col gap-3 rounded-lg border-2 border-dashed p-4 ${
          dragActive
            ? 'border-accent-soft bg-surface-sunken'
            : 'border-line bg-surface'
        }`}
      >
        <h2 className="text-lg font-semibold text-ink">Upload billeder</h2>

        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Billedtekst (valgfri)
          <input
            type="text"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            className="min-h-11 rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        <input
          ref={fileInputRef}
          type="file"
          aria-label="Vælg billeder fra enheden"
          accept="image/*"
          multiple
          onChange={(event) => handleFilesSelected(event.target.files)}
          className="sr-only"
        />
        <input
          ref={cameraInputRef}
          type="file"
          aria-label="Tag et billede med kameraet"
          accept="image/*"
          capture="environment"
          onChange={(event) => handleFilesSelected(event.target.files)}
          className="sr-only"
        />

        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-11 rounded-lg bg-accent px-5 py-2 text-white"
          >
            Vælg billeder
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="min-h-11 rounded-lg border border-accent px-5 py-2 text-ink-body"
          >
            Tag billede
          </button>
        </div>

        <p className="text-xs text-ink-subtle">
          Vælg fra kamerarullen eller dine filer — eller træk billeder herind.
          Maks. 15 MB pr. billede.
        </p>

        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}

        {upload.items.length > 0 && (
          <div className="border-t border-line-soft pt-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-medium text-ink-body">Uploadstatus</h3>
              {upload.items.some((item) => item.status === 'saved') && (
                <button
                  type="button"
                  onClick={upload.clearSaved}
                  className="min-h-11 text-sm text-ink-muted underline"
                >
                  Skjul færdige
                </button>
              )}
            </div>
            <ul className="grid gap-2" aria-live="polite">
              {upload.items.map((item) => (
                <li
                  key={item.id}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded bg-surface-sunken px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {item.file.name}
                    </span>
                    <span
                      className={
                        item.status === 'failed'
                          ? 'text-danger'
                          : 'text-ink-subtle'
                      }
                    >
                      {queueStatus(item)}
                    </span>
                  </span>
                  {item.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => upload.retry(item)}
                      className="min-h-11 rounded border border-danger-line-strong px-3 py-2 text-danger"
                    >
                      Prøv upload igen
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {photosQuery.status === 'LoadingFirstPage' && (
        <p role="status" className="py-12 text-center text-ink-muted">
          Henter billeder…
        </p>
      )}

      {photosQuery.status !== 'LoadingFirstPage' && photos.length === 0 && (
        <p className="rounded bg-surface-sunken p-5 text-ink-muted">
          Ingen billeder endnu — vær den første til at uploade et.
        </p>
      )}

      {photos.length > 0 && !albumParam && (
        <div>
          <h2 className="mb-3 text-xl font-semibold text-ink">Album</h2>
          {albums === undefined && (
            <p role="status" className="py-6 text-center text-ink-muted">
              Henter album…
            </p>
          )}
          {albums !== undefined && (
            <GalleryAlbumGrid albums={albums} onOpenAlbum={openAlbum} />
          )}
        </div>
      )}

      {photos.length > 0 && albumParam && (
        <div>
          <div className="mb-4 flex flex-col gap-1">
            <button
              type="button"
              onClick={backToAlbums}
              className="min-h-11 self-start text-sm text-ink-muted underline underline-offset-2"
            >
              ← Alle album
            </button>
            <h2 className="text-xl font-semibold text-ink">
              {currentAlbum?.title ?? 'Album'}
            </h2>
            <p className="text-sm text-ink-subtle">
              {currentAlbum === null
                ? 'Albummet findes ikke længere. Viser det, der ligger i det.'
                : `${currentAlbum.photoCount === 1 ? '1 billede' : `${currentAlbum.photoCount} billeder`}${
                    albumDateLabel(currentAlbum)
                      ? ` · senest ${albumDateLabel(currentAlbum)}`
                      : ''
                  }`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo) => (
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

          {photosQuery.status === 'CanLoadMore' && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => photosQuery.loadMore(PHOTO_PAGE_SIZE)}
                className="min-h-11 rounded-lg border border-accent px-5 py-2 text-ink-body"
              >
                Hent flere billeder
              </button>
            </div>
          )}
          {photosQuery.status === 'LoadingMore' && (
            <p role="status" className="mt-5 text-center text-ink-muted">
              Henter flere billeder…
            </p>
          )}
        </div>
      )}

      {photoParam !== null && activePhoto === null && sharedPhoto === null && (
        <div
          role="alert"
          className="rounded border border-danger-line bg-danger-surface p-4 text-danger-strong"
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

      {activePhoto !== null && (
        <PhotoLightbox
          photo={activePhoto}
          onClose={() => setGalleryParam('photo', null)}
          onPrevious={previousPhoto ? () => showPhoto(previousPhoto) : null}
          onNext={nextPhoto ? () => showPhoto(nextPhoto) : null}
          positionLabel={positionLabel}
          deleting={busyPhotoId === activePhoto.id}
          onDelete={removePhoto}
          retrying={retryingPhotoId === activePhoto.id}
          onRetryOptimization={retryOptimization}
          actionError={actionError}
        />
      )}

    </section>
  )
}

export default GalleryPage
