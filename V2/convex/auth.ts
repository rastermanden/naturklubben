import {
  createFunctionHandle,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
} from 'convex/server'
import { v } from 'convex/values'
import { getAuthUserId, setupConvexAuth } from '@convex-dev/auth/server'
import {
  setupEmailPassword,
  type CheckPasswordRecoveryResult,
  type CompleteChangeEmailResult,
  type CompletePasswordRecoveryResult,
  type CompleteSignUpResult,
  type StartChangeEmailResult,
} from '@convex-dev/auth/methods/email-password/server'
import { components, internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { action, env, mutation, query } from './_generated/server'
import { authFromAddress } from './authEmail'
import { hashPassword, isBcryptHash, verifyPassword } from './passwordCrypto'
import { normalizeAuthEmail } from './passwords'
import {
  performPreviewMemberSignIn,
  type PreviewMemberSignInResult,
} from './previewMemberAuth'

/**
 * Convex Auth 2.x med e-mail + adgangskode, bekræftelsesmail og nulstilling,
 * samt bagudkompatibel verifikation af eksisterende medlemskonti (Lucia-Scrypt
 * og importerede Supabase bcrypt-hashes, herunder adgangskoder under 10 tegn).
 *
 * Nye adgangskoder kræver mindst 10 tegn (2.x-standard). Link i mails peger
 * på `/velkommen` og `/ny-adgangskode` med `?code=`.
 */

const ACCESS_TOKEN_TTL_SECONDS = 60
const SESSION_MAX_LIFETIME_SECONDS = 30 * 24 * 60 * 60
const REFRESH_INACTIVITY_TIMEOUT_SECONDS = SESSION_MAX_LIFETIME_SECONDS

const TTL_CONFIG = {
  accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
  refreshInactivityTimeoutSeconds: REFRESH_INACTIVITY_TIMEOUT_SECONDS,
  sessionMaxLifetimeSeconds: SESSION_MAX_LIFETIME_SECONDS,
}

export const NEW_PASSWORD_MIN_LENGTH = 10
const MAX_PASSWORD_LENGTH = 100
const RECOVERY_PURPOSE = 'convexAuth/emailPassword/recovery'
const RECOVERY_TTL_MS = 10 * 60 * 1000
const SIGNUP_LANDING_ROUTE = '/velkommen'
const CHANGE_EMAIL_LANDING_ROUTE = '/indstillinger'
const RECOVERY_LANDING_ROUTE = '/ny-adgangskode'

const LEGACY_RATE_LIMIT_CAPACITY = 10
const LEGACY_RATE_LIMIT_REFILL_MS = 6 * 60 * 1000

export type TokenBundle = {
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: number
  userId: string
}

export type SignUpResult =
  | { success: true; browserSecret: string }
  | {
      success: false
      userError: {
        error: string
        minimumLength?: number
        maximumLength?: number
        retryAfterMs?: number
      }
    }

export type SignInResult =
  | { status: 'complete'; tokens: TokenBundle }
  | {
      status: 'error'
      userError: {
        error: string
        minimumLength?: number
        maximumLength?: number
        retryAfterMs?: number
      }
    }

export type SimpleActionResult =
  | { success: true }
  | {
      success: false
      userError: {
        error: string
        minimumLength?: number
        maximumLength?: number
        retryAfterMs?: number
      }
    }

export type StartRecoveryResult =
  | {
      success: true
      skipped?: boolean
      browserSecret?: string
      sentTo?: string
    }
  | { success: false; userError: { error: string; retryAfterMs?: number } }

const vTokenBundle = v.object({
  accessToken: v.string(),
  refreshToken: v.string(),
  refreshTokenExpiresAt: v.number(),
  userId: v.string(),
})

function siteOrigin(): string {
  return (env.SITE_URL ?? 'https://naturklubben.dk').replace(/\/+$/, '')
}

function appBasePath(): string {
  const raw = (env.APP_BASE_PATH ?? '').trim()
  if (raw.length === 0 || raw === '/') return ''
  return `/${raw.replace(/^\/+|\/+$/g, '')}`
}

function landingUrl(route: string): string {
  return `${siteOrigin()}${appBasePath()}${route}`
}

async function emailSenderConfig(): Promise<{
  kind: 'resend'
  sendEmailHandle: string
  apiKey: string
  from: string
  initialBackoffMs: number
  retryAttempts: number
}> {
  return {
    kind: 'resend',
    sendEmailHandle: await createFunctionHandle(
      internal.authEmailSender.sendEmail,
    ),
    apiKey: env.RESEND_API_KEY ?? '',
    from: authFromAddress(env.AUTH_EMAIL_FROM),
    initialBackoffMs: 30 * 1000,
    retryAttempts: 5,
  }
}

function validatePasswordFormat(
  password: string,
  minimumLength: number,
):
  | { error: 'PASSWORD_TOO_SHORT'; minimumLength: number }
  | { error: 'PASSWORD_TOO_LONG'; maximumLength: number }
  | { error: 'PASSWORD_HAS_SURROUNDING_WHITESPACE' }
  | null {
  const length = [...password].length
  if (length < minimumLength) {
    return { error: 'PASSWORD_TOO_SHORT', minimumLength }
  }
  if (length > MAX_PASSWORD_LENGTH) {
    return {
      error: 'PASSWORD_TOO_LONG',
      maximumLength: MAX_PASSWORD_LENGTH,
    }
  }
  if (password !== password.trim()) {
    return { error: 'PASSWORD_HAS_SURROUNDING_WHITESPACE' }
  }
  return null
}

async function legacyAccountByEmail(
  ctx: QueryCtx | MutationCtx,
  email: string,
): Promise<Doc<'authAccounts'> | null> {
  return await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'password').eq('providerAccountId', email),
    )
    .unique()
}

