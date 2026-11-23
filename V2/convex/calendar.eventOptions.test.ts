/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import {
  createTestConvex,
  withAuthUser,
  type TestConvexInstance,
} from '../test/convexTestAuth'
import { api } from './_generated/api'

const DAY = 24 * 60 * 60 * 1000

async function seedMember(t: TestConvexInstance) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: 'tur@example.com' })
    await ctx.db.insert('profiles', {
      userId,
      fullName: 'Tur Medlem',
      isAdmin: false,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: 1,
    })
    return userId
  })
}

async function seedEvent(
  t: TestConvexInstance,
  event: { title: string; startAt: number; days?: number },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert('events', {
      title: event.title,
      startAt: event.startAt,
      endsAt: event.startAt + (event.days ?? 1) * DAY,
      isPublic: false,
      attendingCount: 0,
      waitlistedCount: 0,
      approvedGuestCount: 0,
      createdAt: event.startAt,
    }),
  )
}

describe('eventOptions (#332)', () => {
  it('giver både afholdte og kommende begivenheder, nyeste først', async () => {
    const t = createTestConvex()
    const userId = await seedMember(t)
    await seedEvent(t, { title: 'Sidste år', startAt: 1 * DAY })
    await seedEvent(t, { title: 'Kommende', startAt: 9 * DAY })
    await seedEvent(t, { title: 'I går', startAt: 5 * DAY })

    const options = await (
      await withAuthUser(t, userId)
    ).query(api.calendar.eventOptions, {})

    expect(options.map((option) => option.title)).toEqual([
      'Kommende',
      'I går',
      'Sidste år',
    ])
    expect(options[0]).toMatchObject({ startAt: 9 * DAY })
  })

  it('lader ikke en flerdagstur skubbe en senere tur ud af listen', async () => {
    const t = createTestConvex()
    const userId = await seedMember(t)
    // Lejren starter først, men slutter sidst. Hentes vinduet gennem `by_end`,
    // optager den en plads foran begge ture og skubber "Tur 15." ud -- og så
    // kan den tur slet ikke vælges i formularen.
    await seedEvent(t, { title: 'Sommerlejr', startAt: 1 * DAY, days: 30 })
    await seedEvent(t, { title: 'Tur 15.', startAt: 15 * DAY })
    await seedEvent(t, { title: 'Tur 20.', startAt: 20 * DAY })

    const options = await (
      await withAuthUser(t, userId)
    ).query(api.calendar.eventOptions, { limit: 2 })

    expect(options.map((option) => option.title)).toEqual([
      'Tur 20.',
      'Tur 15.',
    ])
  })

  it('giver kun de tre felter, et felt i en formular har brug for', async () => {
    const t = createTestConvex()
    const userId = await seedMember(t)
    await seedEvent(t, { title: 'Hornfisketur', startAt: 2 * DAY })

    const options = await (
      await withAuthUser(t, userId)
    ).query(api.calendar.eventOptions, {})

    expect(Object.keys(options[0]).sort()).toEqual(['id', 'startAt', 'title'])
  })

  it('holder limit inden for 1-100', async () => {
    const t = createTestConvex()
    const userId = await seedMember(t)
    await seedEvent(t, { title: 'En tur', startAt: 1 * DAY })
    await seedEvent(t, { title: 'To tur', startAt: 2 * DAY })
    const asMember = await withAuthUser(t, userId)

    expect(
      await asMember.query(api.calendar.eventOptions, { limit: 0 }),
    ).toHaveLength(1)
    expect(
      await asMember.query(api.calendar.eventOptions, { limit: 1000 }),
    ).toHaveLength(2)
  })

  it('kræver et medlem', async () => {
    const t = createTestConvex()
    await seedEvent(t, { title: 'Hemmelig tur', startAt: 1 * DAY })

    await expect(t.query(api.calendar.eventOptions, {})).rejects.toThrow()
  })
})
