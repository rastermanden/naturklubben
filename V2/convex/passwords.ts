import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import { components, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { action, internalMutation, internalQuery } from './_generated/server'
import { hashPassword, isBcryptHash, verifyBcrypt } from './passwordCrypto'

const MIN_LEGACY_PASSWORD_LENGTH = 6
export const NEW_PASSWORD_MIN_LENGTH = 10
/** Skal sendes med, så et almindeligt `convex run` ikke importerer hashes. */
export const PASSWORD_IMPORT_CONFIRM = 'IMPORT_BCRYPT_HASHES'
/** Eksplicit bekræftelse til manuel engangsmigrering af v1-brugerdata. */
export const V1_AUTH_MIGRATION_CONFIRM = 'MIGRATE_V1_AUTH_TO_V2'

export function assertPasswordLength(password: string): void {
  if (password.length < MIN_LEGACY_PASSWORD_LENGTH) {
    throw new Error('Password should be at least 6 characters')
  }
}

export function normalizeAuthEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * `profiles.is_admin` fra Supabase. Listen bootstraper nye oprettelser,
 * og en profil, der allerede findes, får den samme rolle.
 */
export async function applyImportedAdmin(
  ctx: MutationCtx,
  email: string,
  isAdmin: boolean,
): Promise<void> {
  const normalized = normalizeAuthEmail(email)
  const allowedRows = await ctx.db
    .query('allowedEmails')
    .withIndex('by_email', (q) => q.eq('email', normalized))
    .collect()
  const [allowed, ...extraAllowed] = allowedRows
  for (const dup of extraAllowed) await ctx.db.delete(dup._id)
  if (allowed === undefined) {
    await ctx.db.insert('allowedEmails', { email: normalized, isAdmin })
  } else if ((allowed.isAdmin ?? false) !== isAdmin) {
    await ctx.db.patch(allowed._id, { isAdmin })
  }

  const account = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'password').eq('providerAccountId', normalized),
    )
    .unique()
  let userId = account?.userId ?? null
  if (userId === null) {
    const user = (
      await ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', normalized))
        .collect()
    ).find((row) => row.emailVerificationTime !== undefined)
    userId = user?._id ?? null
  }
  if (userId === null) return
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  if (profile !== null && profile.isAdmin !== isAdmin) {
    await ctx.db.patch(profile._id, { isAdmin })
  }
}

/**
 * Lægger en bcrypt-hash fra Supabase (`auth.users.encrypted_password`) ind
 * som kontoens hemmelighed, uden at hashe den igen. Første rigtige login
 * verificerer den og skriver den om til Argon2id.
 */
export async function writeImportedPassword(
  ctx: MutationCtx,
  input: {
    email: string
    bcryptHash: string
    name?: string
    isAdmin?: boolean
  },
): Promise<Id<'users'>> {
  const email = normalizeAuthEmail(input.email)
  if (!email.includes('@')) throw new ConvexError('INVALID_IMPORT_EMAIL')
  if (!isBcryptHash(input.bcryptHash)) {
    throw new ConvexError('NOT_A_BCRYPT_HASH')
  }

  const existing = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'password').eq('providerAccountId', email),
    )
    .unique()
  if (existing) {
    await ctx.db.patch(existing._id, {
      secret: input.bcryptHash,
      emailVerified: email,
    })
    if (input.isAdmin !== undefined) {
      await applyImportedAdmin(ctx, email, input.isAdmin)
    }
    return existing.userId
  }

  const userId = await ctx.db.insert('users', {
    email,
    ...(input.name ? { name: input.name } : {}),
    emailVerificationTime: Date.now(),
  })
  await ctx.db.insert('authAccounts', {
    userId,
    provider: 'password',
    providerAccountId: email,
    secret: input.bcryptHash,
    emailVerified: email,
  })
  if (input.isAdmin !== undefined) {
    await applyImportedAdmin(ctx, email, input.isAdmin)
  }
  return userId
}

export type RehashResult = 'skipped' | 'rehashed' | 'mismatch'

/** Bytter en bcrypt-hash ud med Argon2id, når adgangskoden er den rigtige. */
export async function rehashImportedPassword(
  ctx: MutationCtx,
  email: string,
  password: string,
): Promise<RehashResult> {
  const normalized = normalizeAuthEmail(email)
  const account = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'password').eq('providerAccountId', normalized),
    )
    .unique()
  if (!account?.secret || !isBcryptHash(account.secret)) return 'skipped'
  if (!verifyBcrypt(password, account.secret)) return 'mismatch'
  await ctx.db.patch(account._id, {
    secret: await hashPassword(password),
  })
  return 'rehashed'
}

export const rehashOnSignIn = internalMutation({
  args: { email: v.string(), password: v.string() },
  returns: v.union(
    v.literal('skipped'),
    v.literal('rehashed'),
    v.literal('mismatch'),
  ),
  handler: async (ctx, args): Promise<RehashResult> => {
    return await rehashImportedPassword(ctx, args.email, args.password)
  },
})

