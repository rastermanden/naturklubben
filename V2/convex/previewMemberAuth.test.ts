// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { api, internal } from './_generated/api'
import schema from './schema'
import { DELETION_RESERVATION_MS } from './authz'
import { hashPassword } from './passwordCrypto'
import { writeImportedPassword } from './passwords'
import {
  MAX_FAILED_PER_EMAIL_1_HOUR,
  MAX_FAILED_PER_EMAIL_24_HOURS,
  MAX_FAILED_PER_IP_1_HOUR,
  PREVIEW_MEMBER_PROVIDER_ID,
  PREVIEW_VERIFY_MEMBER_PATH,
  PROD_VERIFY_MEMBER_URL,
  clientAddress,
  hashRateLimitSignal,
  waitForSlot,
} from './previewMemberAuth'
import { PROD_DEPLOYMENT_SLUG } from './previewSeed'

const modules = import.meta.glob('./**/*.ts')

const BCRYPT_ABC =
  '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i'

const TEST_PREVIEW_CLOUD_URL = 'https://savory-possum-345.convex.cloud'
const TEST_PREVIEW_SITE_URL = 'https://savory-possum-345.convex.site'

function envMap(): Record<string, string | undefined> {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }
  if (!g.process) g.process = { env: {} }
  if (!g.process.env) g.process.env = {}
  return g.process.env
}

