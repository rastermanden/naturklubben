import { describe, expect, it } from 'vitest'
import {
  isMovedResponse,
  movedUrl,
  probeUrl,
  shouldCheckForMove,
} from './siteMove'

describe('shouldCheckForMove', () => {
  it('tjekker kun på den gamle adresse', () => {
    expect(shouldCheckForMove({ hostname: 'rastermanden.github.io' })).toBe(
      true,
    )
    expect(shouldCheckForMove({ hostname: 'naturklubben.dk' })).toBe(false)
    expect(shouldCheckForMove({ hostname: 'localhost' })).toBe(false)
  })
})

describe('probeUrl', () => {
  it('rammer en fil, der findes, med en parameter, som precachen ikke kender', () => {
    expect(probeUrl('/naturklubben/', 123)).toBe(
      '/naturklubben/favicon.svg?flyttet-tjek=123',
    )
  })
})

describe('isMovedResponse', () => {
  it('kun en viderestilling betyder, at appen er flyttet', () => {
    expect(isMovedResponse({ type: 'opaqueredirect' })).toBe(true)
    expect(isMovedResponse({ type: 'basic' })).toBe(false)
    expect(isMovedResponse({ type: 'error' })).toBe(false)
  })
})

describe('movedUrl', () => {
  it('beholder siden, query og fragment', () => {
    expect(
      movedUrl({
        pathname: '/naturklubben/kalender/abc',
        search: '?x=1',
        hash: '#y',
      }),
    ).toBe('https://naturklubben.dk/kalender/abc?x=1#y')
  })

  it('sender forsiden til forsiden', () => {
    expect(movedUrl({ pathname: '/naturklubben/', search: '', hash: '' })).toBe(
      'https://naturklubben.dk/',
    )
  })

  it('sender et PR-preview og fremmede stier til forsiden', () => {
    expect(
      movedUrl({
        pathname: '/naturklubben/pr-preview/pr-12/chat',
        search: '',
        hash: '',
      }),
    ).toBe('https://naturklubben.dk/')
    expect(movedUrl({ pathname: '/andet/', search: '', hash: '' })).toBe(
      'https://naturklubben.dk/',
    )
  })
})