async function legacyAccountByUserId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'authAccounts'> | null> {
  return await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) =>
      q.eq('userId', userId).eq('provider', 'password'),
    )
    .unique()
}

function refillRateLimit(
  row: Doc<'authRateLimits'> | null,
  now: number,
): { attemptsLeft: number; lastAttemptTime: number } {
  if (row === null) {
    return { attemptsLeft: LEGACY_RATE_LIMIT_CAPACITY, lastAttemptTime: now }
  }
  const elapsed = Math.max(0, now - row.lastAttemptTime)
  const gained = Math.floor(elapsed / LEGACY_RATE_LIMIT_REFILL_MS)
  const attemptsLeft = Math.min(
    LEGACY_RATE_LIMIT_CAPACITY,
    row.attemptsLeft + gained,
  )
  const lastAttemptTime =
    gained > 0
      ? Math.min(
          now,
          row.lastAttemptTime + gained * LEGACY_RATE_LIMIT_REFILL_MS,
        )
      : row.lastAttemptTime
  return { attemptsLeft, lastAttemptTime }
}

async function checkLegacyRateLimit(
  ctx: MutationCtx,
  identifier: string,
  now: number,
): Promise<number | null> {
  const row = await ctx.db
    .query('authRateLimits')
    .withIndex('identifier', (q) => q.eq('identifier', identifier))
    .unique()
  const { attemptsLeft, lastAttemptTime } = refillRateLimit(row, now)
  if (attemptsLeft >= 1) return null
  return Math.max(1000, lastAttemptTime + LEGACY_RATE_LIMIT_REFILL_MS - now)
}

async function recordLegacyFailure(
  ctx: MutationCtx,
  identifier: string,
  now: number,
): Promise<void> {
  const row = await ctx.db
    .query('authRateLimits')
    .withIndex('identifier', (q) => q.eq('identifier', identifier))
    .unique()
  const { attemptsLeft } = refillRateLimit(row, now)
  const nextAttempts = Math.max(0, attemptsLeft - 1)
  if (row === null) {
    await ctx.db.insert('authRateLimits', {
      identifier,
      attemptsLeft: nextAttempts,
      lastAttemptTime: now,
    })
  } else {
    await ctx.db.patch(row._id, {
      attemptsLeft: nextAttempts,
      lastAttemptTime: now,
    })
  }
}

