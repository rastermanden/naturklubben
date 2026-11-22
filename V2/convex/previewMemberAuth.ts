import { ConvexError, v, type Value } from 'convex/values'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { ActionCtx } from './_generated/server'
import {
  env,
  httpAction,
  internalMutation,
  internalQuery,
} from './_generated/server'
import { verifyPassword } from './passwordCrypto'
import { normalizeAuthEmail } from './passwords'
import { assertPreviewSeedAllowed, PROD_DEPLOYMENT_SLUG } from './previewSeed'

/**
 * Medlemslogin på V2 PR-previews uden delt adgangskode.
 *
 * Produktions-deploymentet (`quaint-parakeet-652`) udstiller
 * `POST /preview/verify-member`. Et PR-preview kalder denne rute
 * server-til-server fra Convex Auth-udbyderen `preview-member`, verificerer
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

const WINDOW_15_MINUTES_MS = 15 * 60 * 1000
const WINDOW_24_HOURS_MS = 24 * 60 * 60 * 1000
const ATTEMPT_RETENTION_MS = 25 * 60 * 60 * 1000

export const MAX_PER_EMAIL_15_MINUTES = 10
export const MAX_PER_EMAIL_24_HOURS = 25
export const MAX_PER_IP_15_MINUTES = 30
export const MAX_PER_IP_24_HOURS = 150
export const MAX_GLOBAL_24_HOURS = 500

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
 * Klientens IP-adresse fra HTTP-headere, udelukkende til rate limiting.
 * Rå IP gemmes aldrig; den hashes med det samme.
 */
export function clientAddress(headers: Headers): string {
  const direct = headers.get('cf-connecting-ip')
  if (direct && !direct.includes(',')) {
    const trimmed = direct.trim()
    if (trimmed.length > 0) return trimmed
  }

  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first

  return 'unknown'
}

/**
 * Hasher IP og e-mail til rate-limit-tabellen, så rå adresser aldrig gemmes.
 * Bruger `RATE_LIMIT_HASH_SECRET` hvis den er sat, ellers en domæneadskilt
 * nøgle udledt af `JWT_PRIVATE_KEY` (som allerede findes på deploymentet), og
 * falder i lokale test uden miljønøgler tilbage til domæneadskilt SHA-256.
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

export const recordVerifyAttempt = internalMutation({
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
    const perEmailShort = await ctx.db
      .query('previewVerifyAttempts')
      .withIndex('by_email_and_time', (q) =>
        q
          .eq('emailHash', args.emailHash)
          .gt('attemptedAt', now - WINDOW_15_MINUTES_MS),
      )
      .collect()
    const perEmailDay = await ctx.db
      .query('previewVerifyAttempts')
      .withIndex('by_email_and_time', (q) =>
        q
          .eq('emailHash', args.emailHash)
          .gt('attemptedAt', now - WINDOW_24_HOURS_MS),
      )
      .collect()
    const perIpShort = await ctx.db
      .query('previewVerifyAttempts')
      .withIndex('by_ip_and_time', (q) =>
        q
          .eq('ipHash', args.ipHash)
          .gt('attemptedAt', now - WINDOW_15_MINUTES_MS),
      )
      .collect()
    const perIpDay = await ctx.db
      .query('previewVerifyAttempts')
      .withIndex('by_ip_and_time', (q) =>
        q.eq('ipHash', args.ipHash).gt('attemptedAt', now - WINDOW_24_HOURS_MS),
      )
      .collect()
    const globalDay = await ctx.db
      .query('previewVerifyAttempts')
      .withIndex('by_attempted_at', (q) =>
        q.gt('attemptedAt', now - WINDOW_24_HOURS_MS),
      )
      .collect()

    const waits = [
      waitForSlot(
        perEmailShort.map((row) => row.attemptedAt),
        MAX_PER_EMAIL_15_MINUTES,
        WINDOW_15_MINUTES_MS,
      ),
      waitForSlot(
        perEmailDay.map((row) => row.attemptedAt),
        MAX_PER_EMAIL_24_HOURS,
        WINDOW_24_HOURS_MS,
      ),
      waitForSlot(
        perIpShort.map((row) => row.attemptedAt),
        MAX_PER_IP_15_MINUTES,
        WINDOW_15_MINUTES_MS,
      ),
      waitForSlot(
        perIpDay.map((row) => row.attemptedAt),
        MAX_PER_IP_24_HOURS,
        WINDOW_24_HOURS_MS,
      ),
      waitForSlot(
        globalDay.map((row) => row.attemptedAt),
        MAX_GLOBAL_24_HOURS,
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

    await ctx.db.insert('previewVerifyAttempts', {
      ipHash: args.ipHash,
      emailHash: args.emailHash,
      attemptedAt: now,
    })
    return { allowed: true }
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
      secret: v.string(),
      hasActiveProfile: v.boolean(),
      isAdmin: v.boolean(),
      fullName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<{
    secret: string
    hasActiveProfile: boolean
    isAdmin: boolean
    fullName: string | null
  } | null> => {
    const email = normalizeAuthEmail(args.email)
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'password').eq('providerAccountId', email),
      )
      .unique()
    if (
      account === null ||
      typeof account.secret !== 'string' ||
      account.secret.length === 0
    ) {
      return null
    }

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', account.userId))
      .unique()
    const hasActiveProfile =
      profile !== null && profile.deletionReservedAt === undefined
    const trimmedName = profile?.fullName?.trim() ?? ''
    return {
      secret: account.secret,
      hasActiveProfile,
      isAdmin: profile?.isAdmin === true,
      fullName: trimmedName.length > 0 ? trimmedName : null,
    }
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
    const existingPasswordAccount =
      existingPreviewAccount !== null
        ? null
        : await ctx.db
            .query('authAccounts')
            .withIndex('providerAndAccountId', (q) =>
              q.eq('provider', 'password').eq('providerAccountId', email),
            )
            .unique()
    const existingUser =
      existingPreviewAccount !== null || existingPasswordAccount !== null
        ? null
        : await ctx.db
            .query('users')
            .withIndex('email', (q) => q.eq('email', email))
            .first()

    let userId: Id<'users'>
    if (existingPreviewAccount !== null) {
      userId = existingPreviewAccount.userId
    } else if (existingPasswordAccount !== null) {
      userId = existingPasswordAccount.userId
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
    } else if (existingPreviewAccount.emailVerified !== email) {
      await ctx.db.patch(existingPreviewAccount._id, { emailVerified: email })
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

    return userId
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
    attempt = await ctx.runMutation(
      internal.previewMemberAuth.recordVerifyAttempt,
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
    return jsonNoStore({ ok: false }, 401)
  }

  const candidate = await ctx.runQuery(
    internal.previewMemberAuth.lookupMemberForVerify,
    { email },
  )
  const hashToCheck = candidate?.secret ?? DUMMY_SCRYPT_HASH
  const passwordValid = await verifyPassword(password, hashToCheck)
  if (candidate === null || !passwordValid || !candidate.hasActiveProfile) {
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
 * Preview-side `ConvexCredentials`-autorisation: kalder produktionens
 * `/preview/verify-member` server-til-server og udsteder ved godkendelse en
 * lokal preview-session uden nogensinde at gemme produktionsadgangskoden.
 */
