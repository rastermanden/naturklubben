import { compareSync } from 'bcryptjs'
import {
  hashPassword as hashArgon2id,
  verifyPassword as verifyArgon2id,
} from 'password-hash-wasm/argon2id'
import { verifyPassword as verifyScryptPhc } from 'password-hash-wasm/scrypt'
import { encodePHC } from 'password-hash-wasm/scrypt-encode'

/**
 * Understøtter eksisterende hashes under overgangen til `@convex-dev/auth` 2.x:
 * - Supabase Auth bcrypt (`$2a$` / `$2b$` / `$2y$`)
 * - Convex Auth v1 Lucia-Scrypt (`<salt>:<hex>`)
 * - Standard PHC `$scrypt$` og `$argon2id$` via `password-hash-wasm`
 *
 * Nye hashes bruger Argon2id (`password-hash-wasm/argon2id`).
 */

const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/
const HEX_PATTERN = /^[0-9a-f]+$/i
const textEncoder = new TextEncoder()

export function isBcryptHash(hash: string): boolean {
  return BCRYPT_PATTERN.test(hash)
}

export function verifyBcrypt(password: string, hash: string): boolean {
  if (!isBcryptHash(hash)) return false
  try {
    return compareSync(password, hash)
  } catch {
    return false
  }
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !HEX_PATTERN.test(hex)) {
    return null
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

export async function luciaScryptToPhc(hash: string): Promise<string | null> {
  const parts = hash.split(':')
  if (parts.length !== 2) return null
  const [salt, hexKey] = parts
  if (!salt || !hexKey) return null
  const keyBytes = hexToBytes(hexKey)
  if (!keyBytes) return null
  try {
    return await encodePHC({
      ln: 14,
      r: 16,
      p: 1,
      salt: textEncoder.encode(salt),
      hash: keyBytes,
    })
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  return await hashArgon2id(password)
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (isBcryptHash(hash)) return verifyBcrypt(password, hash)
  try {
    if (hash.startsWith('$argon2id$')) {
      return await verifyArgon2id(password, hash)
    }
    if (hash.startsWith('$scrypt$')) {
      return await verifyScryptPhc(password, hash)
    }
    const phc = await luciaScryptToPhc(hash)
    if (!phc) return false
    return await verifyScryptPhc(password, phc)
  } catch {
    return false
  }
}
