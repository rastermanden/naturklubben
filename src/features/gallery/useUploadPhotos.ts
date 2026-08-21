import { useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'
import { useInvalidatePhotos } from './usePhotos'

const MAX_FILE_SIZE = 15 * 1024 * 1024 // matcher bucket-grænsen sat i #2

export interface UploadPhotoInput {
  files: File[]
  caption: string
  eventId: string | null
}

export function validateFiles(files: File[]): string | null {
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      return `${file.name} er ikke et billede.`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `${file.name} er for stor (maks. 15 MB).`
    }
  }
  return null
}

export function useUploadPhotos() {
  const { session } = useAuth()
  const invalidatePhotos = useInvalidatePhotos()

  return useMutation({
    mutationFn: async ({ files, caption, eventId }: UploadPhotoInput) => {
      if (!session) throw new Error('Ikke logget ind')

      for (const file of files) {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const storagePath = `${session.user.id}/${crypto.randomUUID()}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('photos-original')
          .upload(storagePath, file)
        if (uploadError) throw uploadError

        const { data: photoRow, error: insertError } = await supabase
          .from('photos')
          .insert({
            storage_path: storagePath,
            caption: caption || null,
            event_id: eventId,
            uploaded_by: session.user.id,
          })
          .select('id')
          .single()
        if (insertError) throw insertError

        // Beder optimize-image-functionen (#13) om at generere en web- og
        // thumbnail-version. Functionen findes ikke nødvendigvis endnu --
        // fejler den, forbliver billedet synligt via originalen (se
        // useDisplayUrl), så uploadet blokeres ikke af det.
        supabase.functions
          .invoke('optimize-image', {
            body: { photoId: photoRow.id, storagePath },
          })
          .catch(() => {})
      }
    },
    onSuccess: () => invalidatePhotos(),
  })
}
