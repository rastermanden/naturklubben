import { useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useRefreshPhoto } from './usePhotos'
import type { Photo } from './types'

export async function requestPhotoDeletion(photoId: string) {
  const { error } = await supabase.functions.invoke('optimize-image', {
    body: { action: 'delete', photoId },
  })
  if (error) throw error
}

export function useDeletePhoto() {
  const refreshPhoto = useRefreshPhoto()

  return useMutation({
    mutationFn: (photo: Photo) => requestPhotoDeletion(photo.id),
    onSettled: (_data, _error, photo) => {
      void refreshPhoto(photo.id).catch((error) =>
        console.warn('Billedets slettestatus kunne ikke genhentes', error),
      )
    },
  })
}
