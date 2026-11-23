import { ConvexError } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import { isBcryptHash, verifyPassword } from './passwordCrypto'
import { writeImportedPassword } from './passwords'
import {
  createTestConvex,
  sentTestEmails,
  sessionIdentity,
  testEnv,
} from '../test/convexTestAuth'

// 6-char legacy Lucia v3 Scrypt (`salt:hex`) hash for "abc123"
const LUCIA_SCRYPT_LEGACY_6 =
  '0123456789abcdef0123456789abcdef:e600f3cf717c7ca27878d0e84eaaf126483cacfeef231dd7416855c1e36bfa28983f429c74b170cbf95b454f2f8f7eecc8c1eb6e71eae6eac9b0d24edd5ea423'

// Supabase bcrypt hash for "abc"
const BCRYPT_ABC =
  '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i'

function extractCode(text: string | undefined): string {
  const match = /\?code=([^\s&]+)/.exec(text ?? '')
  if (!match?.[1]) throw new Error(`Missing code in email text: ${text}`)
  return decodeURIComponent(match[1])
}

describe('auth 2.x og v1-kompatibilitet', () => {
  const nodeEnv = testEnv()
  const prevResendKey = nodeEnv.RESEND_API_KEY
  const prevSiteUrl = nodeEnv.SITE_URL
  const prevPreviewSeed = nodeEnv.PREVIEW_SEED

  beforeEach(() => {
    nodeEnv.RESEND_API_KEY = 're_test_key'
    nodeEnv.SITE_URL = 'https://naturklubben.dk'
    delete nodeEnv.PREVIEW_SEED
  })

  afterEach(() => {
    if (prevResendKey === undefined) delete nodeEnv.RESEND_API_KEY
    else nodeEnv.RESEND_API_KEY = prevResendKey
    if (prevSiteUrl === undefined) delete nodeEnv.SITE_URL
    else nodeEnv.SITE_URL = prevSiteUrl
    if (prevPreviewSeed === undefined) delete nodeEnv.PREVIEW_SEED
    else nodeEnv.PREVIEW_SEED = prevPreviewSeed
  })

  it('opretter ny bruger med 10-tegns adgangskode, dansk mail og logger ind', async () => {
    const t = createTestConvex()
    await t.run(async (ctx) => {
      await ctx.db.insert('allowedEmails', {
        email: 'ny@example.com',
        isAdmin: false,
      })
    })

    const client = t.withRequestMetadata({ ip: '127.0.0.1' })

    const shortAttempt = await client.mutation(
      api.auth.signUpWithEmailPassword,
      {
        email: 'ny@example.com',
        password: 'kun9tegn!',
        fullName: 'Nyt Medlem',
      },
    )
    expect(shortAttempt).toEqual({
      success: false,
      userError: { error: 'PASSWORD_TOO_SHORT', minimumLength: 10 },
    })

    const signUp = await client.mutation(api.auth.signUpWithEmailPassword, {
      email: 'Ny@Example.com',
      password: 'sikker-adgangskode-10',
      fullName: 'Nyt Medlem',
    })
    expect(signUp.success).toBe(true)
    if (!signUp.success) throw new Error('expected signUp success')

    const mails = await sentTestEmails(t)
    expect(mails).toHaveLength(1)
    expect(mails[0]?.subject).toContain('Bekræft')
    expect(mails[0]?.text).toContain('https://naturklubben.dk/velkommen?code=')

    const emailCode = extractCode(mails[0]?.text)
    const completed = await client.mutation(
      api.auth.completeSignUpWithEmailPassword,
      {
        emailCode,
        browserSecret: signUp.browserSecret,
      },
    )
    expect(completed.status).toBe('complete')
    if (completed.status !== 'complete') throw new Error('expected complete')

    const asMember = client.withIdentity(sessionIdentity(completed.tokens))
    expect(await asMember.query(api.auth.isAuthenticated, {})).toBe(true)
    const profile = await asMember.mutation(api.members.claimProfile, {})
    expect(profile.fullName).toBe('Nyt Medlem')

    const signedIn = await client.mutation(api.auth.signInWithEmailPassword, {
      email: 'ny@example.com',
      password: 'sikker-adgangskode-10',
    })
    expect(signedIn.status).toBe('complete')
  })

  it('bevarer login for eksisterende v1 Lucia-Scrypt (<10 tegn) og Supabase bcrypt + rehash', async () => {
    const t = createTestConvex()
    await t.run(async (ctx) => {
      const scryptUserId = await ctx.db.insert('users', {
        email: 'gammel@example.com',
        name: 'Gammel Bruger',
        emailVerificationTime: 1000,
      })
      await ctx.db.insert('authAccounts', {
        userId: scryptUserId,
        provider: 'password',
        providerAccountId: 'gammel@example.com',
        secret: LUCIA_SCRYPT_LEGACY_6,
        emailVerified: 'gammel@example.com',
      })
      await writeImportedPassword(ctx, {
        email: 'supabase@example.com',
        bcryptHash: BCRYPT_ABC,
        name: 'Supabase Medlem',
      })
    })

    // Wrong password should fail
    const badLogin = await t.mutation(api.auth.signInWithEmailPassword, {
      email: 'gammel@example.com',
      password: 'forkert',
    })
    expect(badLogin.status).toBe('error')

    // Verify 6-char Scrypt hash signs in cleanly via signInWithEmailPassword (including NFKC normalization)
    expect(await verifyPassword('abc123', LUCIA_SCRYPT_LEGACY_6)).toBe(true)
    const legacyScryptLogin = await t.mutation(
      api.auth.signInWithEmailPassword,
      {
        email: 'gammel@example.com',
        password: 'abc123',
      },
    )
    expect(legacyScryptLogin.status).toBe('complete')
    if (legacyScryptLogin.status !== 'complete') {
      throw new Error('expected 6-char legacy Scrypt sign-in to complete')
    }
    const asLegacy = t.withIdentity(sessionIdentity(legacyScryptLogin.tokens))
    expect(await asLegacy.query(api.auth.isAuthenticated, {})).toBe(true)

    // Existing Supabase bcrypt user signs in cleanly and atomically rehashes
    const bcryptLogin = await t.mutation(api.auth.signInWithEmailPassword, {
      email: 'Supabase@Example.com',
      password: 'abc',
    })
    expect(bcryptLogin.status).toBe('complete')
    if (bcryptLogin.status !== 'complete') throw new Error('expected login')

    const secretAfter = await t.run(async (ctx) => {
      const account = await ctx.db
        .query('authAccounts')
        .withIndex('providerAndAccountId', (q) =>
          q
            .eq('provider', 'password')
            .eq('providerAccountId', 'supabase@example.com'),
        )
        .unique()
      return account?.secret ?? ''
    })
    expect(isBcryptHash(secretAfter)).toBe(false)
    expect(await verifyPassword('abc', secretAfter)).toBe(true)
  })

  it('lader eksisterende v1-bruger nulstille adgangskode og migrerer til v2-komponenter', async () => {
    const t = createTestConvex()
    await t.run(async (ctx) => {
      await writeImportedPassword(ctx, {
        email: 'nulstil@example.com',
        bcryptHash: BCRYPT_ABC,
      })
    })

    const start = await t.mutation(api.auth.startPasswordRecovery, {
      email: 'nulstil@example.com',
    })
    expect(start.success).toBe(true)
    if (!start.success || !('browserSecret' in start) || !start.browserSecret) {
      throw new Error('expected recovery browserSecret')
    }

    const mails = await sentTestEmails(t)
    expect(mails).toHaveLength(1)
    expect(mails[0]?.subject).toContain('Nulstil')
    expect(mails[0]?.text).toContain(
      'https://naturklubben.dk/ny-adgangskode?code=',
    )

    const emailCode = extractCode(mails[0]?.text)
    const peek = await t.query(api.auth.checkPasswordRecovery, {
      emailCode,
      browserSecret: start.browserSecret,
    })
    expect(peek).toEqual({ success: true })

    const completed = await t.mutation(api.auth.completePasswordRecovery, {
      emailCode,
      browserSecret: start.browserSecret,
      newPassword: 'ny-sikker-kode-2026',
    })
    expect(completed.status).toBe('complete')

    const loginNew = await t.mutation(api.auth.signInWithEmailPassword, {
      email: 'nulstil@example.com',
      password: 'ny-sikker-kode-2026',
    })
    expect(loginNew.status).toBe('complete')

    const loginOld = await t.mutation(api.auth.signInWithEmailPassword, {
      email: 'nulstil@example.com',
      password: 'abc',
    })
    expect(loginOld.status).toBe('error')

    const remainingLegacy = await t.run((ctx) =>
      ctx.db
        .query('authAccounts')
        .withIndex('providerAndAccountId', (q) =>
          q
            .eq('provider', 'password')
            .eq('providerAccountId', 'nulstil@example.com'),
        )
        .collect(),
    )
    expect(remainingLegacy).toHaveLength(0)
  })

  it('understøtter auth:changePassword for legacy-brugere (6 og >=10 tegn) samt preview-member uden authPassword', async () => {
    const t = createTestConvex()
    const client = t.withRequestMetadata({ ip: '127.0.0.1' })

    const { shortUserId, longUserId, previewOnlyUserId } = await t.run(
      async (ctx) => {
        const shortId = await ctx.db.insert('users', {
          email: 'kort@example.com',
          emailVerificationTime: 1000,
        })
        await ctx.db.insert('authAccounts', {
          userId: shortId,
          provider: 'password',
          providerAccountId: 'kort@example.com',
          secret: LUCIA_SCRYPT_LEGACY_6,
          emailVerified: 'kort@example.com',
        })

        const longSecret = await verifyPassword(
          'lang-kode-1234',
          LUCIA_SCRYPT_LEGACY_6,
        )
        void longSecret
        const { hashPassword } = await import('./passwordCrypto')
        const longHash = await hashPassword('lang-gammel-kode-1234')
        const longId = await ctx.db.insert('users', {
          email: 'lang@example.com',
          emailVerificationTime: 1000,
        })
        await ctx.db.insert('authAccounts', {
          userId: longId,
          provider: 'password',
          providerAccountId: 'lang@example.com',
          secret: longHash,
          emailVerified: 'lang@example.com',
        })

        const previewId = await ctx.db.insert('users', {
          email: 'previewonly@example.com',
          emailVerificationTime: 1000,
        })
        await ctx.db.insert('authAccounts', {
          userId: previewId,
          provider: 'preview-member',
          providerAccountId: 'previewonly@example.com',
          emailVerified: 'previewonly@example.com',
        })

        return {
          shortUserId: shortId,
          longUserId: longId,
          previewOnlyUserId: previewId,
        }
      },
    )

    // Preview-member uden authPassword må ikke crashe med "No password stored"
    const asPreviewOnly = await client.mutation(api.auth.changePassword, {
      currentPassword: 'noget-over-8-tegn',
      newPassword: 'ny-lang-kode-1234',
    })
    expect(asPreviewOnly).toEqual({
      success: false,
      userError: { error: 'NOT_LOGGED_IN' },
    })

    const { withAuthUser } = await import('../test/convexTestAuth')
    const previewSession = await withAuthUser(t, previewOnlyUserId)
    const previewChange = await previewSession.mutation(
      api.auth.changePassword,
      {
        currentPassword: 'noget-over-8-tegn',
        newPassword: 'ny-lang-kode-1234',
      },
    )
    expect(previewChange).toEqual({
      success: false,
      userError: { error: 'INVALID_CREDENTIALS' },
    })

    // Legacy 6-tegns bruger ændrer adgangskode
    const shortSession = await withAuthUser(t, shortUserId)
    const wrongShort = await shortSession.mutation(api.auth.changePassword, {
      currentPassword: 'forkert',
      newPassword: 'ny-sikker-6-til-10',
    })
    expect(wrongShort).toEqual({
      success: false,
      userError: { error: 'INVALID_CREDENTIALS' },
    })

    const okShort = await shortSession.mutation(api.auth.changePassword, {
      currentPassword: 'abc123',
      newPassword: 'ny-sikker-6-til-10',
    })
    expect(okShort).toEqual({ success: true })

    expect(
      (
        await client.mutation(api.auth.signInWithEmailPassword, {
          email: 'kort@example.com',
          password: 'abc123',
        })
      ).status,
    ).toBe('error')
    expect(
      (
        await client.mutation(api.auth.signInWithEmailPassword, {
          email: 'kort@example.com',
          password: 'ny-sikker-6-til-10',
        })
      ).status,
    ).toBe('complete')

    // Legacy >=8-tegns bruger må ikke crashe på verifyPassword
    const longSession = await withAuthUser(t, longUserId)
    const okLong = await longSession.mutation(api.auth.changePassword, {
      currentPassword: 'lang-gammel-kode-1234',
      newPassword: 'ny-lang-sikker-kode',
    })
    expect(okLong).toEqual({ success: true })

    expect(
      (
        await client.mutation(api.auth.signInWithEmailPassword, {
          email: 'lang@example.com',
          password: 'lang-gammel-kode-1234',
        })
      ).status,
    ).toBe('error')
    expect(
      (
        await client.mutation(api.auth.signInWithEmailPassword, {
          email: 'lang@example.com',
          password: 'ny-lang-sikker-kode',
        })
      ).status,
    ).toBe('complete')
  })

  it('returnerer EMAIL_NOT_FOUND fra startPasswordRecovery når mailen ikke sendes (skip/deny)', async () => {
    nodeEnv.PREVIEW_SEED = '1'
    const t = createTestConvex()
    const client = t.withRequestMetadata({ ip: '127.0.0.1' })

    const missing = await client.mutation(api.auth.startPasswordRecovery, {
      email: 'ukendt@example.com',
    })
    expect(missing).toEqual({
      success: false,
      userError: { error: 'EMAIL_NOT_FOUND' },
    })
  })

  it('migrerer v1-konti idempotent via migrateV1AuthToV2 og håndhæver preview allowlist', async () => {
    nodeEnv.PREVIEW_SEED = '1'
    const t = createTestConvex()
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {})
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'Legacy@Example.com',
        secret: LUCIA_SCRYPT_LEGACY_6,
        emailVerified: 'legacy@example.com',
      })
    })

    const blockedFailure = await t
      .mutation(api.auth.signUpWithEmailPassword, {
        email: 'uvedkommende@example.com',
        password: 'sikker-adgangskode-10',
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(blockedFailure).toBeInstanceOf(ConvexError)
    expect((blockedFailure as ConvexError<string>).data).toBe(
      'EMAIL_NOT_ALLOWED',
    )

    const migrated = await t.mutation(internal.passwords.migrateV1AuthToV2, {
      confirm: 'MIGRATE_V1_AUTH_TO_V2',
    })
    expect(migrated.usersEnsured).toBe(1)
    const user = await t.run(async (ctx) => ctx.db.query('users').first())
    expect(user?.email).toBe('legacy@example.com')
    expect(user?.emailVerificationTime).toBeDefined()
  })
})