export const importHashes = internalMutation({
  args: {
    confirm: v.string(),
    accounts: v.array(
      v.object({
        email: v.string(),
        bcryptHash: v.string(),
        name: v.optional(v.string()),
        isAdmin: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    if (args.confirm !== PASSWORD_IMPORT_CONFIRM) {
      throw new ConvexError('PASSWORD_IMPORT_NOT_CONFIRMED')
    }
    let written = 0
    for (const account of args.accounts) {
      await writeImportedPassword(ctx, account)
      written += 1
    }
    return written
  },
})

export const emailForPasswordUser = internalQuery({
  args: { userId: v.id('users') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const verified = await ctx.runQuery(
      components.authEmail.verifiedEmails.getPrimaryEmail,
      { userId: args.userId },
    )
    if (typeof verified === 'string' && verified.includes('@')) {
      return normalizeAuthEmail(verified)
    }

    const account = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', args.userId).eq('provider', 'password'),
      )
      .unique()
    const id = account?.providerAccountId
    if (typeof id === 'string' && id.includes('@')) {
      return normalizeAuthEmail(id)
    }

    const user = await ctx.db.get(args.userId)
    return typeof user?.email === 'string' && user.email.includes('@')
      ? normalizeAuthEmail(user.email)
      : null
  },
})

/**
 * Efter et lykkedes login: byt en importeret bcrypt-hash ud med Argon2id.
 * Forkert eller allerede omskrevet hash gør ingenting.
 */
export const rehashIfImported = action({
  args: { password: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await getAuthUserId(ctx as never)
    if (userId === null) return null
    const email: string | null = await ctx.runQuery(
      internal.passwords.emailForPasswordUser,
      { userId },
    )
    if (email === null) return null
    await ctx.runMutation(internal.passwords.rehashOnSignIn, {
      email,
      password: args.password,
    })
    return null
  },
})

export const setPasswordForUser = internalMutation({
  args: { userId: v.id('users'), password: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const res = await ctx.runMutation(
      components.authPassword.public._internal_dangerous_setPassword,
      {
        userId: args.userId,
        password: args.password,
        minimumLength: NEW_PASSWORD_MIN_LENGTH,
      },
    )
    if (!res.success) {
      throw new ConvexError(res.userError.error)
    }
    return null
  },
})

/**
 * Om adressen har en adgangskode-konto og (for v1) en kode, der ikke er udløbet.
 * Returnerer ingen kode, hash eller adresse.
 */
export const resetCodeStatus = internalQuery({
  args: { email: v.string() },
  returns: v.object({
    account: v.boolean(),
    unexpiredCode: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ account: boolean; unexpiredCode: boolean }> => {
    const email = normalizeAuthEmail(args.email)
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'password').eq('providerAccountId', email),
      )
      .unique()
    if (account !== null) {
      const codes = await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))
        .collect()
      return {
        account: true,
        unexpiredCode: codes.some((code) => code.expirationTime > Date.now()),
      }
    }

    const verifiedUser = (
      await ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', email))
        .collect()
    ).find((row) => row.emailVerificationTime !== undefined)
    return {
      account: verifiedUser !== undefined,
      unexpiredCode: false,
    }
  },
})

/** Kun en @agentmail.to-adresse. Rigtige medlemmer kan ikke slettes her. */
export const SMOKE_DELETE_CONFIRM = 'DELETE_SMOKE_AUTH_USER'

/**
 * Fjerner en midlertidig testkonto efter et nulstillings-tjek.
 * Bekræftelsen og domænet er begge krævet, så kaldet ikke kan ramme et medlem.
 */
