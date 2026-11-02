import { useCallback, useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { PHOTO_MAX_EDGE, THUMB_MAX_EDGE, resizePhotoFile } from './resizePhoto'

/**
 * Uploadkøen. Porteret fra `src/features/gallery/useUploadPhotos.ts`, men
 * todelt på en ny måde, fordi Convex filstorage ikke tager imod en fil gennem
 * en database-mutation:
 *
 * 1. Browseren skalerer til et visningsbillede og en miniature.
 * 2. `gallery.generateUploadUrl` giver en engangs-URL (kun for medlemmer).
 * 3. Klienten `POST`er filerne dertil og får et `storageId` tilbage.
 * 4. `gallery.createPhoto` registrerer rækken. Med en miniature er billedet
 *    klar med det samme; serveren skalerer ikke.
 *
 * Køen er stadig klientens: en fil ad gangen, så et dårligt netværk ikke
 * starter ti parallelle uploads.
 */

/** Matcher `MAX_FILE_SIZE` i `convex/gallery.ts` og den gamle bucket-grænse. */
const MAX_FILE_SIZE = 15 * 1024 * 1024

export interface UploadPhotoInput {
  files: File[]
  caption: string
  /** Begivenheden billedet hører til, hvis kalenderen har sendt et id med. */
  eventId: string | null
  eventTitle?: string
}

export type UploadQueueStatus = 'queued' | 'uploading' | 'saved' | 'failed'

export interface UploadQueueItem {
  id: string
  /** Sendes med til `createPhoto`, så et gentaget forsøg ikke giver to rækker. */
  clientUploadId: string
  file: File
  caption: string
  eventId: string | null
  eventTitle?: string
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

export function createUploadQueueItems({
  files,
  caption,
  eventId,
  eventTitle,
}: UploadPhotoInput): UploadQueueItem[] {
  return files.map((file) => {
    const clientUploadId = crypto.randomUUID()
    return {
      id: clientUploadId,
      clientUploadId,
      file,
      caption,
      eventId,
      eventTitle,
      status: 'queued',
      error: null,
    }
  })
}

async function postImage(
  generateUploadUrl: () => Promise<{ uploadUrl: string }>,
  blob: Blob,
): Promise<Id<'_storage'>> {
  const { uploadUrl } = await generateUploadUrl()
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  })
  if (!response.ok) {
    throw new Error('PHOTO_UPLOAD_NOT_FOUND')
  }
  const payload = (await response.json()) as { storageId?: Id<'_storage'> }
  if (!payload.storageId) throw new Error('PHOTO_UPLOAD_NOT_FOUND')
  return payload.storageId
}

export function useUploadPhotos() {
  const generateUploadUrl = useMutation(api.gallery.generateUploadUrl)
  const createPhoto = useMutation(api.gallery.createPhoto)
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
      updateItem(item.id, { status: 'uploading', error: null })

      try {
        const display = await resizePhotoFile(item.file, PHOTO_MAX_EDGE)
        const thumb = await resizePhotoFile(item.file, THUMB_MAX_EDGE)
        const storageId = await postImage(generateUploadUrl, display.blob)
        const thumbnailStorageId = await postImage(
          generateUploadUrl,
          thumb.blob,
        )

        await createPhoto({
          storageId,
          thumbnailStorageId,
          width: display.width,
          height: display.height,
          clientUploadId: item.clientUploadId,
          caption: item.caption || undefined,
          eventId: item.eventId ?? undefined,
          eventTitle: item.eventTitle,
        })
        updateItem(item.id, { status: 'saved' })
      } catch (caught) {
        console.error('Billedupload fejlede', caught)
        updateItem(item.id, {
          status: 'failed',
          error: 'Upload fejlede. Prøv igen.',
        })
      }
    },
    [createPhoto, generateUploadUrl, updateItem],
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
