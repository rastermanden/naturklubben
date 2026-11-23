import { createFunctionHandle } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { components, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { ActionCtx } from './_generated/server'
import {
  env,
  httpAction,
  internalMutation,
  internalQuery,
} from './_generated/server'
import { hasActiveDeletionReservation } from './authz'
import { verifyPassword } from './passwordCrypto'
import { normalizeAuthEmail } from './passwords'
import { assertPreviewSeedAllowed, PROD_DEPLOYMENT_SLUG } from './previewSeed'

/**
 * Medlemslogin på V2 PR-previews uden delt adgangskode.
 *
 * Produktions-deploymentet (`quaint-parakeet-652`) udstiller
 * `POST /preview/verify-member`. Et PR-preview kalder denne rute
 * server-til-server fra `auth:signInWithPreviewMember`, verificerer
 * adgangskoden mod produktion, og opretter derefter en lokal session på
 * preview-deploymentet -- uden nogensinde at kopiere, gemme, hashe,
 * returnere eller logge produktionsadgangskoden.
 */

export const PREVIEW_VERIFY_MEMBER_PATH = '/preview/verify-member'
export const PREVIEW_MEMBER_PROVIDER_ID = 'preview-member'
export const PROD_VERIFY_MEMBER_URL = `https://${PROD_DEPLOYMENT_SLUG}.convex.site${PREVIEW_VERIFY_MEMBER_PATH}`

const MAX_BODY_BYTES = 4096
const EMAIL_MAX_LENGTH = 320
const PASSWORD_MAX_LENGTH = 512
const VERIFY_FETCH_TIMEOUT_MS = 10_000

const WINDOW_1_HOUR_MS = 60 * 60 * 1000
const WINDOW_24_HOURS_MS = 24 * 60 * 60 * 1000
const ATTEMPT_RETENTION_MS = 25 * 60 * 60 * 1000

const ACCESS_TOKEN_TTL_SECONDS = 60
const SESSION_MAX_LIFETIME_SECONDS = 30 * 24 * 60 * 60
const TTL_CONFIG = {
  accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
  refreshInactivityTimeoutSeconds: SESSION_MAX_LIFETIME_SECONDS,
  sessionMaxLifetimeSeconds: SESSION_MAX_LIFETIME_SECONDS,
}

/**
 * Under `@convex-dev/auth`s indbyggede password-login-grænse (10 pr. time),
 * så endpointet aldrig udvider gætterummet pr. medlem. Kun fejlforsøg tælles.
 */
export const MAX_FAILED_PER_EMAIL_1_HOUR = 8
export const MAX_FAILED_PER_EMAIL_24_HOURS = 20
export const MAX_FAILED_PER_IP_1_HOUR = 30
export const MAX_FAILED_PER_IP_24_HOURS = 150
export const MAX_FAILED_GLOBAL_24_HOURS = 500

/**
 * Gyldig Lucia-Scrypt-streng (`32 hex-salt : 128 hex-key`), så ukendte adresser
 * og konti uden aktiv profil bruger samme KDF-tid som et rigtigt tjek.
 */
const DUMMY_SCRYPT_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`
const DEFAULT_CHAT_COLOR = '#16a34a'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function runtimeEnv(name: string): string | undefined {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }
  return g.process?.env?.[name]
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Klientens IP-adresse fra verificeret proxy-header, udelukkende til grov
 * fejl-begrænsning. Spoofbare `x-real-ip`/`x-forwarded-for` bruges ikke.
 * Rå IP gemmes aldrig; den hashes med det samme.
 */
export function clientAddress(headers: Headers): string {
  const direct = headers.get('cf-connecting-ip')
  if (direct && !direct.includes(',')) {
    const trimmed = direct.trim()
    if (trimmed.length > 0) return trimmed
  }

  return 'unknown'
}

/**
 * Hasher IP og e-mail til rate-limit-tabellen, så rå adresser aldrig gemmes.
 */
export async function hashRateLimitSignal(
  domain: 'ip' | 'email',
  value: string,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new ConvexError('RATE_LIMIT_HASH_UNAVAILABLE')
  }
  const encoder = new TextEncoder()
  const payload = encoder.encode(
    `preview-verify-rate-limit-v1\0${domain}\0${value}`,
  )

  const explicitSecret = env.RATE_LIMIT_HASH_SECRET?.trim()
  const jwtPrivateKey = runtimeEnv('JWT_PRIVATE_KEY')?.trim()

  let rawKeyBytes: Uint8Array | null = null
  if (explicitSecret) {
    rawKeyBytes = encoder.encode(explicitSecret)
  } else if (jwtPrivateKey) {
    const derived = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(`preview-verify-hmac-key-v1\0${jwtPrivateKey}`),
    )
    rawKeyBytes = new Uint8Array(derived)
  }

  if (rawKeyBytes === null) {
    const digest = await crypto.subtle.digest('SHA-256', payload)
    return toHex(digest)
  }

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    rawKeyBytes as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', hmacKey, payload)
  return toHex(signature)
}

/**
 * Tidspunkt (ms) hvor vinduet igen tillader et forsøg, eller `0` når
 * `existingTimes.length < limit`.
 */
export function waitForSlot(
  existingTimes: readonly number[],
  limit: number,
  windowMs: number,
): number {
  if (existingTimes.length < limit) return 0
  const sorted = [...existingTimes].sort((a, b) => a - b)
  const freeing = sorted[existingTimes.length - limit]
  return freeing + windowMs
}

export function validateVerifyRequest(
  value: unknown,
): { ok: true; email: string; password: string } | { ok: false; status: 400 } {
  if (!isRecord(value)) return { ok: false, status: 400 }
  if (typeof value.email !== 'string' || typeof value.password !== 'string') {
    return { ok: false, status: 400 }
  }
  const email = normalizeAuthEmail(value.email)
  if (
    email.length > EMAIL_MAX_LENGTH ||
    value.password.length > PASSWORD_MAX_LENGTH
  ) {
    return { ok: false, status: 400 }
  }
  return { ok: true, email, password: value.password }
}

export function parseVerifyMemberResponse(
  value: unknown,
): { isAdmin: boolean; fullName: string | null } | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.member)) {
    return null
  }
  if (typeof value.member.isAdmin !== 'boolean') return null
  const rawName = value.member.fullName
  if (
    rawName !== null &&
    rawName !== undefined &&
    typeof rawName !== 'string'
  ) {
    return null
  }
  const trimmedName = typeof rawName === 'string' ? rawName.trim() : ''
  return {
    isAdmin: value.member.isAdmin,
    fullName: trimmedName.length > 0 ? trimmedName : null,
  }
}

export const checkVerifyRateLimit = internalQuery({
  args: { ipHash: v.string(), emailHash: v.string() },
  returns: v.union(
    v.object({ allowed: v.literal(true) }),
    v.object({ allowed: v.literal(false), retryAfterSeconds: v.number() }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    { allowed: true } | { allowed: false; retryAfterSeconds: number }
  > => {
    const now = Date.now()
    const since1h = now - WINDOW_1_HOUR_MS
    const since24h = now - WINDOW_24_HOURS_MS

    const [perEmailDay, perIpDay, globalDay] = await Promise.all([
      ctx.db
        .query('previewVerifyAttempts')
        .withIndex('by_email_and_time', (q) =>
          q.eq('emailHash', args.emailHash).gte('attemptedAt', since24h),
        )
        .collect(),
      ctx.db
        .query('previewVerifyAttempts')
        .withIndex('by_ip_and_time', (q) =>
          q.eq('ipHash', args.ipHash).gte('attemptedAt', since24h),
        )
        .collect(),
      ctx.db
        .query('previewVerifyAttempts')
        .withIndex('by_attempted_at', (q) => q.gte('attemptedAt', since24h))
        .collect(),
    ])

    const perEmailHour = perEmailDay.filter((row) => row.attemptedAt >= since1h)
    const perIpHour = perIpDay.filter((row) => row.attemptedAt >= since1h)

    const waits = [
      waitForSlot(
        perEmailHour.map((row) => row.attemptedAt),
        MAX_FAILED_PER_EMAIL_1_HOUR,
        WINDOW_1_HOUR_MS,
      ),
      waitForSlot(
        perEmailDay.map((row) => row.attemptedAt),
        MAX_FAILED_PER_EMAIL_24_HOURS,
        WINDOW_24_HOURS_MS,
      ),
      waitForSlot(
        perIpHour.map((row) => row.attemptedAt),
        MAX_FAILED_PER_IP_1_HOUR,
        WINDOW_1_HOUR_MS,
      ),
      waitForSlot(
        perIpDay.map((row) => row.attemptedAt),
        MAX_FAILED_PER_IP_24_HOURS,
        WINDOW_24_HOURS_MS,
      ),
      waitForSlot(
        globalDay.map((row) => row.attemptedAt),
        MAX_FAILED_GLOBAL_24_HOURS,
        WINDOW_24_HOURS_MS,
      ),
    ]
    const retryAt = Math.max(0, ...waits)
    if (retryAt > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1000)),
      }
    }

    return { allowed: true }
  },
})

export const recordFailedVerifyAttempt = internalMutation({
  args: { ipHash: v.string(), emailHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.insert('previewVerifyAttempts', {
      ipHash: args.ipHash,
      emailHash: args.emailHash,
      attemptedAt: Date.now(),
    })
    return null
  },
})

export const cleanupVerifyAttempts = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const cutoff = Date.now() - ATTEMPT_RETENTION_MS
    const rows = await ctx.db
      .query('previewVerifyAttempts')
      .withIndex('by_attempted_at', (q) => q.lt('attemptedAt', cutoff))
      .collect()
    for (const row of rows) {
      await ctx.db.delete(row._id)
    }
    return rows.length
  },
})

export const lookupMemberForVerify = internalQuery({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      source: v.literal('legacy'),
      secret: v.string(),
      hasActiveProfile: v.boolean(),
      isAdmin: v.boolean(),
      fullName: v.union(v.string(), v.null()),
    }),
    v.object({
      source: v.literal('v2'),
      userId: v.string(),
      legacySecret: v.optional(v.string()),
      hasActiveProfile: v.boolean(),
      isAdmin: v.boolean(),
      fullName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const email = normalizeAuthEmail(args.email)
    const users = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .collect()
    const verifiedUsers = users.filter(
      (u) => u.emailVerificationTime !== undefined,
    )

    let v2UserId: Id<'users'> | null = null
    for (const candidateUser of verifiedUsers) {
      const v2Emails = await ctx.runQuery(
        components.authEmail.verifiedEmails.getEmails,
        { userId: candidateUser._id },
      )
      if (v2Emails.length > 0) {
        v2UserId = candidateUser._id
        break
      }
    }

    const legacyAccount = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'password').eq('providerAccountId', email),
      )
      .unique()
    const legacySecret =
      legacyAccount !== null &&
      typeof legacyAccount.secret === 'string' &&
      legacyAccount.secret.length > 0
        ? legacyAccount.secret
        : null

    const userId = v2UserId ?? legacyAccount?.userId ?? null
    if (userId === null || (v2UserId === null && legacySecret === null)) {
      return null
    }

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    const hasActiveProfile =
      profile !== null && !hasActiveDeletionReservation(profile)
    const trimmedName = profile?.fullName?.trim() ?? ''
    const base = {
      hasActiveProfile,
      isAdmin: profile?.isAdmin === true,
      fullName: trimmedName.length > 0 ? trimmedName : null,
    }

    if (v2UserId !== null) {
      return {
        source: 'v2' as const,
        userId: v2UserId,
        ...(legacySecret !== null ? { legacySecret } : {}),
        ...base,
      }
    }
    return { source: 'legacy' as const, secret: legacySecret!, ...base }
  },
})

/**
 * Opretter eller opdaterer medlemmets lokale preview-bruger og -profil,
 * efter produktion har bekræftet loginnet. Kaldes kun på preview-deployments
 * og modtager aldrig en adgangskode.
 */
export const provisionVerifiedMember = internalMutation({
  args: {
    email: v.string(),
    isAdmin: v.boolean(),
    fullName: v.union(v.string(), v.null()),
  },
  returns: v.id('users'),
  handler: async (ctx, args): Promise<Id<'users'>> => {
    assertPreviewSeedAllowed({
      previewSeed: env.PREVIEW_SEED,
      cloudUrl: env.CONVEX_CLOUD_URL,
    })

    const email = normalizeAuthEmail(args.email)
    const cleanName = args.fullName?.trim() || undefined
    const now = Date.now()

    const allowedRows = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect()
    const [allowed, ...extraAllowed] = allowedRows
    for (const dup of extraAllowed) await ctx.db.delete(dup._id)
    if (allowed === undefined) {
      await ctx.db.insert('allowedEmails', { email, isAdmin: args.isAdmin })
    } else if ((allowed.isAdmin ?? false) !== args.isAdmin) {
      await ctx.db.patch(allowed._id, { isAdmin: args.isAdmin })
    }

    const existingPreviewAccount = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q
          .eq('provider', PREVIEW_MEMBER_PROVIDER_ID)
          .eq('providerAccountId', email),
      )
      .unique()
    const existingPasswordAccount = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'password').eq('providerAccountId', email),
      )
      .unique()

    const previewUser =
      existingPreviewAccount !== null
        ? await ctx.db.get(existingPreviewAccount.userId)
        : null
    const passwordUser =
      existingPasswordAccount !== null
        ? await ctx.db.get(existingPasswordAccount.userId)
        : null
    const existingUser =
      previewUser === null && passwordUser === null
        ? await ctx.db
            .query('users')
            .withIndex('email', (q) => q.eq('email', email))
            .first()
        : null

    let userId: Id<'users'>
    if (previewUser !== null) {
      userId = previewUser._id
    } else if (passwordUser !== null) {
      userId = passwordUser._id
    } else if (existingUser !== null) {
      userId = existingUser._id
    } else {
      userId = await ctx.db.insert('users', {
        email,
        ...(cleanName ? { name: cleanName } : {}),
        emailVerificationTime: now,
      })
    }

    const user = await ctx.db.get(userId)
    if (user !== null && user.emailVerificationTime === undefined) {
      await ctx.db.patch(userId, { emailVerificationTime: now })
    }

    if (existingPreviewAccount === null) {
      await ctx.db.insert('authAccounts', {
        userId,
        provider: PREVIEW_MEMBER_PROVIDER_ID,
        providerAccountId: email,
        emailVerified: email,
      })
    } else {
      const updates: { userId?: Id<'users'>; emailVerified?: string } = {}
      if (existingPreviewAccount.userId !== userId) {
        updates.userId = userId
      }
      if (existingPreviewAccount.emailVerified !== email) {
        updates.emailVerified = email
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existingPreviewAccount._id, updates)
      }
    }

    if (existingPasswordAccount !== null && passwordUser === null) {
      await ctx.db.patch(existingPasswordAccount._id, { userId })
    }

    const existingProfile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    if (existingProfile === null) {
      await ctx.db.insert('profiles', {
        userId,
        ...(cleanName ? { fullName: cleanName } : {}),
        isAdmin: args.isAdmin,
        chatColor: DEFAULT_CHAT_COLOR,
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: now,
      })
    } else {
      const missingName =
        (existingProfile.fullName ?? '').trim().length === 0 &&
        cleanName !== undefined
      if (existingProfile.isAdmin !== args.isAdmin || missingName) {
        await ctx.db.patch(existingProfile._id, {
          isAdmin: args.isAdmin,
          ...(missingName ? { fullName: cleanName } : {}),
        })
      }
    }

    await ctx.runMutation(components.auth.public.markUserIdCreated, {
      userId,
    })

    return userId
  },
})

export type PreviewTokenBundle = {
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: number
  userId: string
}

export type PreviewMemberSignInResult =
  | { status: 'complete'; tokens: PreviewTokenBundle }
  | {
      status: 'error'
      userError: {
        error:
          'INVALID_CREDENTIALS' | 'PREVIEW_AUTH_UNAVAILABLE' | 'RATE_LIMITED'
      }
    }

export const completePreviewMemberSignIn = internalMutation({
  args: {
    email: v.string(),
    isAdmin: v.boolean(),
    fullName: v.union(v.string(), v.null()),
  },
  returns: v.object({
    accessToken: v.string(),
    refreshToken: v.string(),
    refreshTokenExpiresAt: v.number(),
    userId: v.string(),
  }),
  handler: async (ctx, args): Promise<PreviewTokenBundle> => {
    const userId: Id<'users'> = await ctx.runMutation(
      internal.previewMemberAuth.provisionVerifiedMember,
      args,
    )
    const onSignInHandle = await createFunctionHandle(
      internal.authUsers.onSignIn,
    )
    return await ctx.runMutation(
      components.auth.public._internal_dangerous_signIn,
      {
        claims: { method: PREVIEW_MEMBER_PROVIDER_ID, profile: {} },
        componentPath: 'auth',
        userId,
        onSignInHandle,
        ...TTL_CONFIG,
      },
    )
  },
})

function jsonNoStore(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })
}

/**
 * Offentligt HTTP-endepunkt (server-til-server fra preview-deployments):
 * tjekker e-mail + adgangskode og at brugeren har en aktiv medlemsprofil
 * (ikke reserveret til sletning). Svarer ens ved ukendt e-mail, forkert
 * adgangskode, manglende profil og profil under sletning.
 */
export const verifyMember = httpAction(async (ctx, req) => {
  if (req.method !== 'POST') {
    return jsonNoStore({ ok: false }, 405, { Allow: 'POST' })
  }
  if (!globalThis.crypto?.subtle) {
    return jsonNoStore({ ok: false }, 503)
  }

  const text = await req.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return jsonNoStore({ ok: false }, 400)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return jsonNoStore({ ok: false }, 400)
  }

  const validation = validateVerifyRequest(parsed)
  if (!validation.ok) {
    return jsonNoStore({ ok: false }, 400)
  }

  const { email, password } = validation
  let ipHash: string
  let emailHash: string
  try {
    ;[ipHash, emailHash] = await Promise.all([
      hashRateLimitSignal('ip', clientAddress(req.headers)),
      hashRateLimitSignal('email', email || 'empty'),
    ])
  } catch {
    return jsonNoStore({ ok: false }, 503)
  }

  let attempt: { allowed: true } | { allowed: false; retryAfterSeconds: number }
  try {
    attempt = await ctx.runQuery(
      internal.previewMemberAuth.checkVerifyRateLimit,
      { ipHash, emailHash },
    )
  } catch {
    return jsonNoStore({ ok: false }, 503)
  }

  if (!attempt.allowed) {
    return jsonNoStore({ ok: false, error: 'rate_limited' }, 429, {
      'Retry-After': String(attempt.retryAfterSeconds),
    })
  }

  if (!email.includes('@') || password.length === 0) {
    await verifyPassword(password || 'x', DUMMY_SCRYPT_HASH)
    await ctx.runMutation(
      internal.previewMemberAuth.recordFailedVerifyAttempt,
      { ipHash, emailHash },
    )
    return jsonNoStore({ ok: false }, 401)
  }

  const candidate = await ctx.runQuery(
    internal.previewMemberAuth.lookupMemberForVerify,
    { email },
  )

  let passwordValid = false
  if (candidate === null) {
    await verifyPassword(password, DUMMY_SCRYPT_HASH)
  } else if (candidate.source === 'legacy') {
    passwordValid = await verifyPassword(password, candidate.secret)
  } else {
    try {
      const verifyResult = await ctx.runMutation(
        components.authPassword.public.verifyPassword,
        { userId: candidate.userId, password },
      )
      if (verifyResult.success) {
        passwordValid = true
      } else if (
        verifyResult.userError.error === 'PASSWORD_TOO_SHORT' &&
        candidate.legacySecret
      ) {
        passwordValid = await verifyPassword(password, candidate.legacySecret)
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('No password stored for userId')
      ) {
        if (candidate.legacySecret) {
          passwordValid = await verifyPassword(password, candidate.legacySecret)
        } else {
          await verifyPassword(password, DUMMY_SCRYPT_HASH)
          passwordValid = false
        }
      } else {
        throw error
      }
    }
  }

  if (candidate === null || !passwordValid || !candidate.hasActiveProfile) {
    await ctx.runMutation(
      internal.previewMemberAuth.recordFailedVerifyAttempt,
      { ipHash, emailHash },
    )
    return jsonNoStore({ ok: false }, 401)
  }

  return jsonNoStore(
    {
      ok: true,
      member: {
        isAdmin: candidate.isAdmin,
        fullName: candidate.fullName,
      },
    },
    200,
  )
})

export const previewMemberHttpRoutes = [
  {
    path: PREVIEW_VERIFY_MEMBER_PATH,
    method: 'POST' as const,
    handler: verifyMember,
  },
]

/**
 * Preview-side medlemsautorisation: kalder produktionens `/preview/verify-member`
 * server-til-server og udsteder ved godkendelse en lokal preview-session uden
 * nogensinde at gemme produktionsadgangskoden.
 */
export async function performPreviewMemberSignIn(
  ctx: ActionCtx,
  input: { email: string; password: string },
): Promise<PreviewMemberSignInResult> {
  try {
    assertPreviewSeedAllowed({
      previewSeed: env.PREVIEW_SEED,
      cloudUrl: env.CONVEX_CLOUD_URL,
    })
  } catch {
    return {
      status: 'error' as const,
      userError: { error: 'INVALID_CREDENTIALS' as const },
    }
  }

  const email = normalizeAuthEmail(input.email)
  if (
    !email.includes('@') ||
    email.length > EMAIL_MAX_LENGTH ||
    input.password.length === 0 ||
    input.password.length > PASSWORD_MAX_LENGTH
  ) {
    return {
      status: 'error' as const,
      userError: { error: 'INVALID_CREDENTIALS' as const },
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VERIFY_FETCH_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(PROD_VERIFY_MEMBER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: input.password }),
      signal: controller.signal,
    })
  } catch {
    return {
      status: 'error' as const,
      userError: { error: 'PREVIEW_AUTH_UNAVAILABLE' as const },
    }
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 429) {
    return {
      status: 'error' as const,
      userError: { error: 'RATE_LIMITED' as const },
    }
  }
  if (
    response.status === 403 ||
    response.status === 404 ||
    response.status === 405 ||
    response.status >= 500
  ) {
    return {
      status: 'error' as const,
      userError: { error: 'PREVIEW_AUTH_UNAVAILABLE' as const },
    }
  }
  if (!response.ok) {
    return {
      status: 'error' as const,
      userError: { error: 'INVALID_CREDENTIALS' as const },
    }
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return {
      status: 'error' as const,
      userError: { error: 'PREVIEW_AUTH_UNAVAILABLE' as const },
    }
  }

  const verified = parseVerifyMemberResponse(parsed)
  if (verified === null) {
    return {
      status: 'error' as const,
      userError: { error: 'INVALID_CREDENTIALS' as const },
    }
  }

  const tokens = await ctx.runMutation(
    internal.previewMemberAuth.completePreviewMemberSignIn,
    {
      email,
      isAdmin: verified.isAdmin,
      fullName: verified.fullName,
    },
  )
  return { status: 'complete' as const, tokens }
}
