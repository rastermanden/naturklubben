/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { ConvexError } from 'convex/values'
import { convexTest } from 'convex-test'
import { api } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

async function seedMember(
  t: ReturnType<typeof convexTest>,
  email: string,
  fullName: string,
  isAdmin = false,
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email })
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

async function seedMessage(
  t: ReturnType<typeof convexTest>,
  authorId: Id<'profiles'>,
  createdAt: number,
  room: 'general' | 'admin' = 'general',
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('messages', {
      room,
      authorId,
      content: 'hej',
      messageType: 'text',
      mentions: [],
      createdAt,
      clientId: `client-${room}-${createdAt}`,
    })
  })
}

async function readRow(
  t: ReturnType<typeof convexTest>,
  profileId: Id<'profiles'>,
) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query('chatReads').collect()
    return (
      rows.find(
        (row) => row.profileId === profileId && row.room === 'general',
      ) ?? null
    )
  })
}

describe('markMessageRead', () => {
  it('flytter kun positionen fremad og gemmer beskeden', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t, 'a@example.com', 'Ada')
    const first = await seedMessage(t, member.profileId, 1_000)
    const second = await seedMessage(t, member.profileId, 2_000)
    const asMember = t.withIdentity({ subject: member.userId })

    await asMember.mutation(api.chat.markMessageRead, { messageId: second })
    await asMember.mutation(api.chat.markMessageRead, { messageId: first })

    const row = await readRow(t, member.profileId)
    expect(row?.lastReadMessageId).toBe(second)
    expect(row?.lastReadAt).toBe(2_000)

    const positions = await asMember.query(api.chat.readPositions, {
      room: 'general',
    })
    expect(positions).toEqual([
      {
        profileId: member.profileId,
        room: 'general',
        lastReadMessageId: second,
        lastReadAt: 2_000,
      },
    ])
  })

  it('behandler en admin-besked som ukendt for et almindeligt medlem', async () => {
    const t = convexTest(schema, modules)
    const member = await seedMember(t, 'a@example.com', 'Ada')
    const admin = await seedMember(t, 'admin@example.com', 'Admin', true)
    const hidden = await seedMessage(t, admin.profileId, 1_000, 'admin')

    const failure = await t
      .withIdentity({ subject: member.userId })
      .mutation(api.chat.markMessageRead, { messageId: hidden })
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(failure).toBeInstanceOf(ConvexError)
    expect(JSON.parse((failure as ConvexError<string>).data)).toBe(
      'CHAT_READ_MESSAGE_NOT_FOUND',
    )
    expect(await readRow(t, member.profileId)).toBeNull()
  })

  it('tæller ikke beskeden selv som ulæst, men den næste', async () => {
    const t = convexTest(schema, modules)
    const author = await seedMember(t, 'a@example.com', 'Ada')
    const reader = await seedMember(t, 'b@example.com', 'Bo')
    const first = await seedMessage(t, author.profileId, 1_000)
    await seedMessage(t, author.profileId, 2_000)
    const asReader = t.withIdentity({ subject: reader.userId })

    await asReader.mutation(api.chat.markMessageRead, { messageId: first })
    const summary = await asReader.query(api.chat.unread, {})
    expect(summary.find((entry) => entry.room === 'general')?.unread).toBe(1)
  })
})
