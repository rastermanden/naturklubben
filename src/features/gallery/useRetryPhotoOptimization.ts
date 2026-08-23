import { useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useRefreshPhoto } from './usePhotos'

export async function requestPhotoOptimization(photoId: string) {
  const { error } = await supabase.functions.invoke('optimize-image', {
    body: { photoId },
  })
  if (error) throw error
}

export function useRetryPhotoOptimization() {
  const refreshPhoto = useRefreshPhoto()

  return useMutation({
    mutationFn: requestPhotoOptimization,
    onSettled: (_data, _error, photoId) => {
      void refreshPhoto(photoId).catch((error) =>
        console.warn('Billedets optimeringsstatus kunne ikke genhentes', error),
      )
    },
  })
}
