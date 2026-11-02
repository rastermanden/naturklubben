/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

async function seedAdmin(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: 'admin@example.com' })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: 'Admin',
      isAdmin: true,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: 1,
    })
    return { userId, profileId }
  })
}

describe('datoafstemninger og adgangsliste', () => {
  it('opretter en afstemning, tæller et svar og lukker den', async () => {
    const t = convexTest(schema, modules)
    const admin = await seedAdmin(t)
    const asAdmin = t.withIdentity({ subject: admin.userId })
    const pollId = await asAdmin.mutation(api.datePolls.create, {
      title: 'Næste tur',
      description: null,
      options: [
        { startsAt: Date.parse('2026-12-05T09:00:00Z'), endsAt: null },
        { startsAt: Date.parse('2026-12-06T09:00:00Z'), endsAt: null },
      ],
    })
    const listed = await asAdmin.query(api.datePolls.list, {})
    const optionId = listed[0]!.options[0]!.id
    await asAdmin.mutation(api.datePolls.vote, { optionId, answer: 'yes' })
    await asAdmin.mutation(api.datePolls.close, { pollId, optionId })
    const after = await asAdmin.query(api.datePolls.list, {})
    expect(after[0]?.chosen_option_id).toBe(optionId)
    expect(after[0]?.options[0]?.votes).toEqual([
      { user_id: admin.profileId, answer: 'yes' },
    ])
  })

  it('lader en admin taste en e-mail på adgangslisten', async () => {
    const t = convexTest(schema, modules)
    const admin = await seedAdmin(t)
    const asAdmin = t.withIdentity({ subject: admin.userId })
    await asAdmin.mutation(api.members.addAllowedEmail, {
      email: 'Ny@Example.com',
      note: 'Anne fra bestyrelsen',
    })
    const rows = await asAdmin.query(api.members.listAllowedEmails, {})
    expect(rows).toEqual([
      expect.objectContaining({
        email: 'ny@example.com',
        note: 'Anne fra bestyrelsen',
        isAdmin: false,
      }),
    ])
  })
})
