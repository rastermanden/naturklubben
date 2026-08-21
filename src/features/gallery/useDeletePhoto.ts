import { useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useInvalidatePhotos } from './usePhotos'
import type { Photo } from './types'

export function useDeletePhoto() {
  const invalidatePhotos = useInvalidatePhotos()

  return useMutation({
    mutationFn: async (photo: Photo) => {
      await supabase.storage
        .from('photos-original')
        .remove([photo.storage_path])

      const optimizedPaths = [
        photo.optimized_path,
        photo.thumbnail_path,
      ].filter((path): path is string => Boolean(path))
      if (optimizedPaths.length > 0) {
        await supabase.storage.from('photos-optimized').remove(optimizedPaths)
      }

      const { error } = await supabase
        .from('photos')
        .delete()
        .eq('id', photo.id)
      if (error) throw error
    },
    onSuccess: () => invalidatePhotos(),
  })
}
