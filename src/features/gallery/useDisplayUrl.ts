import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import type { Photo } from './types'

/**
 * Returnerer en visbar URL for et billede. Bruger den offentlige, optimerede
 * fil hvis den findes (sat af optimize-image-edge-functionen, #13). Ellers
 * genereres en midlertidig signeret URL til originalen i den private
 * photos-original-bucket, så billedet stadig kan vises mens det "optimerer".
 */
export function useDisplayUrl(
  photo: Photo,
  variant: 'full' | 'thumbnail' = 'thumbnail',
) {
  const optimizedPath =
    variant === 'thumbnail'
      ? (photo.thumbnail_path ?? photo.optimized_path)
      : photo.optimized_path

  const signedUrlQuery = useQuery({
    queryKey: ['photo-signed-url', photo.storage_path],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('photos-original')
        .createSignedUrl(photo.storage_path, 60 * 60)
      if (error) throw error
      return data.signedUrl
    },
    enabled: !optimizedPath,
    staleTime: 50 * 60 * 1000,
  })

  if (optimizedPath) {
    return {
      url: supabase.storage.from('photos-optimized').getPublicUrl(optimizedPath)
        .data.publicUrl,
      isLoading: false,
      error: null,
      refetch: signedUrlQuery.refetch,
    }
  }

  return {
    url: signedUrlQuery.data,
    isLoading: signedUrlQuery.isLoading,
    error: signedUrlQuery.error,
    refetch: signedUrlQuery.refetch,
  }
}
