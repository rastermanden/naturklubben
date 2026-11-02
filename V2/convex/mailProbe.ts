import { v } from 'convex/values'
import { internalMutation } from './_generated/server'

/** Test-indbakken skal stå på listen, så velkomstlinket kan oprette profilen. */
const TEST_INBOX = 'naturklubben-test@agentmail.to'

export const allow = internalMutation({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', TEST_INBOX))
      .unique()
    if (existing === null) {
      await ctx.db.insert('allowedEmails', {
        email: TEST_INBOX,
        isAdmin: false,
      })
    }
    return { ok: true as const }
  },
})
