import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePhoto, usePhotos } from '../features/gallery/usePhotos'
import {
  useUploadPhotos,
  validateFiles,
  type UploadQueueItem,
} from '../features/gallery/useUploadPhotos'
import { useDeletePhoto } from '../features/gallery/useDeletePhoto'
import { useEventsForSelect } from '../features/gallery/useEventsForSelect'
import { useGalleryAlbums } from '../features/gallery/useGalleryAlbums'
import type { GalleryAlbum } from '../features/gallery/useGalleryAlbums'
import { GalleryAlbumGrid } from '../features/gallery/GalleryAlbumGrid'
import {
  commentCountFor,
  usePhotoCommentCounts,
} from '../features/gallery/usePhotoCommentCounts'
import { PhotoThumbnail } from '../features/gallery/PhotoThumbnail'
import { PhotoLightbox } from '../features/gallery/PhotoLightbox'
import {
  clearAlbumSearchParams,
  filterPhotosByEvent,
  updateGallerySearchParam,
  WITHOUT_EVENT_ALBUM,
} from '../features/gallery/gallerySearchParams'
import { useRetryPhotoOptimization } from '../features/gallery/useRetryPhotoOptimization'
import { useAutoOptimizePendingPhotos } from '../features/gallery/useAutoOptimizePendingPhotos'
import type { Photo } from '../features/gallery/types'
import { useErrorFocus } from '../hooks/useErrorFocus'

const EMPTY_PHOTOS: Photo[] = []
const EMPTY_ALBUMS: GalleryAlbum[] = []
const EMPTY_IDS: string[] = []

// Hent næste side, inden man bladrer helt ud til kanten af det indlæste
// galleri, så bladringen ikke står stille og venter på et netværkskald.
const PREFETCH_MARGIN = 5

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

