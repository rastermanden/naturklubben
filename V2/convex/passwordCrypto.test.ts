import { describe, expect, it } from 'vitest'
import {
  hashPassword,
  isBcryptHash,
  luciaScryptToPhc,
  verifyBcrypt,
  verifyPassword,
} from './passwordCrypto'

const BCRYPT_ABC =
  '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i'

// Lucia v3 Scrypt (`salt:hex`, N=16384, r=16, p=1, dkLen=64) for "hemmelig"
const LUCIA_SCRYPT_HEMMELIG =
  '0123456789abcdef0123456789abcdef:d65f75e83fef9d95b00ceae946b5c1d46fde524876fbd1aca3ef32c5e3f11f775808827f2aac8e8c2a28e4ce80675a9aafff97a42b8a29bc8c149328bfe764e7'

describe('verifyBcrypt', () => {
  it('godkender en bcrypt-hash, som Supabase kunne have gemt', () => {
    expect(isBcryptHash(BCRYPT_ABC)).toBe(true)
    expect(verifyBcrypt('abc', BCRYPT_ABC)).toBe(true)
    expect(verifyBcrypt('forkert', BCRYPT_ABC)).toBe(false)
    expect(isBcryptHash('ikke-en-hash')).toBe(false)
  })

  it('godkender bcrypt, Lucia-Scrypt, PHC $scrypt$ og Argon2id', async () => {
    const argon2 = await hashPassword('hemmelig')
    expect(argon2.startsWith('$argon2id$')).toBe(true)
    expect(isBcryptHash(argon2)).toBe(false)
    expect(await verifyPassword('hemmelig', argon2)).toBe(true)
    expect(await verifyPassword('forkert', argon2)).toBe(false)

    const phcScrypt = await luciaScryptToPhc(LUCIA_SCRYPT_HEMMELIG)
    expect(phcScrypt?.startsWith('$scrypt$')).toBe(true)
    expect(await verifyPassword('hemmelig', LUCIA_SCRYPT_HEMMELIG)).toBe(true)
    expect(await verifyPassword('forkert', LUCIA_SCRYPT_HEMMELIG)).toBe(false)
    expect(await verifyPassword('hemmelig', phcScrypt!)).toBe(true)

    expect(await verifyPassword('abc', BCRYPT_ABC)).toBe(true)
    expect(await verifyPassword('forkert', BCRYPT_ABC)).toBe(false)
  })
})
