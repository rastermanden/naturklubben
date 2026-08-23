import type { Photo } from './types'

export const WITHOUT_EVENT_FILTER = 'without-event'

export function updateGallerySearchParam(
  current: URLSearchParams,
  key: 'event' | 'photo',
  value: string | null,
) {
  const next = new URLSearchParams(current)
  if (value) {
    next.set(key, value)
  } else {
    next.delete(key)
  }
  return next
}

export function filterPhotosByEvent(
  photos: Photo[],
  eventFilter: string | null,
) {
  if (!eventFilter) return photos
  if (eventFilter === WITHOUT_EVENT_FILTER) {
    return photos.filter((photo) => photo.event_id === null)
  }
  return photos.filter((photo) => photo.event_id === eventFilter)
}