function formatAlbumDate(value: string) {
  return new Date(value).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function GalleryPage() {
  const photosQuery = usePhotos()
  const albumsQuery = useGalleryAlbums()
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
  // Album pr. begivenhed (#218): "album" står i URL'en, så et enkelt album kan
  // deles som link. Uden "album" viser forsiden album-gitteret.
  const albumParam = searchParams.get('album')
  const photos = photosQuery.data?.photos ?? EMPTY_PHOTOS
  const albums = albumsQuery.data ?? EMPTY_ALBUMS
  useAutoOptimizePendingPhotos()

  const cachedActivePhoto =
    sharedPhotoId !== null
      ? photos.find((photo) => photo.id === sharedPhotoId)
      : undefined
  const sharedPhotoQuery = usePhoto(sharedPhotoId, cachedActivePhoto)
  const activePhoto = cachedActivePhoto ?? sharedPhotoQuery.data ?? null

  // Et delt fotolink uden et albumparameter (ældre links, eller et link delt
  // via "Del link" i lysbordet) bladrer stadig kun inden for sit eget album --
  // udledt af selve billedet, så URL'en ikke behøver at blive omskrevet.
  const navigationAlbumId =
    albumParam ??
    (activePhoto ? (activePhoto.event_id ?? WITHOUT_EVENT_ALBUM) : null)
  const filteredPhotos = useMemo(
    () =>
      navigationAlbumId
        ? filterPhotosByEvent(photos, navigationAlbumId)
        : EMPTY_PHOTOS,
    [navigationAlbumId, photos],
  )
  const currentAlbum = albumParam
    ? (albums.find((album) => album.albumId === albumParam) ?? null)
    : null
  const currentAlbumTitle =
    currentAlbum?.title ??
    (albumParam === WITHOUT_EVENT_ALBUM ? 'Uden begivenhed' : 'Album')

  const commentCountedPhotoIds = albumParam
    ? filteredPhotos.map((photo) => photo.id)
    : EMPTY_IDS
  const commentCountsQuery = usePhotoCommentCounts(commentCountedPhotoIds)

  const activeIndex = activePhoto
    ? filteredPhotos.findIndex((photo) => photo.id === activePhoto.id)
    : -1
  const previousPhoto =
    activeIndex > 0 ? filteredPhotos[activeIndex - 1] : undefined
  const nextPhoto =
    activeIndex >= 0 ? filteredPhotos[activeIndex + 1] : undefined
  const hasNextPage = photosQuery.hasNextPage
  const fetchNextPage = photosQuery.fetchNextPage
  const isFetchingNextPage = photosQuery.isFetchingNextPage
  const positionLabel =
    activeIndex >= 0
      ? `Billede ${activeIndex + 1} af ${filteredPhotos.length}${
          hasNextPage ? '+' : ''
        }`
      : null

  useEffect(() => {
    if (activeIndex < 0) return
    if (activeIndex < filteredPhotos.length - 1 - PREFETCH_MARGIN) return
    if (!hasNextPage || isFetchingNextPage) return
    void fetchNextPage()
  }, [
    activeIndex,
    fetchNextPage,
    filteredPhotos.length,
    hasNextPage,
    isFetchingNextPage,
  ])

  // To separate inputs: det ene uden `capture`, så telefonen viser hele
  // vælgeren; det andet med `capture`, så kameraet åbner direkte.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileButtonRef = useRef<HTMLButtonElement>(null)
  const cameraButtonRef = useRef<HTMLButtonElement>(null)
  const focusFileError = useErrorFocus(fileButtonRef)
  const focusCameraError = useErrorFocus(cameraButtonRef)

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

  // Bladring erstatter historikposten, så Tilbage lukker lightboxen i stedet
  // for at gå ét billede baglæns ad gangen.
  function showPhoto(photo: Photo | undefined) {
    if (!photo) return
    setActionError(null)
    setGalleryParam('photo', photo.id, { replace: true })
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
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-ink-body">Billeder</h1>
        <p className="mt-1 text-ink-subtle">
          Billeder fra klubbens ture og begivenheder, samlet i album.
        </p>
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
            ? 'border-accent-soft bg-surface-sunken'
            : 'border-line bg-surface'
        }`}
      >
        <h2 id="upload-heading" className="text-lg font-semibold text-ink-body">
          Upload billeder
        </h2>

        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Billedtekst (valgfri)
          <input
            id="gallery-upload-caption"
            type="text"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            className="min-h-11 rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        {eventsQuery.data && eventsQuery.data.length > 0 && (
          <label className="flex flex-col gap-1 text-sm text-ink-body">
            Knyt til begivenhed (valgfri)
            <select
              id="gallery-upload-event"
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              className="min-h-11 rounded border border-line-strong bg-surface px-3 py-2 text-base"
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
          <p role="alert" className="text-sm text-danger">
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
            className="min-h-11 rounded-lg bg-accent px-5 py-2 text-white"
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
          <p id="gallery-upload-error" className="text-sm text-danger">
            {formError}
          </p>
        )}

        {upload.items.length > 0 && (
          <div className="mt-1 border-t border-line-soft pt-3">
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
        {upload.isUploading && (
          <p role="status" className="sr-only">
            Billeder uploades
          </p>
        )}
      </section>

      {photosQuery.isLoading && (
        <p role="status" className="py-12 text-center text-ink-muted">
          Henter billeder…
        </p>
      )}

      {photosQuery.isError && (
        <div
          role="alert"
          className="rounded border border-danger-line bg-danger-surface p-4 text-danger-strong"
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
        <p className="rounded bg-surface-sunken p-5 text-ink-muted">
          Ingen billeder endnu — vær den første til at uploade et.
        </p>
      )}

      {photosQuery.isSuccess && photos.length > 0 && !albumParam && (
        <>
          {albumsQuery.isLoading && (
            <p role="status" className="py-12 text-center text-ink-muted">
              Henter album…
            </p>
          )}
          {albumsQuery.isError && (
            <div
              role="alert"
              className="rounded border border-danger-line bg-danger-surface p-4 text-danger-strong"
            >
              Albummene kunne ikke hentes.
              <button
                type="button"
                onClick={() => albumsQuery.refetch()}
                className="ml-2 min-h-11 underline"
              >
                Prøv igen
              </button>
            </div>
          )}
          {albumsQuery.isSuccess && (
            <GalleryAlbumGrid albums={albums} onOpenAlbum={openAlbum} />
          )}
        </>
      )}

      {photosQuery.isSuccess && photos.length > 0 && albumParam && (
        <>
          <div className="mb-4 flex flex-col gap-1">
            <button
              type="button"
              onClick={backToAlbums}
              className="min-h-11 self-start text-sm text-ink-muted underline underline-offset-2"
            >
              ← Alle album
            </button>
            <h2 className="text-xl font-semibold text-ink-body">
              {currentAlbumTitle}
            </h2>
            {currentAlbum && (
              <p className="text-sm text-ink-subtle">
                {currentAlbum.photoCount === 1
                  ? '1 billede'
                  : `${currentAlbum.photoCount} billeder`}
                {currentAlbum.eventDate &&
                  ` · ${formatAlbumDate(currentAlbum.eventDate)}`}
              </p>
            )}
          </div>

          {!photosQuery.hasNextPage && filteredPhotos.length === 0 && (
            <div className="rounded bg-surface-sunken p-5 text-ink-muted">
              <p>Der er ingen billeder i dette album endnu.</p>
              <button
                type="button"
                onClick={backToAlbums}
                className="mt-2 min-h-11 underline"
              >
                Tilbage til album
              </button>
            </div>
          )}

          {filteredPhotos.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {filteredPhotos.map((photo) => (
                <PhotoThumbnail
                  key={photo.id}
                  photo={photo}
                  commentCount={commentCountFor(
                    commentCountsQuery.data,
                    photo.id,
                  )}
                  onClick={() => {
                    setActionError(null)
                    setGalleryParam('photo', photo.id)
                  }}
                />
              ))}
            </div>
          )}

          {photosQuery.hasNextPage && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => void photosQuery.fetchNextPage()}
                disabled={photosQuery.isFetchingNextPage}
                className="min-h-11 rounded-lg border border-accent px-5 py-2 text-ink-body disabled:cursor-wait disabled:opacity-60"
              >
                {photosQuery.isFetchingNextPage
                  ? 'Henter flere billeder…'
                  : 'Hent flere billeder'}
              </button>
            </div>
          )}

          {photosQuery.isFetchNextPageError && (
            <p role="alert" className="mt-3 text-center text-danger">
              Flere billeder kunne ikke hentes. Prøv igen.
            </p>
          )}
        </>
      )}

      {photosQuery.isSuccess &&
        sharedPhotoId &&
        !activePhoto &&
        sharedPhotoQuery.isSuccess && (
          <div
            role="alert"
            className="fixed right-4 bottom-4 z-30 rounded bg-danger-surface p-4 text-danger-strong shadow"
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
          photo={activePhoto}
          onClose={() => setGalleryParam('photo', null)}
          onPrevious={previousPhoto ? () => showPhoto(previousPhoto) : null}
          onNext={nextPhoto ? () => showPhoto(nextPhoto) : null}
          positionLabel={positionLabel}
          loadingNext={activeIndex >= 0 && !nextPhoto && hasNextPage}
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