async function generateTestPrivateKeyPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', pair.privateKey),
  )
  let binary = ''
  for (const byte of pkcs8) {
    binary += String.fromCharCode(byte)
  }
  const base64 = btoa(binary)
  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? base64
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`
}

let cachedPrivateKeyPem: string | null = null
async function testPrivateKeyPem(): Promise<string> {
  if (cachedPrivateKeyPem === null) {
    cachedPrivateKeyPem = await generateTestPrivateKeyPem()
  }
  return cachedPrivateKeyPem
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.')
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return JSON.parse(atob(padded)) as Record<string, unknown>
}

let savedEnv: Record<string, string | undefined> = {}

beforeEach(async () => {
  const env = envMap()
  savedEnv = {
    PREVIEW_SEED: env.PREVIEW_SEED,
    CONVEX_CLOUD_URL: env.CONVEX_CLOUD_URL,
    CONVEX_SITE_URL: env.CONVEX_SITE_URL,
    JWT_PRIVATE_KEY: env.JWT_PRIVATE_KEY,
    RATE_LIMIT_HASH_SECRET: env.RATE_LIMIT_HASH_SECRET,
  }
  env.CONVEX_SITE_URL = TEST_PREVIEW_SITE_URL
  env.JWT_PRIVATE_KEY = await testPrivateKeyPem()
  delete env.RATE_LIMIT_HASH_SECRET
})

afterEach(() => {
  vi.restoreAllMocks()
  const env = envMap()
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }
})

describe('previewMemberAuth hjælpere', () => {
  it('beregner rate-limit-ventetid præcist ved grænsen', () => {
    expect(waitForSlot([100, 200], 3, 1000)).toBe(0)
    expect(waitForSlot([100, 200, 300], 3, 1000)).toBe(1100)
    expect(waitForSlot([300, 100, 200, 400], 3, 1000)).toBe(1200)
  })

  it('hasher rate-limit-signaler med HMAC uden at gemme råværdier', async () => {
    const env = envMap()
    const withoutSecret = await hashRateLimitSignal(
      'email',
      'medlem@naturklubben.dk',
    )
    expect(withoutSecret).toMatch(/^[a-f0-9]{64}$/)
    expect(withoutSecret).not.toContain('medlem')

    env.RATE_LIMIT_HASH_SECRET = 'ekstra-hmac-hemmelighed'
    const withSecret = await hashRateLimitSignal(
      'email',
      'medlem@naturklubben.dk',
    )
    expect(withSecret).toMatch(/^[a-f0-9]{64}$/)
    expect(withSecret).not.toBe(withoutSecret)

    const ipHash = await hashRateLimitSignal('ip', '203.0.113.5')
    expect(ipHash).not.toBe(withSecret)
  })

  it('ignorerer spoofbare IP-headere i clientAddress og bruger kun cf-connecting-ip', () => {
    expect(
      clientAddress(
        new Headers({
          'x-forwarded-for': '1.2.3.4',
          'x-real-ip': '5.6.7.8',
        }),
      ),
    ).toBe('unknown')

    expect(
      clientAddress(
        new Headers({
          'cf-connecting-ip': '203.0.113.10',
          'x-forwarded-for': '1.2.3.4',
        }),
      ),
    ).toBe('203.0.113.10')

    expect(
      clientAddress(
        new Headers({
          'cf-connecting-ip': '203.0.113.10, 1.2.3.4',
        }),
      ),
    ).toBe('unknown')
  })
})

describe(`POST ${PREVIEW_VERIFY_MEMBER_PATH}`, () => {
  it('godkender aktivt medlem (Scrypt og bcrypt), afviser forkert kode, ikke-medlem, manglende profil og sletning ens', async () => {
    const t = convexTest(schema, modules)
    const scryptHash = await hashPassword('rigtig-adgangskode')

    await t.run(async (ctx) => {
      const memberId = await ctx.db.insert('users', {
        email: 'maja@naturklubben.dk',
      })
      await ctx.db.insert('authAccounts', {
        userId: memberId,
        provider: 'password',
        providerAccountId: 'maja@naturklubben.dk',
        secret: scryptHash,
        emailVerified: 'maja@naturklubben.dk',
      })
      await ctx.db.insert('profiles', {
        userId: memberId,
        fullName: 'Maja Medlem',
        isAdmin: false,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: 1,
      })

      const adminId = await writeImportedPassword(ctx, {
        email: 'anker@naturklubben.dk',
        bcryptHash: BCRYPT_ABC,
        name: 'Anker Admin',
        isAdmin: true,
      })
      await ctx.db.insert('profiles', {
        userId: adminId,
        fullName: 'Anker Admin',
        isAdmin: true,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: 1,
      })

      const noProfileId = await ctx.db.insert('users', {
        email: 'udenprofil@naturklubben.dk',
      })
      await ctx.db.insert('authAccounts', {
        userId: noProfileId,
        provider: 'password',
        providerAccountId: 'udenprofil@naturklubben.dk',
        secret: scryptHash,
        emailVerified: 'udenprofil@naturklubben.dk',
      })

      const deletingId = await ctx.db.insert('users', {
        email: 'slettes@naturklubben.dk',
      })
      await ctx.db.insert('authAccounts', {
        userId: deletingId,
        provider: 'password',
        providerAccountId: 'slettes@naturklubben.dk',
        secret: scryptHash,
        emailVerified: 'slettes@naturklubben.dk',
      })
      await ctx.db.insert('profiles', {
        userId: deletingId,
        fullName: 'Snart Slettet',
        isAdmin: true,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        deletionReservedAt: Date.now(),
        createdAt: 1,
      })

      const expiredReservationId = await ctx.db.insert('users', {
        email: 'udloebet-reservation@naturklubben.dk',
      })
      await ctx.db.insert('authAccounts', {
        userId: expiredReservationId,
        provider: 'password',
        providerAccountId: 'udloebet-reservation@naturklubben.dk',
        secret: scryptHash,
        emailVerified: 'udloebet-reservation@naturklubben.dk',
      })
      await ctx.db.insert('profiles', {
        userId: expiredReservationId,
        fullName: 'Beholder Konto',
        isAdmin: false,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        deletionReservedAt: Date.now() - DELETION_RESERVATION_MS - 60_000,
        createdAt: 1,
      })
    })

    const post = (body: unknown, ip?: string) =>
      t.fetch(PREVIEW_VERIFY_MEMBER_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ip ? { 'cf-connecting-ip': ip } : {}),
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      })

    const memberRes = await post(
      { email: '  Maja@Naturklubben.DK ', password: 'rigtig-adgangskode' },
      '198.51.100.1',
    )
    expect(memberRes.status).toBe(200)
    expect(memberRes.headers.get('cache-control')).toBe('no-store')
    expect(await memberRes.json()).toEqual({
      ok: true,
      member: { isAdmin: false, fullName: 'Maja Medlem' },
    })

    const adminRes = await post(
      { email: 'anker@naturklubben.dk', password: 'abc' },
      '198.51.100.2',
    )
    expect(adminRes.status).toBe(200)
    expect(await adminRes.json()).toEqual({
      ok: true,
      member: { isAdmin: true, fullName: 'Anker Admin' },
    })

    const expiredRes = await post(
      {
        email: 'udloebet-reservation@naturklubben.dk',
        password: 'rigtig-adgangskode',
      },
      '198.51.100.3',
    )
    expect(expiredRes.status).toBe(200)
    expect(await expiredRes.json()).toEqual({
      ok: true,
      member: { isAdmin: false, fullName: 'Beholder Konto' },
    })

    // Gyldige kald (200) må ikke forbruge rate-limit-rækker.
    const attemptsAfterSuccess = await t.run((ctx) =>
      ctx.db.query('previewVerifyAttempts').collect(),
    )
    expect(attemptsAfterSuccess).toHaveLength(0)

    const deniedCases = [
      {
        email: 'maja@naturklubben.dk',
        password: 'forkert-adgangskode',
      },
      {
        email: 'ukendt@example.com',
        password: 'rigtig-adgangskode',
      },
      {
        email: 'udenprofil@naturklubben.dk',
        password: 'rigtig-adgangskode',
      },
      {
        email: 'slettes@naturklubben.dk',
        password: 'rigtig-adgangskode',
      },
    ]
    for (const [index, payload] of deniedCases.entries()) {
      const denied = await post(payload, `198.51.100.${10 + index}`)
      expect(denied.status).toBe(401)
      expect(denied.headers.get('cache-control')).toBe('no-store')
      expect(await denied.json()).toEqual({ ok: false })
    }

    const getRes = await t.fetch(PREVIEW_VERIFY_MEMBER_PATH, { method: 'GET' })
    expect(getRes.status).toBe(404)

    const badJson = await post('{ugyldig')
    expect(badJson.status).toBe(400)
    expect(await badJson.json()).toEqual({ ok: false })

    const missingFields = await post({ email: 'maja@naturklubben.dk' })
    expect(missingFields.status).toBe(400)
    expect(await missingFields.json()).toEqual({ ok: false })

    const oversized = await post({
      email: 'maja@naturklubben.dk',
      password: 'x'.repeat(5000),
    })
    expect(oversized.status).toBe(400)
    expect(await oversized.json()).toEqual({ ok: false })

    const attemptsAfterValidationErrors = await t.run((ctx) =>
      ctx.db.query('previewVerifyAttempts').collect(),
    )
    // Kun de 4 afviste forsøg (401) tælles; 200 og 400 giver ingen rækker.
    expect(attemptsAfterValidationErrors).toHaveLength(deniedCases.length)
  })

  it('tæller ikke 200-verifikationer fra samme IP/unknown mod loftet', async () => {
    const t = convexTest(schema, modules)
    const scryptHash = await hashPassword('rigtig-adgangskode')

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        email: 'mange@naturklubben.dk',
      })
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'mange@naturklubben.dk',
        secret: scryptHash,
        emailVerified: 'mange@naturklubben.dk',
      })
      await ctx.db.insert('profiles', {
        userId,
        fullName: 'Trofast Medlem',
        isAdmin: false,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: 1,
      })
    })

    for (let i = 0; i < MAX_FAILED_PER_IP_1_HOUR + 5; i += 1) {
      const unknownIpRes = await t.fetch(PREVIEW_VERIFY_MEMBER_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'mange@naturklubben.dk',
          password: 'rigtig-adgangskode',
        }),
      })
      expect(unknownIpRes.status).toBe(200)

      const sameIpRes = await t.fetch(PREVIEW_VERIFY_MEMBER_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '198.51.100.77',
        },
        body: JSON.stringify({
          email: 'mange@naturklubben.dk',
          password: 'rigtig-adgangskode',
        }),
      })
      expect(sameIpRes.status).toBe(200)
    }

    const attempts = await t.run((ctx) =>
      ctx.db.query('previewVerifyAttempts').collect(),
    )
    expect(attempts).toHaveLength(0)
  }, 20_000)

  it('begrænser fejlforsøg pr. e-mail (under Convex Auth-grænsen) og grov IP-backstop, ignorerer spoofbare headere og rydder gamle rækker', async () => {
    const t = convexTest(schema, modules)
    const env = envMap()
    env.RATE_LIMIT_HASH_SECRET = 'test-rate-limit-secret'
    expect(MAX_FAILED_PER_EMAIL_1_HOUR).toBeLessThanOrEqual(10)
    expect(MAX_FAILED_PER_EMAIL_24_HOURS).toBeGreaterThanOrEqual(
      MAX_FAILED_PER_EMAIL_1_HOUR,
    )

    const callVerify = (email: string, headers: Record<string, string> = {}) =>
      t.fetch(PREVIEW_VERIFY_MEMBER_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ email, password: 'forkert-password' }),
      })

    for (let attempt = 0; attempt < MAX_FAILED_PER_EMAIL_1_HOUR; attempt += 1) {
      const res = await callVerify('offer@naturklubben.dk', {
        'x-forwarded-for': `198.51.101.${attempt + 1}`,
        'x-real-ip': `198.51.102.${attempt + 1}`,
      })
      expect(res.status).toBe(401)
    }

    const emailBlocked = await callVerify('offer@naturklubben.dk', {
      'x-forwarded-for': '198.51.101.200',
    })
    expect(emailBlocked.status).toBe(429)
    expect(Number(emailBlocked.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await emailBlocked.json()).toEqual({
      ok: false,
      error: 'rate_limited',
    })

    // Seed tidligere IP-fejlforsøg i vinduet, så næste fejl går igennem og efterfølgende rammer loftet.
    const sharedIpHash = await hashRateLimitSignal('ip', '203.0.113.99')
    await t.run(async (ctx) => {
      const now = Date.now()
      for (let i = 0; i < MAX_FAILED_PER_IP_1_HOUR - 1; i += 1) {
        await ctx.db.insert('previewVerifyAttempts', {
          ipHash: sharedIpHash,
          emailHash: `seeded-email-hash-${i}`,
          attemptedAt: now - 1000,
        })
      }
    })
    const lastAllowedIp = await callVerify('sidste-tilladte@example.com', {
      'cf-connecting-ip': '203.0.113.99',
    })
    expect(lastAllowedIp.status).toBe(401)
    const ipBlocked = await callVerify('sidste@example.com', {
      'cf-connecting-ip': '203.0.113.99',
    })
    expect(ipBlocked.status).toBe(429)

    const attempts = await t.run(async (ctx) =>
      ctx.db.query('previewVerifyAttempts').collect(),
    )
    expect(attempts.length).toBe(
      MAX_FAILED_PER_EMAIL_1_HOUR + MAX_FAILED_PER_IP_1_HOUR,
    )
    const serialized = JSON.stringify(attempts)
    expect(serialized).not.toContain('offer@naturklubben.dk')
    expect(serialized).not.toContain('203.0.113.99')
    expect(serialized).not.toContain('forkert-password')

    await t.run(async (ctx) => {
      await ctx.db.insert('previewVerifyAttempts', {
        ipHash: 'old-ip',
        emailHash: 'old-email',
        attemptedAt: Date.now() - 26 * 60 * 60 * 1000,
      })
    })
    const deleted = await t.mutation(
      internal.previewMemberAuth.cleanupVerifyAttempts,
      {},
    )
    expect(deleted).toBe(1)
  }, 15_000)
})

describe('preview-member login på PR-preview', () => {
  it('opretter lokal bruger, profil med admin-rolle fra prod og session uden at gemme adgangskoden', async () => {
    const env = envMap()
    env.PREVIEW_SEED = '1'
    env.CONVEX_CLOUD_URL = TEST_PREVIEW_CLOUD_URL

    const t = convexTest(schema, modules)
    const prodPassword = 'hemmelig-prod-adgangskode'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            member: { isAdmin: true, fullName: 'Martin' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            member: { isAdmin: false, fullName: 'Martin' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const firstSignIn = (await t.action(api.auth.signIn, {
      provider: PREVIEW_MEMBER_PROVIDER_ID,
      params: {
        email: '  Martin@Naturklubben.dk ',
        password: prodPassword,
      },
    })) as { tokens?: { token: string; refreshToken: string } | null }

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      PROD_VERIFY_MEMBER_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'martin@naturklubben.dk',
          password: prodPassword,
        }),
      }),
    )

    expect(firstSignIn.tokens?.token).toBeTypeOf('string')
    expect(firstSignIn.tokens?.refreshToken).toBeTypeOf('string')

    const jwtPayload = decodeJwtPayload(firstSignIn.tokens!.token)
    expect(jwtPayload.iss).toBe(TEST_PREVIEW_SITE_URL)
    expect(jwtPayload.aud).toBe('convex')

    const afterFirst = await t.run(async (ctx) => ({
      users: await ctx.db.query('users').collect(),
      accounts: await ctx.db.query('authAccounts').collect(),
      sessions: await ctx.db.query('authSessions').collect(),
      profiles: await ctx.db.query('profiles').collect(),
      allowed: await ctx.db.query('allowedEmails').collect(),
    }))

    expect(afterFirst.users).toHaveLength(1)
    expect(afterFirst.users[0]?.email).toBe('martin@naturklubben.dk')
    expect(String(jwtPayload.sub)).toContain(String(afterFirst.users[0]!._id))
    expect(afterFirst.sessions).toHaveLength(1)
    expect(afterFirst.profiles).toHaveLength(1)
    expect(afterFirst.profiles[0]).toMatchObject({
      userId: afterFirst.users[0]!._id,
      fullName: 'Martin',
      isAdmin: true,
    })
    expect(afterFirst.allowed).toEqual([
      expect.objectContaining({
        email: 'martin@naturklubben.dk',
        isAdmin: true,
      }),
    ])
    expect(afterFirst.accounts).toHaveLength(1)
    expect(afterFirst.accounts[0]).toMatchObject({
      userId: afterFirst.users[0]!._id,
      provider: PREVIEW_MEMBER_PROVIDER_ID,
      providerAccountId: 'martin@naturklubben.dk',
      emailVerified: 'martin@naturklubben.dk',
    })
    expect(afterFirst.accounts[0]?.secret).toBeUndefined()
    expect(JSON.stringify(afterFirst)).not.toContain(prodPassword)

    // Andet login synkroniserer ændret admin-rolle uden at duplikere bruger eller profil.
    await t.action(api.auth.signIn, {
      provider: PREVIEW_MEMBER_PROVIDER_ID,
      params: {
        email: 'martin@naturklubben.dk',
        password: prodPassword,
      },
    })

    const afterSecond = await t.run(async (ctx) => ({
      users: await ctx.db.query('users').collect(),
      accounts: await ctx.db.query('authAccounts').collect(),
      profiles: await ctx.db.query('profiles').collect(),
      allowed: await ctx.db.query('allowedEmails').collect(),
    }))
    expect(afterSecond.users).toHaveLength(1)
    expect(afterSecond.accounts).toHaveLength(1)
    expect(afterSecond.profiles).toHaveLength(1)
    expect(afterSecond.profiles[0]?.isAdmin).toBe(false)
    expect(afterSecond.allowed[0]?.isAdmin).toBe(false)
    expect(JSON.stringify(afterSecond)).not.toContain(prodPassword)
  })

  it('genbruger en eksisterende lokal konto uden at overskrive eller gemme prod-adgangskoden', async () => {
    const env = envMap()
    env.PREVIEW_SEED = '1'
    env.CONVEX_CLOUD_URL = TEST_PREVIEW_CLOUD_URL

    const t = convexTest(schema, modules)
    const seededHash = await hashPassword('delt-test-kode')
    const existingUserId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        email: 'troels@naturklubben.dk',
      })
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'troels@naturklubben.dk',
        secret: seededHash,
        emailVerified: 'troels@naturklubben.dk',
      })
      await ctx.db.insert('profiles', {
        userId,
        fullName: 'Troels (lokalt navn)',
        isAdmin: false,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: 1,
      })
      return userId
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          member: { isAdmin: true, fullName: 'Troels' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await t.action(api.auth.signIn, {
      provider: PREVIEW_MEMBER_PROVIDER_ID,
      params: {
        email: 'troels@naturklubben.dk',
        password: 'rigtig-prod-kode',
      },
    })

    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query('users').collect(),
      profiles: await ctx.db.query('profiles').collect(),
      accounts: await ctx.db.query('authAccounts').collect(),
    }))
    expect(state.users).toHaveLength(1)
    expect(state.users[0]?._id).toBe(existingUserId)
    expect(state.profiles).toHaveLength(1)
    expect(state.profiles[0]?.isAdmin).toBe(true)
    expect(state.profiles[0]?.fullName).toBe('Troels (lokalt navn)')
    const previewAccount = state.accounts.find(
      (acc) => acc.provider === PREVIEW_MEMBER_PROVIDER_ID,
    )
    expect(previewAccount?.userId).toBe(existingUserId)
    expect(previewAccount?.secret).toBeUndefined()
    expect(JSON.stringify(state)).not.toContain('rigtig-prod-kode')
  })

  it('afviser fejl og rate limit fra prod uden at oprette lokal bruger', async () => {
    const env = envMap()
    env.PREVIEW_SEED = '1'
    env.CONVEX_CLOUD_URL = TEST_PREVIEW_CLOUD_URL

    const t = convexTest(schema, modules)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
          status: 429,
        }),
      )
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response('Method Not Allowed', { status: 405 }),
      )
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
      .mockRejectedValueOnce(new Error('network down'))

    const denied = await t
      .action(api.auth.signIn, {
        provider: PREVIEW_MEMBER_PROVIDER_ID,
        params: { email: 'ikke@medlem.dk', password: 'forkert' },
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(denied).toBeInstanceOf(ConvexError)
    expect(JSON.parse((denied as ConvexError<string>).data)).toBe(
      'INVALID_CREDENTIALS',
    )

    const limited = await t
      .action(api.auth.signIn, {
        provider: PREVIEW_MEMBER_PROVIDER_ID,
        params: { email: 'medlem@medlem.dk', password: 'forkert' },
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(limited).toBeInstanceOf(ConvexError)
    expect(JSON.parse((limited as ConvexError<string>).data)).toBe(
      'RATE_LIMITED',
    )

    for (const statusLabel of ['403', '404', '405', '500']) {
      const upstreamError = await t
        .action(api.auth.signIn, {
          provider: PREVIEW_MEMBER_PROVIDER_ID,
          params: {
            email: `medlem-${statusLabel}@medlem.dk`,
            password: 'kode',
          },
        })
        .then(
          () => null,
          (error: unknown) => error,
        )
      expect(upstreamError).toBeInstanceOf(ConvexError)
      expect(JSON.parse((upstreamError as ConvexError<string>).data)).toBe(
        'PREVIEW_AUTH_UNAVAILABLE',
      )
    }

    const offline = await t
      .action(api.auth.signIn, {
        provider: PREVIEW_MEMBER_PROVIDER_ID,
        params: { email: 'medlem@medlem.dk', password: 'kode' },
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(offline).toBeInstanceOf(ConvexError)
    expect(JSON.parse((offline as ConvexError<string>).data)).toBe(
      'PREVIEW_AUTH_UNAVAILABLE',
    )

    const counts = await t.run(async (ctx) => ({
      users: (await ctx.db.query('users').collect()).length,
      profiles: (await ctx.db.query('profiles').collect()).length,
      sessions: (await ctx.db.query('authSessions').collect()).length,
      accounts: (await ctx.db.query('authAccounts').collect()).length,
    }))
    expect(counts).toEqual({ users: 0, profiles: 0, sessions: 0, accounts: 0 })
  })

  it('opretter almindeligt medlem uden admin-rolle når prod svarer isAdmin: false', async () => {
    const env = envMap()
    env.PREVIEW_SEED = '1'
    env.CONVEX_CLOUD_URL = TEST_PREVIEW_CLOUD_URL

    const t = convexTest(schema, modules)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          member: { isAdmin: false, fullName: 'Freja' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const signedIn = (await t.action(api.auth.signIn, {
      provider: PREVIEW_MEMBER_PROVIDER_ID,
      params: { email: 'freja@naturklubben.dk', password: 'prod-kode-freja' },
    })) as { tokens?: { token: string } | null }

    expect(signedIn.tokens?.token).toBeTypeOf('string')
    const profiles = await t.run(async (ctx) =>
      ctx.db.query('profiles').collect(),
    )
    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({ fullName: 'Freja', isAdmin: false })
  })

  it('nægter preview-member på produktion uden at lave HTTP-kald', async () => {
    const env = envMap()
    delete env.PREVIEW_SEED
    env.CONVEX_CLOUD_URL = TEST_PREVIEW_CLOUD_URL

    const t = convexTest(schema, modules)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const withoutFlag = await t
      .action(api.auth.signIn, {
        provider: PREVIEW_MEMBER_PROVIDER_ID,
        params: { email: 'm@naturklubben.dk', password: 'kode' },
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(withoutFlag).toBeInstanceOf(ConvexError)
    expect(JSON.parse((withoutFlag as ConvexError<string>).data)).toBe(
      'INVALID_CREDENTIALS',
    )

    env.PREVIEW_SEED = '1'
    env.CONVEX_CLOUD_URL = `https://${PROD_DEPLOYMENT_SLUG}.convex.cloud`
    const onProdHost = await t
      .action(api.auth.signIn, {
        provider: PREVIEW_MEMBER_PROVIDER_ID,
        params: { email: 'm@naturklubben.dk', password: 'kode' },
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(onProdHost).toBeInstanceOf(ConvexError)
    expect(JSON.parse((onProdHost as ConvexError<string>).data)).toBe(
      'INVALID_CREDENTIALS',
    )
    expect(fetchSpy).not.toHaveBeenCalled()

    await expect(
      t.mutation(internal.previewMemberAuth.provisionVerifiedMember, {
        email: 'm@naturklubben.dk',
        isAdmin: true,
        fullName: 'Martin',
      }),
    ).rejects.toThrow('PREVIEW_SEED_REFUSED_PROD')
  })

  it('lader CI-testbrugeren logge ind lokalt via password-provideren uden kald til prod', async () => {
    const env = envMap()
    env.PREVIEW_SEED = '1'
    env.CONVEX_CLOUD_URL = TEST_PREVIEW_CLOUD_URL

    const t = convexTest(schema, modules)
    const passwordHash = await hashPassword('ci-test-kode-123')
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        email: 'ci-test@example.com',
        emailVerificationTime: Date.now(),
      })
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'ci-test@example.com',
        secret: passwordHash,
        emailVerified: 'ci-test@example.com',
      })
      await ctx.db.insert('profiles', {
        userId,
        fullName: 'Preview-tester',
        isAdmin: false,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: 1,
      })
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const signedIn = (await t.action(api.auth.signIn, {
      provider: 'password',
      params: {
        email: 'ci-test@example.com',
        password: 'ci-test-kode-123',
        flow: 'signIn',
      },
    })) as { tokens?: { token: string } | null }

    expect(signedIn.tokens?.token).toBeTypeOf('string')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('genskaber og genknytter bruger hvis eksisterende authAccounts er forældreløse', async () => {
    const env = envMap()
    env.PREVIEW_SEED = '1'
    env.CONVEX_CLOUD_URL = TEST_PREVIEW_CLOUD_URL

    const t = convexTest(schema, modules)
    const orphanedUserId = await t.run(async (ctx) => {
      const deletedUserId = await ctx.db.insert('users', {
        email: 'foraeldreloes@naturklubben.dk',
      })
      await ctx.db.delete(deletedUserId)
      await ctx.db.insert('authAccounts', {
        userId: deletedUserId,
        provider: PREVIEW_MEMBER_PROVIDER_ID,
        providerAccountId: 'foraeldreloes@naturklubben.dk',
        emailVerified: 'foraeldreloes@naturklubben.dk',
      })
      await ctx.db.insert('authAccounts', {
        userId: deletedUserId,
        provider: 'password',
        providerAccountId: 'foraeldreloes@naturklubben.dk',
        secret: 'gammel-lokal-hash',
        emailVerified: 'foraeldreloes@naturklubben.dk',
      })
      return deletedUserId
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          member: { isAdmin: false, fullName: 'Forældreløs Bruger' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const signedIn = (await t.action(api.auth.signIn, {
      provider: PREVIEW_MEMBER_PROVIDER_ID,
      params: {
        email: 'foraeldreloes@naturklubben.dk',
        password: 'rigtig-prod-password',
      },
    })) as { tokens?: { token: string } | null }

    expect(signedIn.tokens?.token).toBeTypeOf('string')

    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query('users').collect(),
      accounts: await ctx.db.query('authAccounts').collect(),
      profiles: await ctx.db.query('profiles').collect(),
      sessions: await ctx.db.query('authSessions').collect(),
    }))

    expect(state.users).toHaveLength(1)
    const liveUserId = state.users[0]!._id
    expect(liveUserId).not.toBe(orphanedUserId)
    expect(state.accounts).toHaveLength(2)
    for (const acc of state.accounts) {
      expect(acc.userId).toBe(liveUserId)
    }
    expect(state.profiles).toHaveLength(1)
    expect(state.profiles[0]?.userId).toBe(liveUserId)
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0]?.userId).toBe(liveUserId)
  })
})
