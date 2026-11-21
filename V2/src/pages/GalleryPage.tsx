import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useAction,
  useMutation,
  useQuery,
  usePaginatedQuery,
} from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { useAutoOptimizePendingPhotos } from '../features/gallery/useAutoOptimizePendingPhotos'
import {
  useUploadPhotos,
  type UploadQueueItem,
} from '../features/gallery/useUploadPhotos'
import {
  useVideoCompression,
  type VideoCompressionJob,
} from '../features/gallery/useVideoCompression'
import {
  GALLERY_ACCEPT,
  isOversizeGalleryVideo,
  validateGalleryFile,
} from '../features/gallery/galleryMedia'
import { EventPicker } from '../features/gallery/EventPicker'
import { BulkMoveBar } from '../features/gallery/BulkMoveBar'
import { GalleryAlbumGrid } from '../features/gallery/GalleryAlbumGrid'
import { PhotoThumbnail } from '../features/gallery/PhotoThumbnail'
import { PhotoLightbox } from '../features/gallery/PhotoLightbox'
import { galleryErrorMessage } from '../features/gallery/galleryErrors'
import {
  WITHOUT_EVENT_ALBUM,
  clearAlbumSearchParams,
  updateGallerySearchParam,
} from '../features/gallery/gallerySearchParams'
import type { GalleryAlbum, Photo } from '../features/gallery/types'
import { AppErrorBoundary } from '../components/AppErrorBoundary'

/**
 * Gallerisiden. Porteret fra `src/pages/GalleryPage.tsx`.
 *
 * Siden er blevet enklere, fordi Convex-abonnementet erstatter både
 * React Query og Realtime-kanalerne: `usePaginatedQuery` og `useQuery` holder
 * selv gitteret, albummene og kommentarerne opdaterede, når en mutation gemmer.
 *
 * Én ting er *ikke* porteret: den delte `useErrorFocus`-hook og
 * `useDialogFocus`. Fokus sættes her med en ref, og lysbordet lukker med
 * Escape.
 *
 * Vælgeren "knyt til begivenhed" findes nu igen (#332), som `EventPicker` ved
 * siden af. Den ventede på, at `events` kom med kalender-slicen.
 */

const PHOTO_PAGE_SIZE = 40
const BULK_MOVE_CHUNK_SIZE = 100

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

