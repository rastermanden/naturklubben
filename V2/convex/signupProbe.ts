import { ConvexError, v } from 'convex/values'
import { internalMutation } from './_generated/server'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

/**
 * Engangs-hjælp til at prøve oprettelse og glemt adgangskode på previewet.
 * Adressen er fast, så funktionen ikke kan bruges til andre modtagere.
 * Slettes igen, når prøven er kørt.
 */
const PROBE_EMAIL = 'martin.martinjensen+nktest@gmail.com'
const PURGE_CONFIRM = 'PURGE_SIGNUP_PROBE'

export const allow = internalMutation({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', PROBE_EMAIL))
      .unique()
    if (existing === null) {
      await ctx.db.insert('allowedEmails', {
        email: PROBE_EMAIL,
        isAdmin: false,
      })
    }
    return { ok: true as const }
  },
})

export const purge = internalMutation({
  args: { confirm: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    if (args.confirm !== PURGE_CONFIRM) {
      throw new ConvexError('SIGNUP_PROBE_NOT_CONFIRMED')
    }
    await purgeProbe(ctx)
    return { ok: true as const }
  },
})

async function purgeProbe(ctx: MutationCtx) {
  const allowed = await ctx.db
    .query('allowedEmails')
    .withIndex('by_email', (q) => q.eq('email', PROBE_EMAIL))
    .unique()
  if (allowed !== null) await ctx.db.delete(allowed._id)

  const accounts = await ctx.db.query('authAccounts').collect()
  const mine = accounts.filter(
    (account) => account.providerAccountId === PROBE_EMAIL,
  )
  const userIds = new Set<Id<'users'>>()
  for (const account of mine) {
    userIds.add(account.userId)
    const codes = await ctx.db
      .query('authVerificationCodes')
      .filter((q) => q.eq(q.field('accountId'), account._id))
      .collect()
    for (const code of codes) await ctx.db.delete(code._id)
    await ctx.db.delete(account._id)
  }

  for (const userId of userIds) {
    const sessions = await ctx.db
      .query('authSessions')
      .filter((q) => q.eq(q.field('userId'), userId))
      .collect()
    for (const session of sessions) {
      const tokens = await ctx.db
        .query('authRefreshTokens')
        .filter((q) => q.eq(q.field('sessionId'), session._id))
        .collect()
      for (const token of tokens) await ctx.db.delete(token._id)
      await ctx.db.delete(session._id)
    }

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    if (profile !== null) await ctx.db.delete(profile._id)
    await ctx.db.delete(userId)
  }
}
