/**
 * Formerne, klienten arbejder med.
 *
 * De er skrevet i hånden og ikke udledt af `api.gallery.*`, fordi de skal
 * kunne læses uden de genererede Convex-typer. Ændrer en query sit svar, skal
 * interfacet her rettes med.
 */
export type OptimizationStatus = 'pending' | 'processing' | 'ready' | 'failed'

/** Et billede som `gallery.listPhotos` og `gallery.getPhoto` giver det. */
export interface Photo {
  id: string
  caption: string | null
  eventId: string | null
  albumKey: string
  uploaderId: string
  createdAt: number
  width: number | null
  height: number | null
  optimizationStatus: OptimizationStatus
  optimizationAttempts: number
  optimizationStartedAt: number | null
  optimizationError: string | null
  commentCount: number
  /** Sat af serveren: ejer eller admin. */
  canDelete: boolean
  /** Sat af serveren: er den indloggede bruger uploader. */
  isUploader: boolean
  displayUrl: string | null
  thumbnailUrl: string | null
}

/** Et album som `gallery.listAlbums` giver det. */
export interface GalleryAlbum {
  albumId: string
  eventId: string | null
  title: string
  photoCount: number
  latestPhotoAt: number | null
  coverPhotoId: string | null
  coverUrl: string | null
}

/** En kommentar som `gallery.listComments` giver den. */
export interface PhotoComment {
  id: string
  photoId: string
  authorId: string
  authorName: string
  body: string
  createdAt: number
  /** Sat af serveren: forfatteren selv eller en admin. */
  canDelete: boolean
}

/** Én række fra `gallery.listMyOptimizationQueue`. */
export interface OptimizationQueueItem {
  id: string
  createdAt: number
  optimizationStatus: OptimizationStatus
  optimizationStartedAt: number | null
}
