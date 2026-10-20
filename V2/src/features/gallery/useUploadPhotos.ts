import { useCallback, useMemo, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/**
 * Uploadkøen. Porteret fra `src/features/gallery/useUploadPhotos.ts`, men
 * todelt på en ny måde, fordi Convex filstorage ikke tager imod en fil gennem
 * en database-mutation:
 *
 * 1. `gallery.generateUploadUrl` giver en engangs-URL (kun for medlemmer).
 * 2. Klienten `POST`er filen dertil og får et `storageId` tilbage.
 * 3. `gallery.createPhoto` registrerer rækken med det id -- og kontrollerer
 *    først, at filen er et billede og højst 15 MB. Bucket-grænserne fra den
 *    gamle app findes ikke længere, så kontrollen ligger nu i mutationen.
 * 4. `gallery.optimizePhoto` (action) sætter gang i optimeringsstatus'en.
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

export function useUploadPhotos() {
  const generateUploadUrl = useMutation(api.gallery.generateUploadUrl)
  const createPhoto = useMutation(api.gallery.createPhoto)
  const optimizePhoto = useAction(api.gallery.optimizePhoto)
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
        const { uploadUrl } = await generateUploadUrl()
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': item.file.type },
          body: item.file,
        })
        if (!response.ok) {
          throw new Error(`Upload svarede ${response.status}`)
        }
        const { storageId } = (await response.json()) as {
          storageId: Id<'_storage'>
        }

        const photoId = await createPhoto({
          storageId,
          clientUploadId: item.clientUploadId,
          caption: item.caption || undefined,
          eventId: item.eventId ?? undefined,
          eventTitle: item.eventTitle,
        })
        updateItem(item.id, { status: 'saved' })

        // Status sættes i baggrunden: billedet er allerede synligt i galleriet,
        // og et fejlet optimeringsforsøg må ikke gøre et gemt upload til en
        // fejl. Rækken kan prøves igen fra lysbordet.
        void optimizePhoto({ photoId }).catch((error: unknown) => {
          console.warn(
            'Billedet er gemt, men optimeringen kunne ikke startes',
            error,
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
    [createPhoto, generateUploadUrl, optimizePhoto, updateItem],
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
