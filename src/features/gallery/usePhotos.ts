import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import {
  isPendingOptimizationActive,
  isStaleOptimization,
  STALE_OPTIMIZATION_MS,
} from './optimizationStatus'
import type { Photo } from './types'

async function fetchPhotos(): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select(
      'id, storage_path, optimized_path, thumbnail_path, caption, event_id, event:events(id, title), uploaded_by, created_at, optimization_status, optimization_attempts, optimization_started_at, optimization_completed_at, optimization_error',
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  // Uden genererede databasetyper ved klienten ikke, at event_id peger fra
  // photos til events (til-én), og typer embeddet som et array. PostgREST
  // returnerer det som et enkelt objekt (eller null) ved kørsel.
  return data as unknown as Photo[]
}

export const photosQueryKey = ['photos']

export function usePhotos() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: photosQueryKey,
    queryFn: fetchPhotos,
    refetchInterval: (currentQuery) =>
      currentQuery.state.data?.some(
        (photo) =>
          isPendingOptimizationActive(photo) ||
          (photo.optimization_status === 'processing' &&
            !isStaleOptimization(photo)),
      )
        ? 3000
        : false,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  })

  useEffect(() => {
    const channel = supabase
      .channel('photos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos' },
        () => {
          void queryClient.invalidateQueries({ queryKey: photosQueryKey })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  return query
}

export function useInvalidatePhotos() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: photosQueryKey })
}

export { STALE_OPTIMIZATION_MS }
