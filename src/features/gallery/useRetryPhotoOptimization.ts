import { useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useInvalidatePhotos } from './usePhotos'

export async function requestPhotoOptimization(photoId: string) {
  const { error } = await supabase.functions.invoke('optimize-image', {
    body: { photoId },
  })
  if (error) throw error
}

export function useRetryPhotoOptimization() {
  const invalidatePhotos = useInvalidatePhotos()

  return useMutation({
    mutationFn: requestPhotoOptimization,
    onSettled: () => invalidatePhotos(),
  })
}
