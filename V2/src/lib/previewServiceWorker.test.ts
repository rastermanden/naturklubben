import { describe, expect, it, vi } from 'vitest'
import {
  clearPreviewServiceWorker,
  isPreviewCache,
  isPreviewScopedRegistration,
} from './previewServiceWorker'

const previewScope = 'https://naturklubben.dk/pr-preview/pr-277/'

describe('isPreviewScopedRegistration', () => {
  it('rammer kun previewets eget scope', () => {
    expect(isPreviewScopedRegistration(previewScope, previewScope)).toBe(true)
    expect(
      isPreviewScopedRegistration(
        'https://naturklubben.dk/pr-preview/pr-277',
        previewScope,
      ),
    ).toBe(true)
  })

  it('lader produktionens rod-worker være', () => {
    expect(
      isPreviewScopedRegistration('https://naturklubben.dk/', previewScope),
    ).toBe(false)
  })

  it('rører ikke et andet preview', () => {
    expect(
      isPreviewScopedRegistration(
        'https://naturklubben.dk/pr-preview/pr-10/',
        previewScope,
      ),
    ).toBe(false)
  })
})

describe('clearPreviewServiceWorker', () => {
  it('afregistrerer preview-workeren og sletter kun dens caches', async () => {
    const unregisterPreview = vi.fn(async () => true)
    const unregisterProd = vi.fn(async () => true)
    const deleteCache = vi.fn(async () => true)

    await clearPreviewServiceWorker({
      previewScope,
      registrations: [
        { scope: 'https://naturklubben.dk/', unregister: unregisterProd },
        { scope: previewScope, unregister: unregisterPreview },
      ],
      cacheNames: [
        'workbox-precache-v2-https://naturklubben.dk/',
        'workbox-precache-v2-https://naturklubben.dk/pr-preview/pr-277/',
      ],
      deleteCache,
    })

    expect(unregisterPreview).toHaveBeenCalledOnce()
    expect(unregisterProd).not.toHaveBeenCalled()
    expect(deleteCache).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledWith(
      'workbox-precache-v2-https://naturklubben.dk/pr-preview/pr-277/',
    )
    expect(isPreviewCache('supabase-storage-images')).toBe(false)
  })
})
