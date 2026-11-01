import type { Id } from '../../../convex/_generated/dataModel'
import { resizeAvatarFile } from './resizeAvatar'

/**
 * Lægger et profilbillede i Convex' fillager.
 *
 * Browseren skalerer først. Derefter postes blobben til den engangs-URL,
 * mutationen udleverede, og `saveAvatar` gemmer adressen på profilen.
 */
export async function uploadAvatar(input: {
  file: Blob
  generateUploadUrl: () => Promise<{ uploadUrl: string }>
  saveAvatar: (args: {
    storageId: Id<'_storage'>
  }) => Promise<null | { error?: string }>
  post?: (url: string, init: RequestInit) => Promise<Response>
}): Promise<void> {
  const resized = await resizeAvatarFile(input.file)
  const { uploadUrl } = await input.generateUploadUrl()
  const post = input.post ?? fetch
  const response = await post(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': resized.type || 'image/jpeg' },
    body: resized,
  })
  if (!response.ok) {
    throw new Error('AVATAR_UPLOAD_NOT_FOUND')
  }
  const payload = (await response.json()) as { storageId?: unknown }
  if (typeof payload.storageId !== 'string' || payload.storageId.length === 0) {
    throw new Error('AVATAR_UPLOAD_NOT_FOUND')
  }
  const saved = await input.saveAvatar({
    storageId: payload.storageId as Id<'_storage'>,
  })
  if (saved?.error) {
    throw new Error(saved.error)
  }
}
