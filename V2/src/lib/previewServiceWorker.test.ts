import { describe, expect, it, vi } from 'vitest'
import {
  clearPreviewServiceWorker,
  isPreviewCache,
  isPreviewScopedRegistration,
  isStalePreviewWorker,
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

describe('isStalePreviewWorker', () => {
  it('rammer kun den gamle selvafmeldende worker', () => {
    expect(
      isStalePreviewWorker(
        {
          scope: previewScope,
          scriptURL: 'https://naturklubben.dk/pr-preview/pr-277/sw.js',
        },
        previewScope,
      ),
    ).toBe(true)
    expect(
      isStalePreviewWorker(
        {
          scope: previewScope,
          scriptURL: 'https://naturklubben.dk/pr-preview/pr-277/sw-prod.js',
        },
        previewScope,
      ),
    ).toBe(false)
  })
})

describe('clearPreviewServiceWorker', () => {
  it('afregistrerer den gamle preview-worker og lader push-workeren blive', async () => {
    const unregisterStale = vi.fn(async () => true)
    const unregisterPush = vi.fn(async () => true)
    const unregisterProd = vi.fn(async () => true)
    const deleteCache = vi.fn(async () => true)

    await clearPreviewServiceWorker({
      previewScope,
      registrations: [
        {
          scope: 'https://naturklubben.dk/',
          scriptURL: 'https://naturklubben.dk/sw.js',
          unregister: unregisterProd,
        },
        {
          scope: previewScope,
          scriptURL: 'https://naturklubben.dk/pr-preview/pr-277/sw.js',
          unregister: unregisterStale,
        },
        {
          scope: previewScope,
          scriptURL: 'https://naturklubben.dk/pr-preview/pr-277/sw-prod.js',
          unregister: unregisterPush,
        },
      ],
      cacheNames: [
        'workbox-precache-v2-https://naturklubben.dk/',
        'workbox-precache-v2-https://naturklubben.dk/pr-preview/pr-277/',
      ],
      deleteCache,
    })

    expect(unregisterStale).toHaveBeenCalledOnce()
    expect(unregisterPush).not.toHaveBeenCalled()
    expect(unregisterProd).not.toHaveBeenCalled()
    expect(deleteCache).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledWith(
      'workbox-precache-v2-https://naturklubben.dk/pr-preview/pr-277/',
    )
    expect(isPreviewCache('supabase-storage-images')).toBe(false)
  })
})
