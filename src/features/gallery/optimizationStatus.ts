import type { Photo } from './types'

export const STALE_OPTIMIZATION_MS = 10 * 60 * 1000
export const PENDING_OPTIMIZATION_POLL_MS = 60 * 1000

export function isPendingOptimizationActive(
  photo: Pick<Photo, 'optimization_status' | 'created_at'>,
  now = Date.now(),
) {
  return (
    photo.optimization_status === 'pending' &&
    new Date(photo.created_at).getTime() > now - PENDING_OPTIMIZATION_POLL_MS
  )
}

export function isStaleOptimization(
  photo: Pick<Photo, 'optimization_status' | 'optimization_started_at'>,
  now = Date.now(),
) {
  if (photo.optimization_status !== 'processing') return false
  if (!photo.optimization_started_at) return true
  return (
    new Date(photo.optimization_started_at).getTime() <=
    now - STALE_OPTIMIZATION_MS
  )
}

export function canRetryOptimization(photo: Photo, userId: string | undefined) {
  return (
    photo.uploaded_by === userId &&
    (photo.optimization_status === 'pending' ||
      photo.optimization_status === 'failed' ||
      isStaleOptimization(photo))
  )
}

/**
 * Egne billeder, der venter på (eller sidder fast i) en optimering, som intet
 * i øjeblikket arbejder på. To slags rækker tælles med:
 * - `pending`, hvor uploadkøen ikke selv lige har bestilt den (nyligt
 *   uploadede springes over, så en gentagelse ikke rammer et optaget claim).
 * - `processing`, hvis claim er forældet efter samme ti-minutters grænse som
 *   claim_photo_optimization selv bruger til at afgøre det. Dør
 *   optimize-image midt i arbejdet (timeout, hukommelse, flere samtidige
 *   uploads) uden at nå complete_photo_optimization, bliver rækken ellers
 *   stående som "Optimerer…" for evigt, fordi kun ejeren selv kunne trykke
 *   "prøv igen" manuelt (se docs/kodegennemgang-2026-08-23.md, fund #2).
 */
export function pendingPhotosToOptimize(
  photos: readonly Pick<
    Photo,
    | 'id'
    | 'uploaded_by'
    | 'created_at'
    | 'optimization_status'
    | 'optimization_started_at'
  >[],
  userId: string | undefined,
  alreadyRequested: ReadonlySet<string>,
  now = Date.now(),
) {
  if (!userId) return []
  return photos.filter(
    (photo) =>
      photo.uploaded_by === userId &&
      !alreadyRequested.has(photo.id) &&
      ((photo.optimization_status === 'pending' &&
        !isPendingOptimizationActive(photo, now)) ||
        isStaleOptimization(photo, now)),
  )
}

export function optimizationStatusLabel(photo: Photo) {
  if (isStaleOptimization(photo)) return null

  switch (photo.optimization_status) {
    case 'pending':
      return 'Venter på optimering'
    case 'processing':
      return 'Optimerer…'
    case 'failed':
      return 'Optimering fejlede'
    case 'ready':
      return null
    case 'deleting':
      return 'Sletter billede…'
    case 'delete_failed':
      return 'Sletning fejlede'
  }
}
