import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'
import { THEME_STORAGE_KEY } from './theme'

/** Et matchMedia, testen selv kan skrue på -- jsdom svarer altid "nej" på
 *  prefers-color-scheme og kan ikke fortælle os noget om auto-tilstanden. */
function stubMatchMedia(systemPrefersDark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('dark') ? systemPrefersDark : false,
      media: query,
      addEventListener: (
        _: string,
        listener: (e: MediaQueryListEvent) => void,
      ) => listeners.add(listener),
      removeEventListener: (
        _: string,
        listener: (e: MediaQueryListEvent) => void,
      ) => listeners.delete(listener),
    })),
  )

  return {
    switchSystemTo(theme: 'dark' | 'light') {
      for (const listener of listeners) {
        listener({ matches: theme === 'dark' } as MediaQueryListEvent)
      }
    },
  }
}

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

/** jsdom i denne opsætning har ingen localStorage -- derfor try/catch'en i
 *  theme.ts, og derfor et lager, testen selv holder. */
function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  })
  return store
}

beforeEach(() => {
  stubLocalStorage()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ThemeToggle', () => {
  it('følger systemet, når intet er valgt', () => {
    stubMatchMedia(true)
    renderToggle()

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(
      screen.getByRole('radio', { name: 'Auto' }).getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('gemmer et bevidst valg og lader det slå systemet', () => {
    stubMatchMedia(false)
    renderToggle()
    expect(document.documentElement.dataset.theme).toBe('light')

    fireEvent.click(screen.getByRole('radio', { name: 'Mørk' }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('læser et gemt valg op ved næste besøg', () => {
    stubLocalStorage({ [THEME_STORAGE_KEY]: 'light' })
    stubMatchMedia(true)
    renderToggle()

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('skifter med, når systemet går i nattilstand, mens valget er auto', () => {
    const media = stubMatchMedia(false)
    renderToggle()
    expect(document.documentElement.dataset.theme).toBe('light')

    act(() => media.switchSystemTo('dark'))

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('bliver stående, når systemet skifter, men medlemmet har valgt selv', () => {
    const media = stubMatchMedia(false)
    renderToggle()

    fireEvent.click(screen.getByRole('radio', { name: 'Lys' }))
    act(() => media.switchSystemTo('dark'))

    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
