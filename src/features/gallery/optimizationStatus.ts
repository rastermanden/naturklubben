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

export function optimizationStatusLabel(photo: Photo) {
  if (isStaleOptimization(photo)) return 'Optimering stoppet'

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