async function clearLegacyFailures(
  ctx: MutationCtx,
  identifier: string,
): Promise<void> {
  const rows = await ctx.db
    .query('authRateLimits')
    .withIndex('identifier', (q) => q.eq('identifier', identifier))
    .collect()
  for (const row of rows) {
    await ctx.db.delete(row._id)
  }
}

async function syncVerifiedUserFields(
  ctx: MutationCtx,
  userId: Id<'users'>,
  email: string,
): Promise<void> {
  const user = await ctx.db.get(userId)
  if (user === null) return
  const normalized = normalizeAuthEmail(email)
  const patch: { email?: string; emailVerificationTime?: number } = {}
  if (user.email !== normalized) patch.email = normalized
  if (user.emailVerificationTime === undefined) {
    patch.emailVerificationTime = Date.now()
  }
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(userId, patch)
  }
}

async function notifyPasswordChanged(
  ctx: MutationCtx,
  to: string,
): Promise<void> {
  await ctx.runMutation(internal.authEmailSender.sendEmail, {
    options: {
      apiKey: env.RESEND_API_KEY ?? '',
      testMode: false,
      initialBackoffMs: 30 * 1000,
      retryAttempts: 5,
    },
    from: authFromAddress(env.AUTH_EMAIL_FROM),
    to: [to],
    subject: 'Your password was changed',
    text:
      'The password of your account was changed.\n\n' +
      'If you did this, you can ignore this email. If you did not do this, change your password immediately or contact support.',
  })
}

const auth = setupConvexAuth({ component: components.auth })
export const { signOut, refreshSession, isAuthenticated } = auth

const baseEmailPassword = setupEmailPassword(auth, {
  component: components.authEmail,
  passwordComponent: components.authPassword,
  emailSender: {
    kind: 'resend',
    sendEmail: internal.authEmailSender.sendEmail,
    apiKey: env.RESEND_API_KEY ?? '',
    from: authFromAddress(env.AUTH_EMAIL_FROM),
  },
  urls: {
    signUp: landingUrl(SIGNUP_LANDING_ROUTE),
    changeEmail: landingUrl(CHANGE_EMAIL_LANDING_ROUTE),
    recovery: landingUrl(RECOVERY_LANDING_ROUTE),
  },
}).attachUserCallbacks({
  createUser: internal.authUsers.createUser as never,
  onSignIn: internal.authUsers.onSignIn as never,
})

export const completeSignUpWithEmailPassword =
  baseEmailPassword.completeSignUpWithEmailPassword as RegisteredMutation<
    'public',
    { emailCode: string; browserSecret: string },
    Promise<CompleteSignUpResult>
  >
export const startChangeEmail =
  baseEmailPassword.startChangeEmail as RegisteredMutation<
    'public',
    { newEmail: string; currentPassword: string },
    Promise<StartChangeEmailResult>
  >
export const completeChangeEmail =
  baseEmailPassword.completeChangeEmail as RegisteredMutation<
    'public',
    { emailCode: string; browserSecret: string },
    Promise<CompleteChangeEmailResult>
  >

export const signUpWithEmailPassword: RegisteredMutation<
  'public',
  { email: string; password: string; fullName?: string },
  Promise<SignUpResult>
> = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    fullName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SignUpResult> => {
    const email = normalizeAuthEmail(args.email)
    const decision = await ctx.runQuery(internal.authMailGate.decide, {
      email,
      kind: 'verify',
    })
    if (decision === 'deny') {
      return {
        success: false,
        userError: { error: 'EMAIL_NOT_ALLOWED' },
      }
    }

    const legacyExisting = await legacyAccountByEmail(ctx, email)
    if (legacyExisting !== null) {
      return {
        success: false,
        userError: { error: 'EMAIL_TAKEN' },
      }
    }

    const emailError = await ctx.runMutation(
      components.authEmail.challenge.signUp.check,
      { email },
    )
    if (emailError !== null) {
      return { success: false, userError: emailError }
    }

    const formatError = validatePasswordFormat(
      args.password,
      NEW_PASSWORD_MIN_LENGTH,
    )
    if (formatError !== null) {
      return { success: false, userError: formatError }
    }

    const cleanName = args.fullName?.trim()
    const userId = await ctx.db.insert('users', {
      email,
      ...(cleanName && cleanName.length > 0 ? { name: cleanName } : {}),
    })

    const setResult = await ctx.runMutation(
      components.authPassword.public._internal_dangerous_setPassword,
      {
        userId,
        password: args.password,
        minimumLength: NEW_PASSWORD_MIN_LENGTH,
      },
    )
    if (!setResult.success) {
      await ctx.db.delete(userId)
      return { success: false, userError: setResult.userError }
    }

    const start = await ctx.runMutation(
      components.authEmail.challenge.signUp._internal_dangerous_start,
      {
        email,
        userId,
        url: landingUrl(SIGNUP_LANDING_ROUTE),
        emailSender: await emailSenderConfig(),
      },
    )
    if (!start.success) {
      throw new Error(
        `Unexpected error starting email verification: ${start.userError.error}`,
      )
    }

    await ctx.runMutation(components.auth.public.markUserIdCreated, {
      userId,
    })

    return { success: true, browserSecret: start.browserSecret }
  },
})

export const signInWithEmailPassword: RegisteredMutation<
  'public',
  { email: string; password: string },
  Promise<SignInResult>
> = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  returns: v.union(
    v.object({ status: v.literal('complete'), tokens: vTokenBundle }),
    v.object({ status: v.literal('error'), userError: v.any() }),
  ),
  handler: async (ctx, args): Promise<SignInResult> => {
    const email = normalizeAuthEmail(args.email)
    const onSignInHandle = await createFunctionHandle(
      internal.authUsers.onSignIn,
    )

    const lookup = await ctx.runMutation(
      components.authEmail.verifiedEmails.lookupEmail,
      { email },
    )
    if (!lookup.success && lookup.userError.error === 'RATE_LIMITED') {
      return { status: 'error', userError: lookup.userError }
    }

    if (lookup.success) {
      const verifyResult = await ctx.runMutation(
        components.authPassword.public.verifyPassword,
        { userId: lookup.userId, password: args.password },
      )
      if (!verifyResult.success) {
        return { status: 'error', userError: verifyResult.userError }
      }
      const tokens = await ctx.runMutation(
        components.auth.public._internal_dangerous_signIn,
        {
          claims: { method: 'emailPassword', profile: {} },
          componentPath: 'authPassword',
          userId: lookup.userId,
          onSignInHandle,
          ...TTL_CONFIG,
        },
      )
      return { status: 'complete', tokens }
    }

    // Bagudkompatibilitet: eksisterende v1-konti ligger i `authAccounts`
    // (Lucia-Scrypt eller importeret bcrypt, evt. < 8 tegn).
    const legacy = await legacyAccountByEmail(ctx, email)
    if (legacy === null || typeof legacy.secret !== 'string') {
      return {
        status: 'error',
        userError: { error: 'USER_NOT_FOUND' },
      }
    }

    const now = Date.now()
    const rateKey = `legacy-signin:${email}`
    const retryAfterMs = await checkLegacyRateLimit(ctx, rateKey, now)
    if (retryAfterMs !== null) {
      return {
        status: 'error',
        userError: { error: 'RATE_LIMITED', retryAfterMs },
      }
    }

    const valid = await verifyPassword(args.password, legacy.secret)
    if (!valid) {
      await recordLegacyFailure(ctx, rateKey, now)
      return {
        status: 'error',
        userError: { error: 'INVALID_CREDENTIALS' },
      }
    }

    await clearLegacyFailures(ctx, rateKey)
    if (isBcryptHash(legacy.secret)) {
      await ctx.db.patch(legacy._id, {
        secret: await hashPassword(args.password),
      })
    }
    await syncVerifiedUserFields(ctx, legacy.userId, email)

    const tokens = await ctx.runMutation(
      components.auth.public._internal_dangerous_signIn,
      {
        claims: { method: 'emailPassword', profile: {} },
        componentPath: 'auth',
        userId: legacy.userId,
        onSignInHandle,
        ...TTL_CONFIG,
      },
    )
    return { status: 'complete', tokens }
  },
})

