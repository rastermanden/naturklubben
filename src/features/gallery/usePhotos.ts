import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import type { Photo } from './types'

async function fetchPhotos(): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select(
      'id, storage_path, optimized_path, thumbnail_path, caption, event_id, uploaded_by, created_at',
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export const photosQueryKey = ['photos']

export function usePhotos() {
  return useQuery({ queryKey: photosQueryKey, queryFn: fetchPhotos })
}

export function useInvalidatePhotos() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: photosQueryKey })
}