export async function authorizePreviewMember(
  params: Partial<Record<string, Value | undefined>>,
  ctx: ActionCtx,
): Promise<{ userId: Id<'users'> }> {
  try {
    assertPreviewSeedAllowed({
      previewSeed: env.PREVIEW_SEED,
      cloudUrl: env.CONVEX_CLOUD_URL,
    })
  } catch {
    throw new ConvexError('INVALID_CREDENTIALS')
  }

  const rawEmail = params.email
  const rawPassword = params.password
  if (typeof rawEmail !== 'string' || typeof rawPassword !== 'string') {
    throw new ConvexError('INVALID_CREDENTIALS')
  }
  const email = normalizeAuthEmail(rawEmail)
  if (
    !email.includes('@') ||
    email.length > EMAIL_MAX_LENGTH ||
    rawPassword.length === 0 ||
    rawPassword.length > PASSWORD_MAX_LENGTH
  ) {
    throw new ConvexError('INVALID_CREDENTIALS')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VERIFY_FETCH_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(PROD_VERIFY_MEMBER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: rawPassword }),
      signal: controller.signal,
    })
  } catch {
    throw new ConvexError('PREVIEW_AUTH_UNAVAILABLE')
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 429) {
    throw new ConvexError('RATE_LIMITED')
  }
  if (response.status >= 500) {
    throw new ConvexError('PREVIEW_AUTH_UNAVAILABLE')
  }
  if (!response.ok) {
    throw new ConvexError('INVALID_CREDENTIALS')
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new ConvexError('PREVIEW_AUTH_UNAVAILABLE')
  }

  const verified = parseVerifyMemberResponse(parsed)
  if (verified === null) {
    throw new ConvexError('INVALID_CREDENTIALS')
  }

  const userId: Id<'users'> = await ctx.runMutation(
    internal.previewMemberAuth.provisionVerifiedMember,
    {
      email,
      isAdmin: verified.isAdmin,
      fullName: verified.fullName,
    },
  )
  return { userId }
}