export const changePassword: RegisteredMutation<
  'public',
  {
    currentPassword: string
    newPassword: string
    signOutOtherSessions?: boolean
  },
  Promise<SimpleActionResult>
> = mutation({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
    signOutOtherSessions: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<SimpleActionResult> => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) {
      return { success: false, userError: { error: 'NOT_LOGGED_IN' } }
    }

    const newPasswordError = validatePasswordFormat(
      args.newPassword,
      NEW_PASSWORD_MIN_LENGTH,
    )
    if (newPasswordError !== null) {
      return { success: false, userError: newPasswordError }
    }

    const v2Verify = await ctx.runMutation(
      components.authPassword.public.verifyPassword,
      { userId, password: args.currentPassword },
    )
    if (!v2Verify.success) {
      if (v2Verify.userError.error === 'RATE_LIMITED') {
        return { success: false, userError: v2Verify.userError }
      }
      const legacy = await legacyAccountByUserId(ctx, userId)
      const legacyValid =
        legacy?.secret !== undefined &&
        (await verifyPassword(args.currentPassword, legacy.secret))
      if (!legacyValid) {
        return {
          success: false,
          userError: { error: 'INVALID_CREDENTIALS' },
        }
      }
    }

    const setResult = await ctx.runMutation(
      components.authPassword.public._internal_dangerous_setPassword,
      {
        userId,
        password: args.newPassword,
        minimumLength: NEW_PASSWORD_MIN_LENGTH,
      },
    )
    if (!setResult.success) {
      return { success: false, userError: setResult.userError }
    }

    if (args.signOutOtherSessions) {
      const identity = await ctx.auth.getUserIdentity()
      const currentSessionId = identity?.subject
      const sessions = await ctx.runQuery(components.auth.public.listSessions, {
        userId,
      })
      const otherIds = sessions
        .map((s) => s.sessionId)
        .filter((id) => id !== currentSessionId)
      if (otherIds.length > 0) {
        await ctx.runMutation(components.auth.public.revokeSessions, {
          sessionIds: otherIds,
        })
      }
    }

    const primaryEmail =
      (await ctx.runQuery(components.authEmail.verifiedEmails.getPrimaryEmail, {
        userId,
      })) ?? (await ctx.db.get(userId))?.email
    if (primaryEmail) {
      await notifyPasswordChanged(ctx, primaryEmail)
    }

    return { success: true }
  },
})

export const startPasswordRecovery: RegisteredMutation<
  'public',
  { email: string },
  Promise<StartRecoveryResult>
