import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'
import { PENDING_OPTIMIZATION_POLL_MS } from './optimizationStatus'
import { useRefreshPhoto } from './usePhotos'
import { requestPhotoOptimization } from './useRetryPhotoOptimization'

export const AUTO_OPTIMIZE_BATCH = 3
const AUTO_OPTIMIZE_SCAN_LIMIT = 30

/**
 * Finder et begrænset udsnit af brugerens gamle pending-rækker uafhængigt af,
 * hvor mange gallerisider der er indlæst. Dermed bevares selvreparationen for
 * ældre uploads uden igen at hente hele galleriet.
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
        .select('id, created_at')
        .eq('uploaded_by', userId as string)
        .eq('optimization_status', 'pending')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(AUTO_OPTIMIZE_SCAN_LIMIT)
      if (error) throw error
      return data as { id: string; created_at: string }[]
    },
    staleTime: 30_000,
  })

  useEffect(() => {
    const now = Date.now()
    const nextEligibleAt = (pendingQuery.data ?? [])
      .filter((photo) => !requestedRef.current.has(photo.id))
      .map(
        (photo) =>
          new Date(photo.created_at).getTime() + PENDING_OPTIMIZATION_POLL_MS,
      )
      .filter((eligibleAt) => eligibleAt > now)
      .sort((left, right) => left - right)[0]
    if (!nextEligibleAt) return

    const timeout = window.setTimeout(() => {
      void pendingQuery.refetch()
    }, nextEligibleAt - now)
    return () => window.clearTimeout(timeout)
  }, [pendingQuery])

  useEffect(() => {
    if (runningRef.current) return
    const oldestAllowed = Date.now() - PENDING_OPTIMIZATION_POLL_MS
    const queue = (pendingQuery.data ?? [])
      .filter(
        (photo) =>
          new Date(photo.created_at).getTime() <= oldestAllowed &&
          !requestedRef.current.has(photo.id),
      )
      .slice(0, AUTO_OPTIMIZE_BATCH)
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
  }, [pendingQuery, refreshPhoto])
}
