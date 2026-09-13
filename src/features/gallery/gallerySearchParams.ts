import type { Photo } from './types'

/** Album-id for billeder uden en begivenhed -- eget album på forsiden (#218). */
export const WITHOUT_EVENT_ALBUM = 'without-event'

export function updateGallerySearchParam(
  current: URLSearchParams,
  key: 'album' | 'photo',
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

/** Fjerner både album- og fotoparameteren, fx for at gå "tilbage til album". */
export function clearAlbumSearchParams(current: URLSearchParams) {
  const next = new URLSearchParams(current)
  next.delete('album')
  next.delete('photo')
  return next
}

export function filterPhotosByEvent(
  photos: Photo[],
  eventFilter: string | null,
) {
  if (!eventFilter) return photos
  if (eventFilter === WITHOUT_EVENT_ALBUM) {
    return photos.filter((photo) => photo.event_id === null)
  }
  return photos.filter((photo) => photo.event_id === eventFilter)
}
