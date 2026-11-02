import { v } from 'convex/values'
import { env, internalQuery } from './_generated/server'
import { authMailDecision, type AuthMailKind } from './authEmail'
import { normalizeAuthEmail } from './passwords'

/**
 * Om en auth-mail må sendes.
 *
 * I previewet (`PREVIEW_SEED=1`) er adgangslisten også loftet for mail:
 * bekræftelse og nulstilling går kun til adresser, der står der, og
 * nulstilling går ikke til en adresse uden bruger. Produktion er uændret.
 */
export const decide = internalQuery({
  args: {
    email: v.string(),
    kind: v.union(v.literal('verify'), v.literal('reset')),
  },
  handler: async (ctx, args): Promise<'send' | 'skip' | 'deny'> => {
    const email = normalizeAuthEmail(args.email)
    const kind: AuthMailKind = args.kind
    const allowed = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'password').eq('providerAccountId', email),
      )
      .unique()
    return authMailDecision({
      restrictToAllowlist: env.PREVIEW_SEED === '1',
      kind,
      onAllowlist: allowed !== null,
      hasAccount: account !== null,
    })
  },
})
