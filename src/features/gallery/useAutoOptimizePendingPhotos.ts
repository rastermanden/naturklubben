import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/useAuth'
import { pendingPhotosToOptimize } from './optimizationStatus'
import { useInvalidatePhotos } from './usePhotos'
import { requestPhotoOptimization } from './useRetryPhotoOptimization'
import type { Photo } from './types'

/**
 * Hvor mange billeder der sættes i gang pr. gennemløb. Hvert kald starter en
 * Edge Function-kørsel, så en bruger med mange gamle billeder skal ikke fyre
 * dem alle af på én gang. Når gennemløbet er færdigt, hentes listen igen, og
 * de næste tages i næste gennemløb.
 */
export const AUTO_OPTIMIZE_BATCH = 3

/**
 * Starter optimeringen af egne billeder, der er blevet hængende i 'pending'
 * — typisk fordi de blev uploadet, før optimeringsstatus fandtes (#100), eller
 * fordi browseren blev lukket, inden uploadkøen nåede at kalde functionen.
 *
 * Hvert billede forsøges højst én gang pr. session: lykkes claimet, går
 * rækken videre til 'processing' og dermed ud af udvælgelsen; fejler kaldet,
 * holder id'et den alligevel ude, så et vedvarende problem ikke bliver til en
 * løkke af kald.
 */
export function useAutoOptimizePendingPhotos(photos: Photo[]) {
  const { session } = useAuth()
  const userId = session?.user.id
  const invalidatePhotos = useInvalidatePhotos()
  const requestedRef = useRef(new Set<string>())
  const runningRef = useRef(false)

  useEffect(() => {
    if (runningRef.current) return
    const queue = pendingPhotosToOptimize(
      photos,
      userId,
      requestedRef.current,
    ).slice(0, AUTO_OPTIMIZE_BATCH)
    if (queue.length === 0) return

    runningRef.current = true
    void (async () => {
      try {
        for (const photo of queue) {
          requestedRef.current.add(photo.id)
          try {
            await requestPhotoOptimization(photo.id)
          } catch (error) {
            console.warn(
              'Optimeringen af et ventende billede kunne ikke startes',
              error,
            )
          }
        }
      } finally {
        runningRef.current = false
        await invalidatePhotos()
      }
    })()
  }, [invalidatePhotos, photos, userId])
}
