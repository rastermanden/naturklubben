import { describe, expect, it } from 'vitest'
import { isCachedImageRequest, previewNavigationPattern } from './swCache'

describe('service worker-cache', () => {
  it('cacher Convex-billeder og ikke andre adresser', () => {
    expect(
      isCachedImageRequest(
        new URL('https://savory-possum-345.convex.cloud/api/storage/abc'),
      ),
    ).toBe(true)
    expect(
      isCachedImageRequest(
        new URL('https://quaint-parakeet-652.convex.cloud/api/query'),
      ),
    ).toBe(false)
    expect(
      isCachedImageRequest(
        new URL(
          'https://example.supabase.co/storage/v1/object/public/photos/a.jpg',
        ),
      ),
    ).toBe(false)
  })

  it('holder preview-stier ude af produktionens navigationscache', () => {
    const pattern = previewNavigationPattern('/')
    expect(pattern.test('/pr-preview/pr-277/')).toBe(true)
    expect(pattern.test('/kalender')).toBe(false)
  })
})
