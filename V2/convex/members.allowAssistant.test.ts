/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { ConvexError } from 'convex/values'
import { convexTest } from 'convex-test'
import { internal } from './_generated/api'
import schema from './schema'
import { ALLOW_ASSISTANT_CONFIRM } from './members'

const modules = import.meta.glob('./**/*.ts')

describe('assistentens adgang', () => {
  it('sætter admin-flaget uden at oprette en bruger', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(internal.members.allowAssistantAdmin, {
      confirm: ALLOW_ASSISTANT_CONFIRM,
    })
    expect(result).toEqual({
      listed: true,
      isAdmin: true,
      accountExists: false,
    })
    const rows = await t.run(async (ctx) => ({
      allowed: await ctx.db.query('allowedEmails').collect(),
      accounts: await ctx.db.query('authAccounts').collect(),
      profiles: await ctx.db.query('profiles').collect(),
    }))
    expect(rows.allowed).toEqual([
      expect.objectContaining({
        email: 'naturklubben-test@agentmail.to',
        isAdmin: true,
      }),
    ])
    expect(rows.accounts).toHaveLength(0)
    expect(rows.profiles).toHaveLength(0)
  })

  it('nægter uden bekræftelse', async () => {
    const t = convexTest(schema, modules)
    const failure = await t
      .mutation(internal.members.allowAssistantAdmin, { confirm: 'nej' })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(failure).toBeInstanceOf(ConvexError)
  })
})
