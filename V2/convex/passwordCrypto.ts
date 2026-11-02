import { compareSync } from 'bcryptjs'
import { Scrypt } from 'lucia'

/**
 * Supabase Auth gemmer adgangskoder som bcrypt (`$2a$` / `$2b$` / `$2y$`).
 * Convex Auth's egen hash er Lucia-Scrypt (`salt:hash`). De to kan kendes
 * fra hinanden på formen, så en importeret hash kan tjekkes og derefter
 * skrives om til Scrypt ved første rigtige login.
 */

const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

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

export async function hashPassword(password: string): Promise<string> {
  return await new Scrypt().hash(password)
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (isBcryptHash(hash)) return verifyBcrypt(password, hash)
  try {
    return await new Scrypt().verify(hash, password)
  } catch {
    return false
  }
}