export const deleteSmokeAuthUser = internalMutation({
  args: { confirm: v.string(), email: v.string() },
  returns: v.object({ deletedAccounts: v.number() }),
  handler: async (ctx, args): Promise<{ deletedAccounts: number }> => {
    if (args.confirm !== SMOKE_DELETE_CONFIRM) {
      throw new ConvexError('NOT_CONFIRMED')
    }
    const email = normalizeAuthEmail(args.email)
    if (!email.endsWith('@agentmail.to')) {
      throw new ConvexError('SMOKE_EMAIL_ONLY')
    }

    const accounts = [
      ...(await ctx.db
        .query('authAccounts')
        .withIndex('providerAndAccountId', (q) =>
          q.eq('provider', 'password').eq('providerAccountId', email),
        )
        .collect()),
      ...(await ctx.db
        .query('authAccounts')
        .withIndex('providerAndAccountId', (q) =>
          q.eq('provider', 'password-reset').eq('providerAccountId', email),
        )
        .collect()),
    ]
    const v2Users = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .collect()
    const userIds = [
      ...new Set([
        ...accounts.map((account) => account.userId),
        ...v2Users.map((user) => user._id),
      ]),
    ]

    for (const account of accounts) {
      const codes = await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))
        .collect()
      for (const code of codes) await ctx.db.delete(code._id)
      await ctx.db.delete(account._id)
    }

    for (const userId of userIds) {
      const v2Sessions = await ctx.runQuery(
        components.auth.public.listSessions,
        { userId },
      )
      if (v2Sessions.length > 0) {
        await ctx.runMutation(components.auth.public.revokeSessions, {
          sessionIds: v2Sessions.map((s) => s.sessionId),
        })
      }
      await ctx.runMutation(components.authEmail.verifiedEmails.deleteUser, {
        userId,
      })

      const sessions = await ctx.db
        .query('authSessions')
        .withIndex('userId', (q) => q.eq('userId', userId))
        .collect()
      for (const session of sessions) {
        const refreshTokens = await ctx.db
          .query('authRefreshTokens')
          .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
          .collect()
        for (const refreshToken of refreshTokens) {
          await ctx.db.delete(refreshToken._id)
        }
        await ctx.db.delete(session._id)
      }
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique()
      if (profile !== null) await ctx.db.delete(profile._id)
      const user = await ctx.db.get(userId)
      if (user !== null) await ctx.db.delete(userId)
    }

    const limits = await ctx.db
      .query('authRateLimits')
      .withIndex('identifier', (q) => q.eq('identifier', email))
      .collect()
    for (const limit of limits) await ctx.db.delete(limit._id)

    return { deletedAccounts: Math.max(accounts.length, v2Users.length) }
  },
})

/**
 * Eksplicit, idempotent oprydning/synkronisering af v1-brugere til v2-auth.
 * Kører aldrig automatisk ved deploy -- skal kaldes manuelt med bekræftelse.
 * Sletter aldrig brugere eller password-hashes (`authAccounts`), men sikrer at
 * `users.email`/`emailVerificationTime` er udfyldt og `createdUserIds` er sat
 * i `components.auth`. Med `clearLegacySessions: true` fjernes udløbne
 * v1-sessions-/token-/kode-rækker.
 */
export const migrateV1AuthToV2 = internalMutation({
  args: {
    confirm: v.string(),
    clearLegacySessions: v.optional(v.boolean()),
  },
  returns: v.object({
    usersEnsured: v.number(),
    clearedSessions: v.number(),
    clearedRefreshTokens: v.number(),
    clearedCodes: v.number(),
    clearedVerifiers: v.number(),
    clearedRateLimits: v.number(),
  }),
  handler: async (ctx, args) => {
    if (args.confirm !== V1_AUTH_MIGRATION_CONFIRM) {
      throw new ConvexError('NOT_CONFIRMED')
    }

    const accounts = await ctx.db.query('authAccounts').collect()
    const seenUsers = new Set<string>()
    let usersEnsured = 0

    for (const account of accounts) {
      if (account.provider !== 'password') continue
      const email = normalizeAuthEmail(account.providerAccountId)
      if (!email.includes('@')) continue

      const user = await ctx.db.get(account.userId)
      if (user !== null && !seenUsers.has(account.userId)) {
        seenUsers.add(account.userId)
        const patch: { email?: string; emailVerificationTime?: number } = {}
        if (user.email !== email) patch.email = email
        if (
          user.emailVerificationTime === undefined &&
          account.emailVerified !== undefined
        ) {
          patch.emailVerificationTime = Date.now()
        }
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(user._id, patch)
        }
        await ctx.runMutation(components.auth.public.markUserIdCreated, {
          userId: user._id,
        })
        usersEnsured += 1
      }
    }

    let clearedSessions = 0
    let clearedRefreshTokens = 0
    let clearedCodes = 0
    let clearedVerifiers = 0
    let clearedRateLimits = 0

    if (args.clearLegacySessions === true) {
      for (const token of await ctx.db.query('authRefreshTokens').collect()) {
        await ctx.db.delete(token._id)
        clearedRefreshTokens += 1
      }
      for (const session of await ctx.db.query('authSessions').collect()) {
        await ctx.db.delete(session._id)
        clearedSessions += 1
      }
      for (const code of await ctx.db
        .query('authVerificationCodes')
        .collect()) {
        await ctx.db.delete(code._id)
        clearedCodes += 1
      }
      for (const verifier of await ctx.db.query('authVerifiers').collect()) {
        await ctx.db.delete(verifier._id)
        clearedVerifiers += 1
      }
      for (const limit of await ctx.db.query('authRateLimits').collect()) {
        await ctx.db.delete(limit._id)
        clearedRateLimits += 1
      }
    }

    return {
      usersEnsured,
      clearedSessions,
      clearedRefreshTokens,
      clearedCodes,
      clearedVerifiers,
      clearedRateLimits,
    }
  },
})