> = mutation({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<StartRecoveryResult> => {
    const email = normalizeAuthEmail(args.email)
    const lookup = await ctx.runMutation(
      components.authEmail.verifiedEmails.lookupEmail,
      { email },
    )
    if (!lookup.success && lookup.userError.error === 'RATE_LIMITED') {
      return { success: false, userError: lookup.userError }
    }

    const legacy = lookup.success
      ? null
      : await legacyAccountByEmail(ctx, email)
    const hasAccount = lookup.success || legacy !== null

    const decision = await ctx.runQuery(internal.authMailGate.decide, {
      email,
      kind: 'reset',
      hasAccountOverride: hasAccount,
    })
    if (decision === 'skip' || decision === 'deny') {
      return { success: true, skipped: true }
    }
    if (!hasAccount) {
      return {
        success: false,
        userError: { error: 'EMAIL_NOT_FOUND' },
      }
    }

    const targetEmail = lookup.success ? lookup.storedEmail : email
    const start = await ctx.runMutation(
      components.authEmail.challenge.custom.start,
      {
        email: targetEmail,
        purpose: RECOVERY_PURPOSE,
        expectedUserId: null,
        url: landingUrl(RECOVERY_LANDING_ROUTE),
        emailSender: await emailSenderConfig(),
        ttlMs: RECOVERY_TTL_MS,
        subject: 'Reset your password',
        intro: 'Open this link to reset your password:',
      },
    )
    if (!start.success) {
      return { success: false, userError: start.userError }
    }
    return {
      success: true,
      browserSecret: start.browserSecret,
      sentTo: targetEmail,
    }
  },
})

type RecoveryLinkError = Extract<
  CheckPasswordRecoveryResult,
  { success: false }
>['userError']

function narrowRecoveryLinkError(
  err:
    | { error: 'INVALID_CHALLENGE' }
    | { error: 'INCORRECT_CODE' }
    | { error: 'WRONG_USER' },
): RecoveryLinkError {
  if (err.error === 'WRONG_USER') {
    return { error: 'INVALID_CHALLENGE' }
  }
  return err
}

export const checkPasswordRecovery: RegisteredQuery<
  'public',
  { emailCode: string; browserSecret: string },
  Promise<CheckPasswordRecoveryResult>
> = query({
  args: { emailCode: v.string(), browserSecret: v.string() },
  handler: async (ctx, args): Promise<CheckPasswordRecoveryResult> => {
    const peek = await ctx.runQuery(
      components.authEmail.challenge.custom.peek,
      {
        emailCode: args.emailCode,
        browserSecret: args.browserSecret,
        purpose: RECOVERY_PURPOSE,
        currentUserId: null,
      },
    )
    if (!peek.success) {
      return {
        success: false,
        userError: narrowRecoveryLinkError(peek.userError),
      }
    }
    if (peek.emailOwnerId !== null && peek.emailOwnerId !== undefined) {
      return { success: true }
    }
    const legacy = await legacyAccountByEmail(
      ctx,
      normalizeAuthEmail(peek.email),
    )
    if (legacy === null) {
      return {
        success: false,
        userError: { error: 'INVALID_CHALLENGE' },
      }
    }
    return { success: true }
  },
})

export const completePasswordRecovery: RegisteredMutation<
  'public',
  { emailCode: string; browserSecret: string; newPassword: string },
  Promise<CompletePasswordRecoveryResult>
