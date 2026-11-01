import { describe, expect, it } from 'vitest'
import { computeSpaFallback, restoredSpaPath } from './spaRedirect'

const preview = '/pr-preview/pr-277/'

describe('computeSpaFallback', () => {
  it('sender en preview-sti fra produktionens 404 ind i previewet', () => {
    expect(computeSpaFallback('/', '/pr-preview/pr-277/login', '', '')).toBe(
      `${preview}?spa-path=login`,
    )
    expect(
      computeSpaFallback('/', '/pr-preview/pr-277/aktiviteter', '', ''),
    ).toBe(`${preview}?spa-path=aktiviteter`)
    expect(
      computeSpaFallback('/', '/pr-preview/pr-277/kalender/offentlig', '', ''),
    ).toBe(`${preview}?spa-path=${encodeURIComponent('kalender/offentlig')}`)
  })

  it('pakker en dyb sti under previewets egen base', () => {
    expect(
      computeSpaFallback(
        preview,
        '/pr-preview/pr-277/kalender/offentlig',
        '',
        '',
      ),
    ).toBe(`${preview}?spa-path=${encodeURIComponent('kalender/offentlig')}`)
  })

  it('lader en manglende fil være', () => {
    expect(
      computeSpaFallback(preview, '/pr-preview/pr-277/assets/app.js', '', ''),
    ).toBeNull()
  })
})

describe('restoredSpaPath', () => {
  it('skriver spa-path tilbage under preview-basen', () => {
    expect(
      restoredSpaPath(
        preview,
        'https://naturklubben.dk/pr-preview/pr-277/?spa-path=login',
      ),
    ).toBe('/pr-preview/pr-277/login')
    expect(
      restoredSpaPath(
        preview,
        'https://naturklubben.dk/pr-preview/pr-277/?spa-path=kalender%2Foffentlig',
      ),
    ).toBe('/pr-preview/pr-277/kalender/offentlig')
    expect(
      restoredSpaPath(
        preview,
        'https://naturklubben.dk/pr-preview/pr-277/?spa-path=aktiviteter',
      ),
    ).toBe('/pr-preview/pr-277/aktiviteter')
  })
})
