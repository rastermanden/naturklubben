import { describe, expect, it } from 'vitest'
import { failedCodeRedemptionResult } from './authCodeRedeem'

describe('failedCodeRedemptionResult', () => {
  it('gør en fejlet kode-indløsning til ingen session', () => {
    expect(
      failedCodeRedemptionResult('auth:signIn', {
        params: { code: 'abc' },
      }),
    ).toEqual({ tokens: null })
  })

  it('rører ikke login med adgangskode', () => {
    expect(
      failedCodeRedemptionResult('auth:signIn', {
        provider: 'password',
        params: { email: 'a@b.c', password: 'secret', flow: 'signIn' },
      }),
    ).toBeNull()
  })

  it('rører ikke andre kald', () => {
    expect(
      failedCodeRedemptionResult('passwords:changePassword', {
        password: 'secret',
      }),
    ).toBeNull()
  })
})
