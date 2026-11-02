import { useEffect, useRef } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { pendingPhotosToOptimize } from './optimizationStatus'

/**
 * Selvheling for billeder, der blev uploadet, men aldrig blev optimeret --
 * fx fordi fanen blev lukket midt i eller functionen døde. Porteret fra
 * `useAutoOptimizePendingPhotos.ts`.
 *
 * Kilden er `gallery.listMyOptimizationQueue`, som kun giver brugerens egne
 * `pending`- og `processing`-rækker. Den gamle app hentede dem fra
 * `photos`-tabellen med et filter; her er det et indeksopslag, og derfor
 * behøver klienten ikke have galleriet indlæst.
 *
 * Højst tre ad gangen: hvert kald er en action, og ti samtidige kald på et
 * dårligt netværk er værre end at tage dem over to runder.
 */
const AUTO_OPTIMIZE_BATCH = 3

export function useAutoOptimizePendingPhotos() {
  const queue = useQuery(api.gallery.listMyOptimizationQueue)
  const optimizePhoto = useAction(api.gallery.optimizePhoto)
  const requestedRef = useRef(new Set<string>())
  const runningRef = useRef(false)

  useEffect(() => {
    if (runningRef.current || queue === undefined) return

    const batch = pendingPhotosToOptimize(queue, requestedRef.current).slice(
      0,
      AUTO_OPTIMIZE_BATCH,
    )
    if (batch.length === 0) return

    runningRef.current = true
    void (async () => {
      try {
        for (const photo of batch) {
          requestedRef.current.add(photo.id)
          try {
            await optimizePhoto({ photoId: photo.id as Id<'photos'> })
          } catch (error) {
            console.warn(
              'Optimeringen af et ventende billede kunne ikke startes',
              error,
            )
          }
        }
      } finally {
        runningRef.current = false
      }
    })()
  }, [optimizePhoto, queue])
}
