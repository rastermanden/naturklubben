import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('holder værdien tilbage, indtil den har stået stille', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: 'sko' } },
    )

    expect(result.current).toBe('sko')

    rerender({ value: 'skov' })
    expect(result.current).toBe('sko')

    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe('skov')
  })

  it('springer de mellemliggende tastetryk over', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: '' } },
    )

    for (const value of ['s', 'sk', 'sko', 'skov']) {
      rerender({ value })
      act(() => {
        vi.advanceTimersByTime(100)
      })
    }

    expect(result.current).toBe('')

    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe('skov')
  })
})
