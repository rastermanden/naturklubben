/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'
import { DEFAULT_ASSISTANT_EMAIL } from './assistantMention'

const modules = import.meta.glob('./**/*.ts')

async function seedProfile(
  t: ReturnType<typeof convexTest>,
  email: string,
  fullName: string,
  isAdmin = false,
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email })
    await ctx.db.insert('authAccounts', {
      userId,
      provider: 'password',
      providerAccountId: email,
      secret: 'not-a-real-secret',
    })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName,
      isAdmin,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: 1,
    })
    return { userId, profileId }
  })
}

async function mailCount(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query('assistantMentionMails').collect()
    return rows.length
  })
}

async function send(
  t: ReturnType<typeof convexTest>,
  userId: Id<'users'>,
  args: {
    clientId: string
    content: string
    room?: 'general' | 'admin'
    mentions?: Id<'profiles'>[]
  },
) {
  return await t
    .withIdentity({ subject: userId })
    .mutation(api.chat.sendMessage, {
      clientId: args.clientId,
      room: args.room ?? 'general',
      content: args.content,
      ...(args.mentions ? { mentions: args.mentions } : {}),
    })
}

describe('omtale-mail', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sender én mail for tekst og for et gemt id, ikke for assistenten selv', async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const bot = await seedProfile(t, DEFAULT_ASSISTANT_EMAIL, 'Grok Bot', true)
    const member = await seedProfile(t, 'martin@example.com', 'Martin', true)

    await send(t, member.userId, { clientId: 'tekst', content: 'Hej Grok' })
    await send(t, member.userId, {
      clientId: 'id',
      content: 'kan du se det her',
      mentions: [bot.profileId],
    })
    await send(t, member.userId, {
      clientId: 'admin',
      room: 'admin',
      content: '@Grok Bot',
    })
    await send(t, member.userId, { clientId: 'andre', content: 'hej Kasper' })
    await send(t, bot.userId, { clientId: 'selv', content: 'Jeg er Grok Bot' })
    await send(t, member.userId, { clientId: 'tekst', content: 'Hej Grok' })

    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await mailCount(t)).toBe(3)
  })
})
