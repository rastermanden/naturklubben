import { afterEach, describe, expect, it } from 'vitest'
import { clearAuthCodeWait, noteAuthCode } from './authCodeWait'

afterEach(clearAuthCodeWait)

describe('noteAuthCode', () => {
  it('husker koden, efter den er fjernet fra adressen', () => {
    expect(noteAuthCode('?code=abc')).toBe(true)
    expect(noteAuthCode('')).toBe(true)
    clearAuthCodeWait()
    expect(noteAuthCode('')).toBe(false)
  })
})
