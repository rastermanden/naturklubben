import type { OptimizationQueueItem, Photo } from './types'

/**
 * Optimeringsstatus som ren logik, uden Convex-kald -- samme opdeling som i
 * den gamle app, hvor `optimizationStatus.ts` kunne testes uden netværk.
 *
 * Tider er tal i millisekunder (`Date.now()`), fordi Convex gemmer dem sådan,
 * ikke ISO-strenge som Postgres gjorde.
 */

/** Samme grænse som `claimOptimization` bruger til at afgøre "forældet". */
export const STALE_OPTIMIZATION_MS = 10 * 60 * 1000

/** Hvor længe en `pending`-række regnes som "uploadkøen er selv i gang". */
export const PENDING_OPTIMIZATION_POLL_MS = 60 * 1000

export function isStaleOptimization(
  photo: Pick<Photo, 'optimizationStatus' | 'optimizationStartedAt'>,
  now = Date.now(),
) {
  if (photo.optimizationStatus !== 'processing') return false
  if (photo.optimizationStartedAt === null) return true
  return photo.optimizationStartedAt <= now - STALE_OPTIMIZATION_MS
}

export function isPendingOptimizationActive(
  photo: Pick<Photo, 'optimizationStatus' | 'createdAt'>,
  now = Date.now(),
) {
  return (
    photo.optimizationStatus === 'pending' &&
    photo.createdAt > now - PENDING_OPTIMIZATION_POLL_MS
  )
}

/**
 * Kun uploaderen selv må starte et genforsøg -- serveren afviser alle andre i
 * `claimOptimization`. Knappen vises derfor kun for egne rækker, der venter
 * eller står fast.
 */
export function canRetryOptimization(
  photo: Pick<
    Photo,
    'isUploader' | 'optimizationStatus' | 'optimizationStartedAt'
  >,
  now = Date.now(),
) {
  return (
    photo.isUploader &&
    (photo.optimizationStatus === 'pending' ||
      photo.optimizationStatus === 'failed' ||
      isStaleOptimization(photo, now))
  )
}

/**
 * Egne billeder, der venter på -- eller sidder fast i -- en optimering, som
 * intet arbejder på lige nu. Spejler `pendingPhotosToOptimize` fra den gamle
 * app: nyligt uploadede `pending`-rækker springes over, så en gentagelse ikke
 * rammer et claim uploadkøen selv er ved at tage, og et `processing`-claim
 * uden fremdrift bliver først et kandidat efter ti minutter.
 */
export function pendingPhotosToOptimize(
  queue: readonly OptimizationQueueItem[],
  alreadyRequested: ReadonlySet<string>,
  now = Date.now(),
) {
  return queue.filter(
    (photo) =>
      !alreadyRequested.has(photo.id) &&
      ((photo.optimizationStatus === 'pending' &&
        !isPendingOptimizationActive(
          { optimizationStatus: photo.optimizationStatus, createdAt: photo.createdAt },
          now,
        )) ||
        isStaleOptimization(photo, now)),
  )
}

export function optimizationStatusLabel(photo: Photo, now = Date.now()) {
  if (isStaleOptimization(photo, now)) return null

  switch (photo.optimizationStatus) {
    case 'pending':
      return 'Venter på optimering'
    case 'processing':
      return 'Optimerer…'
    case 'failed':
      return 'Optimering fejlede'
    case 'ready':
      return null
  }
}
