import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

const TEST_INBOX = 'naturklubben-test@agentmail.to'

/** Sletter kun test-indbakkens konto. Kaldes én gang fra preview-workflowet. */
export const purge = internalMutation({
  args: { confirm: v.literal('PURGE_TEST_INBOX') },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx) => {
    const allowed = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', TEST_INBOX))
      .unique()
    if (allowed !== null) await ctx.db.delete(allowed._id)

    const accounts = (await ctx.db.query('authAccounts').collect()).filter(
      (account) => account.providerAccountId === TEST_INBOX,
    )
    const userIds = new Set<Id<'users'>>()
    for (const account of accounts) {
      userIds.add(account.userId)
      const codes = await ctx.db
        .query('authVerificationCodes')
        .filter((q) => q.eq(q.field('accountId'), account._id))
        .collect()
      for (const code of codes) await ctx.db.delete(code._id)
      await ctx.db.delete(account._id)
    }
    for (const userId of userIds) {
      await deleteUser(ctx, userId)
    }
    return { ok: true as const }
  },
})

async function deleteUser(ctx: MutationCtx, userId: Id<'users'>) {
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
  const user = await ctx.db.get(userId)
  if (user !== null) await ctx.db.delete(userId)
}
