import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth, type EmailConfig } from '@convex-dev/auth/server'
import { env } from './_generated/server'
import {
  authFromAddress,
  deliverAuthEmail,
  type AuthMailKind,
} from './authEmail'
import { hashPassword, verifyPassword } from './passwordCrypto'
import { assertPasswordLength, normalizeAuthEmail } from './passwords'

/**
 * Convex Auth med adgangskode, bekræftelsesmail og nulstilling.
 *
 * Linket i mailen er Convex Auth's kode sat på som `?code=`. Klienten
 * samler den op på `/velkommen` og `/ny-adgangskode`, så siderne opleves
 * som den nuværende apps mail-links.
 *
 * Importerede bcrypt-hashes fra Supabase verificeres her. Login-siden
 * skriver dem om til Scrypt bagefter (`passwords.rehashIfImported`).
 * Se V2/README.md.
 */

const VERIFICATION_MAX_AGE_SECONDS = 60 * 60
const DEFAULT_FROM = authFromAddress(undefined)

function mailKind(providerId: string): AuthMailKind {
  return providerId === 'password-reset' ? 'reset' : 'verify'
}

function emailProvider(id: string): EmailConfig {
  return {
    id,
    type: 'email',
    name: id,
    from: DEFAULT_FROM,
    maxAge: VERIFICATION_MAX_AGE_SECONDS,
    sendVerificationRequest: async (params) => {
      await deliverAuthEmail({
        kind: mailKind(params.provider.id),
        to: params.identifier,
        url: params.url,
        apiKey: env.RESEND_API_KEY,
        from: env.AUTH_EMAIL_FROM,
        fetchImpl: fetch,
        log: (line) => console.log(line),
      })
    },
  }
}

const verifyEmail = emailProvider('password-verify')
const resetEmail = emailProvider('password-reset')

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      verify: verifyEmail,
      reset: resetEmail,
      validatePasswordRequirements: assertPasswordLength,
      crypto: {
        hashSecret: hashPassword,
        verifySecret: verifyPassword,
      },
      profile: (params) => {
        const email = normalizeAuthEmail(String(params.email ?? ''))
        const name = typeof params.name === 'string' ? params.name.trim() : ''
        const profile: { [key: string]: string } & { email: string } = {
          email,
        }
        if (name.length > 0) profile.name = name
        return profile
      },
    }),
    // Koden i mailen er udstedt af disse udbydere. Det offentlige
    // `auth:signIn`, som klienten kalder med `?code=`, slår kun op i den
    // almindelige liste -- ikke i Password-udbyderens ekstra liste. Uden
    // dem her fejler linket med "password-verify is not configured".
    verifyEmail,
    resetEmail,
  ],
})