function compressionStatus(job: VideoCompressionJob) {
  switch (job.status) {
    case 'queued':
      return 'Venter på komprimering'
    case 'preparing':
      return 'Gør klar til komprimering…'
    case 'compressing':
      return job.progress !== null
        ? `Komprimerer video… ${Math.round(job.progress * 100)} %`
        : 'Komprimerer video…'
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

  const updatePhoto = useMutation(api.gallery.updatePhoto)
  const movePhotos = useMutation(api.gallery.movePhotos)
  const deletePhoto = useMutation(api.gallery.deletePhoto)
  const revokePhotoLink = useMutation(api.gallery.revokePhotoLink)
  const mintPhotoTokens = useMutation(api.gallery.mintPhotoTokens)
  const optimizePhoto = useAction(api.gallery.optimizePhoto)
  const upload = useUploadPhotos()
  useAutoOptimizePendingPhotos()

  const [caption, setCaption] = useState('')
  /**
   * Medlemmets eget valg i "Knyt til begivenhed", eller `null`, når feltet
   * ikke er rørt. `null` frem for `''`, så albummets egen begivenhed kan være
   * forvalgt, uden at et aktivt "Ingen" bliver overskrevet af den.
   *
   * Valget nulstilles, når man skifter album: ellers ville et billede uploadet
   * inde i album B kunne havne i album A, fordi feltet blev rørt dér -- og et
   * "Ingen" valgt i et album ville også gælde næste gang, man kom ind i det,
   * hvor forvalget skal være albummets egen begivenhed igen.
   */
  const [eventChoice, setEventChoice] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [formErrorSeq, setFormErrorSeq] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null)
  const [retryingPhotoId, setRetryingPhotoId] = useState<string | null>(null)
  const [revokingPhotoId, setRevokingPhotoId] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [bulkEventId, setBulkEventId] = useState('')
  const [movingPhotos, setMovingPhotos] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkNotice, setBulkNotice] = useState<string | null>(null)
  const mintedTokens = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const formErrorRef = useRef<HTMLParagraphElement>(null)
  const uploadQueueRef = useRef<HTMLUListElement>(null)
  const seenFailedUploadIdsRef = useRef<Set<string>>(new Set())
  const bulkToggleButtonRef = useRef<HTMLButtonElement>(null)
  const bulkBarRef = useRef<HTMLDivElement>(null)
  const bulkNoticeRef = useRef<HTMLParagraphElement>(null)
  const prevSelectingAlbumRef = useRef<string | null>(null)

  const reportFormError = useCallback((message: string) => {
    setFormError(message)
    setFormErrorSeq((seq) => seq + 1)
  }, [])

  const enqueueUpload = upload.enqueue
  const videoCompression = useVideoCompression({
    onCompressed: useCallback(
      ({ file, caption: jobCaption, eventId }) => {
        enqueueUpload({
          files: [file],
          caption: jobCaption,
          eventId,
        })
      },
      [enqueueUpload],
    ),
    onError: reportFormError,
  })

  useLayoutEffect(() => {
    if (!formError) return
    formErrorRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'center',
    })
    formErrorRef.current?.focus?.({ preventScroll: true })
  }, [formError, formErrorSeq])

  useEffect(() => {
    const seen = seenFailedUploadIdsRef.current
    let hasNewFailure = false
    for (const item of upload.items) {
      if (item.status === 'failed' && !seen.has(item.id)) {
        seen.add(item.id)
        hasNewFailure = true
      }
    }
    if (hasNewFailure) {
      uploadQueueRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [upload.items])

  const photos: Photo[] = photosQuery.results
  const editablePhotos = photos.filter((photo) => photo.canEdit)
  const editableIdSet = new Set(editablePhotos.map((photo) => photo.id))
  const activeSelectedIds = selectedPhotoIds.filter((id) =>
    editableIdSet.has(id),
  )
  const canBulkMove =
    albumParam === WITHOUT_EVENT_ALBUM && editablePhotos.length > 0

  useEffect(() => {
    if (mintedTokens.current) return
    if (!photos.some((photo) => photo.displayUrl === null)) return
    mintedTokens.current = true
    void mintPhotoTokens({})
  }, [mintPhotoTokens, photos])
  const activePhoto =
    photoParam === null
      ? null
      : (photos.find((photo) => photo.id === photoParam) ?? sharedPhoto ?? null)
  const activeIndex = activePhoto
    ? photos.findIndex((photo) => photo.id === activePhoto.id)
    : -1
  const previousPhoto = activeIndex > 0 ? photos[activeIndex - 1] : undefined
  const nextPhoto = activeIndex >= 0 ? photos[activeIndex + 1] : undefined
  const currentAlbum = !albumParam
    ? null
    : albums === undefined
      ? undefined
      : (albums.find((album) => album.albumId === albumParam) ?? null)
  const activePhotoAlbumTitle = activePhoto
    ? (albums?.find((album) => album.albumId === activePhoto.albumKey)?.title ??
      null)
    : null

  // Står man inde i et begivenhedsalbum, er den begivenhed forvalgt -- det var
  // uploadens opførsel, før feltet fandtes, og den skal ikke blive dårligere.
  const selectedEventId = eventChoice ?? currentAlbum?.eventId ?? ''

  // eslint-disable-next-line react-hooks/exhaustive-deps -- albumParam er
  // hele pointen: valget og masseflytning hører til det album, de blev brugt i.
  useEffect(() => {
    setEventChoice(null)
    setSelecting(false)
    setSelectedPhotoIds([])
    setBulkEventId('')
    setBulkError(null)
    setBulkNotice(null)
  }, [albumParam])

  useEffect(() => {
    if (selecting && albumParam === WITHOUT_EVENT_ALBUM) {
      prevSelectingAlbumRef.current = albumParam
      bulkBarRef.current?.focus()
      return
    }
    if (
      !selecting &&
      prevSelectingAlbumRef.current !== null &&
      prevSelectingAlbumRef.current === albumParam
    ) {
      prevSelectingAlbumRef.current = null
      if (bulkToggleButtonRef.current) {
        bulkToggleButtonRef.current.focus()
      } else {
        bulkNoticeRef.current?.focus()
      }
      return
    }
    prevSelectingAlbumRef.current = null
  }, [selecting, albumParam])

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
    const oversizeVideos: File[] = []
    const directFiles: File[] = []
    const errors: string[] = []

    for (const file of fileArray) {
      if (isOversizeGalleryVideo(file)) {
        oversizeVideos.push(file)
        continue
      }
      const error = validateGalleryFile(file)
      if (error !== null) {
        errors.push(error)
      } else {
        directFiles.push(file)
      }
    }

    if (errors.length > 0) {
      reportFormError(errors.join(' '))
    } else {
      setFormError(null)
    }

    const currentEventId = selectedEventId === '' ? null : selectedEventId
    if (directFiles.length > 0) {
      upload.enqueue({
        files: directFiles,
        caption,
        eventId: currentEventId,
      })
    }
    if (oversizeVideos.length > 0) {
      videoCompression.enqueueVideos({
        files: oversizeVideos,
        caption,
        eventId: currentEventId,
      })
    }
    if (directFiles.length > 0 || oversizeVideos.length > 0) {
      setCaption('')
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (videoInputRef.current) videoInputRef.current.value = ''
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
        setActionError(
          photo.mediaKind === 'video'
            ? 'Videoen kunne ikke slettes. Prøv igen.'
            : 'Billedet kunne ikke slettes. Prøv igen.',
        ),
      )
      .finally(() => setBusyPhotoId(null))
  }

  function retryOptimization(photo: Photo) {
    setActionError(null)
    setRetryingPhotoId(photo.id)
    void optimizePhoto({ photoId: photo.id as Id<'photos'> })
      .catch(() =>
        setActionError('Optimeringen kunne ikke startes. Prøv igen.'),
      )
      .finally(() => setRetryingPhotoId(null))
  }

  async function editPhoto(
    photo: Photo,
    changes: { caption: string | null; eventId: string | null },
  ) {
    setActionError(null)
    await updatePhoto({
      photoId: photo.id as Id<'photos'>,
      caption: changes.caption,
      eventId: changes.eventId,
    })
  }

  function togglePhotoSelection(photo: Photo) {
    if (!photo.canEdit || movingPhotos) return
    setBulkError(null)
    setSelectedPhotoIds((current) =>
      current.includes(photo.id)
        ? current.filter((id) => id !== photo.id)
        : [...current, photo.id],
    )
  }

  async function handleBulkMove() {
    if (activeSelectedIds.length === 0 || bulkEventId === '' || movingPhotos) {
      return
    }
    setBulkError(null)
    setBulkNotice(null)
    setMovingPhotos(true)
    let totalMoved = 0
    const movedIds = new Set<string>()
    try {
      for (
        let offset = 0;
        offset < activeSelectedIds.length;
        offset += BULK_MOVE_CHUNK_SIZE
      ) {
        const chunk = activeSelectedIds.slice(
          offset,
          offset + BULK_MOVE_CHUNK_SIZE,
        )
        const result = await movePhotos({
          photoIds: chunk as Id<'photos'>[],
          eventId: bulkEventId,
        })
        totalMoved += result.movedCount
        for (const id of chunk) movedIds.add(id)
      }
      setSelecting(false)
      setSelectedPhotoIds([])
      setBulkEventId('')
      setBulkNotice(
        totalMoved === 1
          ? '1 billede blev flyttet.'
          : `${totalMoved} billeder blev flyttet.`,
      )
    } catch (error) {
      if (movedIds.size > 0) {
        setSelectedPhotoIds((current) =>
          current.filter((id) => !movedIds.has(id)),
        )
      }
      const baseError = galleryErrorMessage(
        error,
        'Billederne kunne ikke flyttes. Prøv igen.',
      )
      setBulkError(
        totalMoved > 0
          ? `${totalMoved} billeder blev flyttet, før fejlen opstod. ${baseError}`
          : baseError,
      )
    } finally {
      setMovingPhotos(false)
    }
  }

  const positionLabel =
    activeIndex >= 0
      ? `${activePhoto?.mediaKind === 'video' ? 'Video' : 'Billede'} ${
          activeIndex + 1
        } af ${photos.length}${photosQuery.status === 'CanLoadMore' ? '+' : ''}`
      : null

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Billeder</h1>
        <p className="mt-1 text-ink-muted">
          Billeder og videoer fra klubbens ture og begivenheder, samlet i album.
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
        <h2 className="text-lg font-semibold text-ink">
          Upload billeder og videoer
        </h2>

        <label className="flex flex-col gap-1 text-sm text-ink-body">
          Billedtekst (valgfri)
          <input
            type="text"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            className="min-h-11 rounded border border-line-strong px-3 py-2 text-base"
          />
        </label>

        <AppErrorBoundary
          fallback={(retry) => (
            <p role="alert" className="text-sm text-danger">
              {currentAlbum?.eventId
                ? `Listen over begivenheder kunne ikke hentes. Du kan stadig uploade — filerne lander i ”${currentAlbum.title}”.`
                : 'Listen over begivenheder kunne ikke hentes. Du kan stadig uploade uden at vælge en begivenhed.'}{' '}
              <button
                type="button"
                onClick={retry}
                className="min-h-11 underline"
              >
                Prøv igen
              </button>
            </p>
          )}
        >
          <EventPicker
            value={selectedEventId}
            valueTitle={currentAlbum?.title}
            onChange={setEventChoice}
          />
        </AppErrorBoundary>

        <input
          ref={fileInputRef}
          type="file"
          aria-label="Vælg billeder og videoer fra enheden"
          accept={GALLERY_ACCEPT}
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
        <input
          ref={videoInputRef}
          type="file"
          aria-label="Optag en video med kameraet"
          accept="video/*"
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
            Vælg billeder eller video
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="min-h-11 rounded-lg border border-accent px-5 py-2 text-ink-body"
          >
            Tag billede
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="min-h-11 rounded-lg border border-accent px-5 py-2 text-ink-body"
          >
            Optag video
          </button>
        </div>

        <p className="text-xs text-ink-subtle">
          Billeder må højst være 15 MB. Videoer i mp4, webm eller mov over 50 MB
          komprimeres automatisk før upload. Du kan også trække filer herind.
        </p>

        {formError && (
          <p
            ref={formErrorRef}
            tabIndex={-1}
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger-strong"
          >
            {formError}
          </p>
        )}

        {videoCompression.jobs.length > 0 && (
          <div className="border-t border-line-soft pt-3">
            <h3 className="mb-2 font-medium text-ink-body">
              Komprimerer video
            </h3>
            <ul className="grid gap-2" aria-live="polite">
              {videoCompression.jobs.map((job) => {
                const percent =
                  job.progress !== null ? Math.round(job.progress * 100) : null
                return (
                  <li
                    key={job.id}
                    className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded bg-surface-sunken px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate font-medium text-ink">
                        {job.file.name}
                      </span>
                      <span className="block text-ink-subtle">
                        {compressionStatus(job)}
                      </span>
                      <div
                        role="progressbar"
                        aria-label={`Komprimering af ${job.file.name}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent ?? undefined}
                        className="h-2 w-full overflow-hidden rounded-full bg-line-soft"
                      >
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-200"
                          style={{ width: `${percent ?? 15}%` }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Annullér komprimering af ${job.file.name}`}
                      onClick={() => videoCompression.cancelJob(job.id)}
                      className="min-h-11 rounded border border-line-strong px-3 py-2 text-ink-body"
                    >
                      Annullér
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
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
            <ul ref={uploadQueueRef} className="grid gap-2" aria-live="polite">
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
                      role={item.status === 'failed' ? 'alert' : undefined}
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

      {!albumParam &&
        photosQuery.status !== 'LoadingFirstPage' &&
        photos.length === 0 && (
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

      {albumParam && (
        <div>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={backToAlbums}
                className="min-h-11 self-start text-sm text-ink-muted underline underline-offset-2"
              >
                ← Alle album
              </button>
              <h2 className="text-xl font-semibold text-ink">
                {currentAlbum?.title ??
                  (albumParam === WITHOUT_EVENT_ALBUM
                    ? 'Uden begivenhed'
                    : 'Album')}
              </h2>
              {currentAlbum !== undefined &&
                (currentAlbum !== null || photos.length > 0) && (
                  <p className="text-sm text-ink-subtle">
                    {currentAlbum === null
                      ? 'Albummet findes ikke længere. Viser det, der ligger i det.'
                      : `${currentAlbum.photoCount === 1 ? '1 billede' : `${currentAlbum.photoCount} billeder`}${
                          albumDateLabel(currentAlbum)
                            ? ` · senest ${albumDateLabel(currentAlbum)}`
                            : ''
                        }`}
                  </p>
                )}
            </div>

            {canBulkMove && !selecting && (
              <button
                ref={bulkToggleButtonRef}
                type="button"
                onClick={() => {
                  setBulkNotice(null)
                  setBulkError(null)
                  setSelectedPhotoIds([])
                  setBulkEventId('')
                  setSelecting(true)
                }}
                className="min-h-11 rounded-lg border border-accent px-4 py-2 text-sm font-medium text-ink-body"
              >
                Flyt flere billeder
              </button>
            )}
          </div>

          {bulkNotice && (
            <p
              ref={bulkNoticeRef}
              tabIndex={-1}
              role="status"
              aria-live="polite"
              className="mb-4 rounded bg-surface-raised px-4 py-3 text-sm text-ink-body"
            >
              {bulkNotice}
            </p>
          )}

          {selecting && albumParam === WITHOUT_EVENT_ALBUM && (
            <BulkMoveBar
              containerRef={bulkBarRef}
              selectedCount={activeSelectedIds.length}
              totalSelectableCount={editablePhotos.length}
              hasMore={photosQuery.status === 'CanLoadMore'}
              loadedCount={photos.length}
              totalAlbumCount={currentAlbum?.photoCount ?? null}
              eventId={bulkEventId}
              moving={movingPhotos}
              error={bulkError}
              onEventChange={setBulkEventId}
              onSelectAll={() =>
                setSelectedPhotoIds(editablePhotos.map((photo) => photo.id))
              }
              onClearSelection={() => setSelectedPhotoIds([])}
              onCancel={() => {
                setSelecting(false)
                setSelectedPhotoIds([])
                setBulkEventId('')
                setBulkError(null)
              }}
              onSubmit={() => void handleBulkMove()}
            />
          )}

          {photosQuery.status !== 'LoadingFirstPage' && photos.length === 0 ? (
            <p className="rounded bg-surface-sunken p-5 text-ink-muted">
              Ingen billeder i dette album.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((photo) => (
                <PhotoThumbnail
                  key={photo.id}
                  photo={photo}
                  selection={
                    selecting && albumParam === WITHOUT_EVENT_ALBUM
                      ? {
                          selected: activeSelectedIds.includes(photo.id),
                          disabled: !photo.canEdit || movingPhotos,
                          disabledReason: !photo.canEdit ? 'not-owner' : 'busy',
                        }
                      : undefined
                  }
                  onClick={() => {
                    if (selecting && albumParam === WITHOUT_EVENT_ALBUM) {
                      togglePhotoSelection(photo)
                      return
                    }
                    setActionError(null)
                    setGalleryParam('photo', photo.id)
                  }}
                />
              ))}
            </div>
          )}

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
          albumTitle={activePhotoAlbumTitle}
          onClose={() => setGalleryParam('photo', null)}
          onEdit={editPhoto}
          onPrevious={previousPhoto ? () => showPhoto(previousPhoto) : null}
          onNext={nextPhoto ? () => showPhoto(nextPhoto) : null}
          positionLabel={positionLabel}
          deleting={busyPhotoId === activePhoto.id}
          onDelete={removePhoto}
          revoking={revokingPhotoId === activePhoto.id}
          onRevoke={(photo) => {
            setActionError(null)
            setRevokingPhotoId(photo.id)
            void revokePhotoLink({ photoId: photo.id as Id<'photos'> })
              .catch(() =>
                setActionError('Linket kunne ikke trækkes tilbage. Prøv igen.'),
              )
              .finally(() => setRevokingPhotoId(null))
          }}
          retrying={retryingPhotoId === activePhoto.id}
          onRetryOptimization={retryOptimization}
          actionError={actionError}
        />
      )}
    </section>
  )
}

export default GalleryPage
