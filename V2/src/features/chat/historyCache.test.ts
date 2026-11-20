// Ren logik for den lokale beskedhistorik, testet uden IndexedDB, uden netværk
// og uden `navigator` -- det er hele pointen med at lægge den i historyCache.ts.
import { describe, expect, it } from 'vitest'
import {
  historyCacheKey,
  resolveHistory,
  type CachedHistory,
} from './historyCache'
import type { MessageView } from './types'

function message(id: string, createdAt: number): MessageView {
  return { messageId: id, createdAt } as unknown as MessageView
}

function cached(
  messages: MessageView[],
  overrides: Partial<CachedHistory> = {},
): CachedHistory {
  return {
    key: 'member-1:general',
    room: 'general',
    messages,
    hasMore: false,
    updatedAt: 0,
    ...overrides,
  }
}

describe('historyCacheKey', () => {
  it('adskiller brugere og rum, så to medlemmer ikke deler cache', () => {
    expect(historyCacheKey('member-1', 'general')).toBe('member-1:general')
    expect(historyCacheKey('member-2', 'general')).toBe('member-2:general')
    expect(historyCacheKey('member-1', 'admin')).toBe('member-1:admin')
  })
})

describe('resolveHistory uden cache', () => {
  it('viser intet endnu, mens den første side hentes', () => {
    const resolved = resolveHistory({
      cached: null,
      liveResults: [],
      status: 'LoadingFirstPage',
    })

    expect(resolved.isFirstLoad).toBe(true)
    expect(resolved.messages).toEqual([])
    expect(resolved.hasMore).toBe(false)
  })
})

describe('resolveHistory med cache', () => {
  it('viser den gemte historik med det samme, også mens den live side mangler', () => {
    const older = message('m1', 1000)
    const newer = message('m2', 2000)
    const resolved = resolveHistory({
      cached: cached([older, newer]),
      liveResults: [],
      status: 'LoadingFirstPage',
    })

    expect(resolved.isFirstLoad).toBe(false)
    expect(resolved.messages).toEqual([older, newer])
  })

  it('skjuler "Hent ældre", så den ikke hænger uden forbindelse', () => {
    const resolved = resolveHistory({
      cached: cached([message('m1', 1000)], { hasMore: true }),
      liveResults: [],
      status: 'LoadingFirstPage',
    })

    expect(resolved.hasMore).toBe(false)
    expect(resolved.isLoadingMore).toBe(false)
  })
})

describe('resolveHistory med den live side', () => {
  it('vender den live side om, så ældste besked står først', () => {
    const newest = message('m2', 2000)
    const oldest = message('m1', 1000)
    const resolved = resolveHistory({
      cached: null,
      liveResults: [newest, oldest],
      status: 'CanLoadMore',
    })

    expect(resolved.messages).toEqual([oldest, newest])
    expect(resolved.isFirstLoad).toBe(false)
    expect(resolved.hasMore).toBe(true)
    expect(resolved.isLoadingMore).toBe(false)
  })

  it('erstatter cachen, så snart den live side er fremme', () => {
    const cachedMessages = [message('m1', 1000)]
    const live = [message('m3', 3000), message('m2', 2000)]
    const resolved = resolveHistory({
      cached: cached(cachedMessages),
      liveResults: live,
      status: 'CanLoadMore',
    })

    expect(resolved.messages).toEqual([message('m2', 2000), message('m3', 3000)])
  })

  it('rapporterer, når der ikke er mere at hente', () => {
    const resolved = resolveHistory({
      cached: null,
      liveResults: [message('m1', 1000)],
      status: 'Exhausted',
    })

    expect(resolved.hasMore).toBe(false)
  })

  it('beholder de allerede hentede beskeder, mens en ældre side hentes', () => {
    const resolved = resolveHistory({
      cached: null,
      liveResults: [message('m2', 2000), message('m1', 1000)],
      status: 'LoadingMore',
    })

    expect(resolved.messages).toEqual([message('m1', 1000), message('m2', 2000)])
    expect(resolved.isLoadingMore).toBe(true)
    expect(resolved.hasMore).toBe(false)
  })
})