> = mutation({
  args: {
    emailCode: v.string(),
    browserSecret: v.string(),
    newPassword: v.string(),
  },
  returns: v.union(
    v.object({ status: v.literal('complete'), tokens: vTokenBundle }),
    v.object({ status: v.literal('error'), userError: v.any() }),
  ),
  handler: async (ctx, args): Promise<CompletePasswordRecoveryResult> => {
    const passwordError = validatePasswordFormat(
      args.newPassword,
      NEW_PASSWORD_MIN_LENGTH,
    )
    if (passwordError !== null) {
      return { status: 'error', userError: passwordError }
    }

    const peek = await ctx.runQuery(
      components.authEmail.challenge.custom.peek,
      {
        emailCode: args.emailCode,
        browserSecret: args.browserSecret,
        purpose: RECOVERY_PURPOSE,
        currentUserId: null,
      },
    )
    if (!peek.success) {
      return {
        status: 'error',
        userError: narrowRecoveryLinkError(peek.userError),
      }
    }

    let userId: Id<'users'>
    let targetEmail: string

    if (peek.emailOwnerId !== null && peek.emailOwnerId !== undefined) {
      const complete = await ctx.runMutation(
        components.authEmail.challenge.custom.complete,
        {
          emailCode: args.emailCode,
          browserSecret: args.browserSecret,
          purpose: RECOVERY_PURPOSE,
          currentUserId: null,
        },
      )
      if (!complete.success) {
        return {
          status: 'error',
          userError: narrowRecoveryLinkError(complete.userError),
        }
      }
      if (!complete.emailOwnerId) {
        return {
          status: 'error',
          userError: { error: 'INVALID_CHALLENGE' },
        }
      }
      userId = complete.emailOwnerId as Id<'users'>
      targetEmail = complete.email
    } else {
      const normalized = normalizeAuthEmail(peek.email)
      const legacy = await legacyAccountByEmail(ctx, normalized)
      if (legacy === null) {
        return {
          status: 'error',
          userError: { error: 'INVALID_CHALLENGE' },
        }
      }
      const existingEmails = await ctx.runQuery(
        components.authEmail.verifiedEmails.getEmails,
        { userId: legacy.userId },
      )
      if (existingEmails.length === 0) {
        const complete = await ctx.runMutation(
          components.authEmail.challenge.custom
            ._internal_dangerous_completeForNewUser,
          {
            emailCode: args.emailCode,
            browserSecret: args.browserSecret,
            purpose: RECOVERY_PURPOSE,
            userId: legacy.userId,
          },
        )
        if (!complete.success) {
          if (complete.userError.error === 'EMAIL_TAKEN') {
            return {
              status: 'error',
              userError: { error: 'INVALID_CHALLENGE' },
            }
          }
          return { status: 'error', userError: complete.userError }
        }
        targetEmail = complete.email
      } else {
        const complete = await ctx.runMutation(
          components.authEmail.challenge.custom.complete,
          {
            emailCode: args.emailCode,
            browserSecret: args.browserSecret,
            purpose: RECOVERY_PURPOSE,
            currentUserId: null,
          },
        )
        if (!complete.success) {
          return {
            status: 'error',
            userError: narrowRecoveryLinkError(complete.userError),
          }
        }
        targetEmail = complete.email
      }
      userId = legacy.userId
    }

    const setResult = await ctx.runMutation(
      components.authPassword.public._internal_dangerous_setPassword,
      {
        userId,
        password: args.newPassword,
        minimumLength: NEW_PASSWORD_MIN_LENGTH,
      },
    )
    if (!setResult.success) {
      return { status: 'error', userError: setResult.userError }
    }

    await syncVerifiedUserFields(ctx, userId, targetEmail)
    await ctx.runMutation(components.auth.public.markUserIdCreated, {
      userId,
    })

    const sessions = await ctx.runQuery(components.auth.public.listSessions, {
      userId,
    })
    if (sessions.length > 0) {
      await ctx.runMutation(components.auth.public.revokeSessions, {
        sessionIds: sessions.map((s) => s.sessionId),
      })
    }

    const onSignInHandle = await createFunctionHandle(
      internal.authUsers.onSignIn,
    )
    const tokens = await ctx.runMutation(
      components.auth.public._internal_dangerous_signIn,
      {
        claims: { method: 'emailPassword', profile: {} },
        componentPath: 'authEmail',
        userId,
        onSignInHandle,
        ...TTL_CONFIG,
      },
    )

    const primaryEmail =
      (await ctx.runQuery(components.authEmail.verifiedEmails.getPrimaryEmail, {
        userId,
      })) ?? targetEmail
    await notifyPasswordChanged(ctx, primaryEmail)

    return { status: 'complete', tokens }
  },
})

export const signInWithPreviewMember: RegisteredAction<
  'public',
  { email: string; password: string },
  Promise<PreviewMemberSignInResult>
> = action({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<PreviewMemberSignInResult> => {
    return await performPreviewMemberSignIn(ctx, args)
  },
})
