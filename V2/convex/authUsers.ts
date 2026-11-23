import { v } from 'convex/values'
import { components } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { internalMutation } from './_generated/server'
import { normalizeAuthEmail } from './passwords'

export const createUser = internalMutation({
  args: {
    method: v.object({
      name: v.string(),
      profile: v.any(),
    }),
  },
  returns: v.id('users'),
  handler: async (ctx, args): Promise<Id<'users'>> => {
    const profile =
      typeof args.method.profile === 'object' && args.method.profile !== null
        ? (args.method.profile as Record<string, unknown>)
        : {}
    const email =
      typeof profile.email === 'string' && profile.email.trim().length > 0
        ? normalizeAuthEmail(profile.email)
        : undefined
    const name =
      typeof profile.name === 'string' && profile.name.trim().length > 0
        ? profile.name.trim()
        : undefined
    return await ctx.db.insert('users', {
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
    })
  },
})

export const onSignIn = internalMutation({
  args: {
    method: v.object({
      name: v.string(),
      profile: v.any(),
    }),
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const user = await ctx.db.get(args.userId)
    if (user === null) return null

    const primaryEmail = await ctx.runQuery(
      components.authEmail.verifiedEmails.getPrimaryEmail,
      { userId: args.userId },
    )
    if (primaryEmail !== null) {
      const normalized = normalizeAuthEmail(primaryEmail)
      const patch: { email?: string; emailVerificationTime?: number } = {}
      if (user.email !== normalized) patch.email = normalized
      if (user.emailVerificationTime === undefined) {
        patch.emailVerificationTime = Date.now()
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(args.userId, patch)
      }
    }
    return null
  },
})
