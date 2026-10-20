/**
 * URL-parametrene i galleriet.
 *
 * "album" står i adressen, så et enkelt album kan deles som link, og "photo"
 * åbner lysbordet på ét billede. Samme to parametre som i den gamle app, så
 * delte links fra den stadig virker, når V2 overtager domænet.
 */

/** Album-id for billeder uden en begivenhed. Skal matche serveren. */
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
