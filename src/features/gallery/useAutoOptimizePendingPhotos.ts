import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'
import {
  pendingPhotosToOptimize,
  PENDING_OPTIMIZATION_POLL_MS,
  STALE_OPTIMIZATION_MS,
} from './optimizationStatus'
import { useRefreshPhoto } from './usePhotos'
import { requestPhotoOptimization } from './useRetryPhotoOptimization'
import type { Photo } from './types'

export const AUTO_OPTIMIZE_BATCH = 3
const AUTO_OPTIMIZE_SCAN_LIMIT = 30

interface ScannedPhoto {
  id: string
  created_at: string
  uploaded_by: string
  optimization_status: Photo['optimization_status']
  optimization_started_at: string | null
}

/**
 * Hvornår rækken selv bliver et kandidat for auto-heleren. `null` betyder, at
 * den enten allerede er det (et forældet processing-claim uden starttidspunkt)
 * eller aldrig bliver det af sig selv (klar/fejlet/osv.).
 */
function eligibleAt(photo: ScannedPhoto): number | null {
  if (photo.optimization_status === 'pending') {
    return new Date(photo.created_at).getTime() + PENDING_OPTIMIZATION_POLL_MS
  }
  if (
    photo.optimization_status === 'processing' &&
    photo.optimization_started_at
  ) {
    return (
      new Date(photo.optimization_started_at).getTime() + STALE_OPTIMIZATION_MS
    )
  }
  return null
}

/**
 * Finder et begrænset udsnit af brugerens gamle pending- og fastlåste
 * processing-rækker uafhængigt af, hvor mange gallerisider der er indlæst.
 * Dermed bevares selvreparationen for ældre uploads uden igen at hente hele
 * galleriet.
 */
export function useAutoOptimizePendingPhotos() {
  const { session } = useAuth()
  const userId = session?.user.id
  const refreshPhoto = useRefreshPhoto()
  const requestedRef = useRef(new Set<string>())
  const runningRef = useRef(false)
  const pendingQuery = useQuery({
    queryKey: ['pending-photos-to-optimize', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('photos')
        .select(
          'id, created_at, uploaded_by, optimization_status, optimization_started_at',
        )
        .eq('uploaded_by', userId as string)
        .in('optimization_status', ['pending', 'processing'])
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(AUTO_OPTIMIZE_SCAN_LIMIT)
      if (error) throw error
      return data as ScannedPhoto[]
    },
    staleTime: 30_000,
  })

  useEffect(() => {
    const now = Date.now()
    const nextEligibleAt = (pendingQuery.data ?? [])
      .filter((photo) => !requestedRef.current.has(photo.id))
      .map(eligibleAt)
      .filter((at): at is number => at !== null && at > now)
      .sort((left, right) => left - right)[0]
    if (!nextEligibleAt) return

    const timeout = window.setTimeout(() => {
      void pendingQuery.refetch()
    }, nextEligibleAt - now)
    return () => window.clearTimeout(timeout)
  }, [pendingQuery])

  useEffect(() => {
    if (runningRef.current) return
    const queue = pendingPhotosToOptimize(
      pendingQuery.data ?? [],
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
        await Promise.all(
          queue.map((photo) =>
            refreshPhoto(photo.id).catch((error) =>
              console.warn(
                'Billedets optimeringsstatus kunne ikke genhentes',
                error,
              ),
            ),
          ),
        )
        await pendingQuery.refetch()
      }
    })()
  }, [pendingQuery, refreshPhoto, userId])
}
