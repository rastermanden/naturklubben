import { describe, expect, it } from 'vitest'
import { Scrypt } from 'lucia'
import { isBcryptHash, verifyBcrypt, verifyPassword } from './passwordCrypto'

const BCRYPT_ABC =
  '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i'

describe('verifyBcrypt', () => {
  it('godkender en bcrypt-hash, som Supabase kunne have gemt', () => {
    expect(isBcryptHash(BCRYPT_ABC)).toBe(true)
    expect(verifyBcrypt('abc', BCRYPT_ABC)).toBe(true)
    expect(verifyBcrypt('forkert', BCRYPT_ABC)).toBe(false)
    expect(isBcryptHash('ikke-en-hash')).toBe(false)
  })

  it('godkender både bcrypt og Scrypt', async () => {
    const scrypt = await new Scrypt().hash('hemmelig')
    expect(isBcryptHash(scrypt)).toBe(false)
    expect(await verifyPassword('hemmelig', scrypt)).toBe(true)
    expect(await verifyPassword('abc', BCRYPT_ABC)).toBe(true)
    expect(await verifyPassword('forkert', BCRYPT_ABC)).toBe(false)
  })
})
