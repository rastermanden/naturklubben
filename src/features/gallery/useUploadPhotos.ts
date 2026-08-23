import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'
import { useRefreshPhoto } from './usePhotos'
import { requestPhotoOptimization } from './useRetryPhotoOptimization'

const MAX_FILE_SIZE = 15 * 1024 * 1024 // matcher bucket-grænsen sat i #2

export interface UploadPhotoInput {
  files: File[]
  caption: string
  eventId: string | null
}

export type UploadQueueStatus = 'queued' | 'uploading' | 'saved' | 'failed'

export interface UploadQueueItem {
  id: string
  photoId: string
  storagePath: string
  file: File
  caption: string
  eventId: string | null
  status: UploadQueueStatus
  error: string | null
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

function extensionFor(file: File) {
  const extension = file.name.split('.').pop()
  return extension && /^[a-z0-9]{1,10}$/i.test(extension)
    ? extension.toLowerCase()
    : 'jpg'
}

export function createUploadQueueItems({
  files,
  caption,
  eventId,
}: UploadPhotoInput): UploadQueueItem[] {
  return files.map((file) => {
    const photoId = crypto.randomUUID()
    return {
      id: photoId,
      photoId,
      storagePath: '',
      file,
      caption,
      eventId,
      status: 'queued',
      error: null,
    }
  })
}

export async function uploadQueuedPhoto(item: UploadQueueItem, userId: string) {
  const storagePath =
    item.storagePath || `${userId}/${item.photoId}.${extensionFor(item.file)}`

  const { error: uploadError } = await supabase.storage
    .from('photos-original')
    .upload(storagePath, item.file, {
      contentType: item.file.type,
      upsert: true,
    })
  if (uploadError) throw uploadError

  const { error: rowError } = await supabase.rpc('upsert_photo_upload', {
    p_photo_id: item.photoId,
    p_storage_path: storagePath,
    p_caption: item.caption,
    p_event_id: item.eventId,
  })
  if (rowError) throw rowError

  return storagePath
}

export function useUploadPhotos() {
  const { session } = useAuth()
  const refreshPhoto = useRefreshPhoto()
  const [items, setItems] = useState<UploadQueueItem[]>([])

  const updateItem = useCallback(
    (id: string, update: Partial<UploadQueueItem>) => {
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...update } : item)),
      )
    },
    [],
  )

  const processItem = useCallback(
    async (item: UploadQueueItem) => {
      if (!session) throw new Error('Ikke logget ind')
      const storagePath =
        item.storagePath ||
        `${session.user.id}/${item.photoId}.${extensionFor(item.file)}`
      updateItem(item.id, { status: 'uploading', error: null, storagePath })

      try {
        await uploadQueuedPhoto({ ...item, storagePath }, session.user.id)
        updateItem(item.id, { status: 'saved', storagePath })
        await refreshPhoto(item.photoId).catch((error) =>
          console.warn('Det uploadede billede kunne ikke genhentes', error),
        )

        void requestPhotoOptimization(item.photoId)
          .catch((error) =>
            console.warn(
              'Billedet er gemt, men optimeringen kunne ikke startes',
              error,
            ),
          )
          .finally(() => {
            void refreshPhoto(item.photoId).catch((error) =>
              console.warn(
                'Billedets optimeringsstatus kunne ikke genhentes',
                error,
              ),
            )
          })
      } catch (caught) {
        console.error('Billedupload fejlede', caught)
        updateItem(item.id, {
          status: 'failed',
          error: 'Upload fejlede. Prøv igen.',
        })
      }
    },
    [refreshPhoto, session, updateItem],
  )

  const enqueue = useCallback(
    (input: UploadPhotoInput) => {
      const newItems = createUploadQueueItems(input)
      setItems((current) => [...newItems, ...current])
      void (async () => {
        for (const item of newItems) {
          await processItem(item)
        }
      })()
    },
    [processItem],
  )

  const retry = useCallback(
    (item: UploadQueueItem) => {
      if (item.status !== 'failed') return
      void processItem(item)
    },
    [processItem],
  )

  const clearSaved = useCallback(() => {
    setItems((current) => current.filter((item) => item.status !== 'saved'))
  }, [])

  const isUploading = useMemo(
    () =>
      items.some(
        (item) => item.status === 'queued' || item.status === 'uploading',
      ),
    [items],
  )

  return { items, enqueue, retry, clearSaved, isUploading }
}
