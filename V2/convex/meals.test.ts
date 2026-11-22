/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

async function seedMember(
  t: ReturnType<typeof convexTest>,
  options: { name: string; email: string; isAdmin?: boolean },
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: options.email })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: options.name,
      isAdmin: options.isAdmin === true,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: 1,
    })
    return { userId, profileId }
  })
}

async function seedEvent(
  t: ReturnType<typeof convexTest>,
  createdBy: Id<'profiles'>,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('events', {
      title: 'Efterårsbral',
      location: 'Loshult',
      startAt: 1,
      endsAt: 2,
      createdBy,
      isPublic: false,
      attendingCount: 0,
      waitlistedCount: 0,
      approvedGuestCount: 0,
      createdAt: 1,
    })
  })
}

describe('mad og indkøb', () => {
  it('afviser den, der ikke er medlem', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedMember(t, {
      name: 'Arrangør',
      email: 'arrangor@example.com',
    })
    const eventId = await seedEvent(t, owner.profileId)

    await expect(t.query(api.meals.forEvent, { eventId })).rejects.toThrow(
      'NOT_A_MEMBER',
    )
    await expect(
      t.mutation(api.meals.addWish, {
        eventId,
        category: 'broed',
        text: 'rugbrød',
      }),
    ).rejects.toThrow('NOT_A_MEMBER')
  })

  it('lader alle medlemmer skrive og se ønsker, og kun den rette fjerne dem', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedMember(t, {
      name: 'Arrangør',
      email: 'arrangor@example.com',
    })
    const buyer = await seedMember(t, {
      name: 'Troels',
      email: 'mad@example.com',
    })
    const member = await seedMember(t, {
      name: 'Kasper',
      email: 'kasper@example.com',
    })
    const eventId = await seedEvent(t, owner.profileId)

    await expect(
      memberAs(t, member.userId).mutation(api.meals.startMeal, {
        eventId,
        mainDish: 'Chili con carne',
        buyerId: buyer.profileId,
      }),
    ).rejects.toThrow('NOT_EVENT_MANAGER')

    await memberAs(t, owner.userId).mutation(api.meals.startMeal, {
      eventId,
      mainDish: '  Chili con carne  ',
      buyerId: buyer.profileId,
    })

    const wishId = await memberAs(t, member.userId).mutation(
      api.meals.addWish,
      {
        eventId,
        category: 'paalaeg',
        text: '  leverpostej  ',
      },
    )
    await memberAs(t, buyer.userId).mutation(api.meals.addWish, {
      eventId,
      category: 'snacks',
      text: 'nødder',
    })

    const listed = await memberAs(t, member.userId).query(api.meals.forEvent, {
      eventId,
    })
    expect(listed.plan).toMatchObject({
      mainDish: 'Chili con carne',
      buyerName: 'Troels',
      isBuyer: false,
    })
    expect(listed.wishes.map((wish) => wish.text)).toEqual([
      'leverpostej',
      'nødder',
    ])
    expect(listed.wishes[0]).toMatchObject({
      category: 'paalaeg',
      authorName: 'Kasper',
      mine: true,
      canDelete: true,
    })
    expect(listed.wishes[1]?.canDelete).toBe(false)

    const asBuyer = await memberAs(t, buyer.userId).query(api.meals.forEvent, {
      eventId,
    })
    expect(asBuyer.plan?.isBuyer).toBe(true)
    expect(asBuyer.wishes.every((wish) => wish.canDelete)).toBe(true)

    await expect(
      memberAs(t, member.userId).mutation(api.meals.deleteWish, {
        wishId: asBuyer.wishes[1]!.id,
      }),
    ).rejects.toThrow('NOT_MEAL_EDITOR')

    await memberAs(t, buyer.userId).mutation(api.meals.deleteWish, {
      wishId: asBuyer.wishes[1]!.id,
    })
    await memberAs(t, member.userId).mutation(api.meals.deleteWish, { wishId })

    const empty = await memberAs(t, owner.userId).query(api.meals.forEvent, {
      eventId,
    })
    expect(empty.wishes).toEqual([])
  })

  it('lader en admin oprette planen og skifte madansvarlig', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedMember(t, {
      name: 'Arrangør',
      email: 'arrangor@example.com',
    })
    const admin = await seedMember(t, {
      name: 'Admin',
      email: 'admin@example.com',
      isAdmin: true,
    })
    const buyer = await seedMember(t, {
      name: 'Troels',
      email: 'mad@example.com',
    })
    const eventId = await seedEvent(t, owner.profileId)

    await memberAs(t, admin.userId).mutation(api.meals.startMeal, {
      eventId,
      mainDish: 'Chili con carne',
      buyerId: null,
    })
    await memberAs(t, admin.userId).mutation(api.meals.setBuyer, {
      eventId,
      buyerId: buyer.profileId,
    })

    const listed = await memberAs(t, owner.userId).query(api.meals.forEvent, {
      eventId,
    })
    expect(listed.plan?.buyerName).toBe('Troels')
    expect(listed.canManage).toBe(true)

    await expect(
      memberAs(t, buyer.userId).mutation(api.meals.setBuyer, {
        eventId,
        buyerId: owner.profileId,
      }),
    ).rejects.toThrow('NOT_EVENT_MANAGER')
  })

  it('afviser et tomt ønske og en plan, der allerede findes', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedMember(t, {
      name: 'Arrangør',
      email: 'arrangor@example.com',
    })
    const eventId = await seedEvent(t, owner.profileId)
    const asOwner = memberAs(t, owner.userId)

    await asOwner.mutation(api.meals.startMeal, {
      eventId,
      mainDish: 'Chili con carne',
      buyerId: null,
    })
    await expect(
      asOwner.mutation(api.meals.startMeal, {
        eventId,
        mainDish: 'Suppe',
        buyerId: null,
      }),
    ).rejects.toThrow('MEAL_EXISTS')
    await expect(
      asOwner.mutation(api.meals.addWish, {
        eventId,
        category: 'andet',
        text: '   ',
      }),
    ).rejects.toThrow('MEAL_WISH_INVALID')
  })

  it('fjerner mad og ønsker, når begivenheden slettes', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedMember(t, {
      name: 'Arrangør',
      email: 'arrangor@example.com',
    })
    const eventId = await seedEvent(t, owner.profileId)
    const asOwner = memberAs(t, owner.userId)
    await asOwner.mutation(api.meals.startMeal, {
      eventId,
      mainDish: 'Chili con carne',
      buyerId: owner.profileId,
    })
    await asOwner.mutation(api.meals.addWish, {
      eventId,
      category: 'broed',
      text: 'flute',
    })

    await asOwner.mutation(api.calendar.deleteEvent, { eventId })

    const left = await t.run(async (ctx) => ({
      meals: await ctx.db.query('eventMeals').collect(),
      wishes: await ctx.db.query('eventMealWishes').collect(),
    }))
    expect(left.meals).toEqual([])
    expect(left.wishes).toEqual([])
  })

  it('beholder ønsket uden forfatter, når medlemmet sletter sin konto', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedMember(t, {
      name: 'Arrangør',
      email: 'arrangor@example.com',
      isAdmin: true,
    })
    const member = await seedMember(t, {
      name: 'Kasper',
      email: 'kasper@example.com',
    })
    const eventId = await seedEvent(t, owner.profileId)
    await memberAs(t, owner.userId).mutation(api.meals.startMeal, {
      eventId,
      mainDish: 'Chili con carne',
      buyerId: member.profileId,
    })
    await memberAs(t, member.userId).mutation(api.meals.addWish, {
      eventId,
      category: 'andet',
      text: 'kaffe',
    })

    await t.run(async (ctx) => {
      await ctx.db.patch(member.profileId, { deletionReservedAt: Date.now() })
    })
    const result = await t.mutation(internal.account.completeDeletion, {
      profileId: member.profileId,
    })
    expect(result.deleted).toBe(true)

    const listed = await memberAs(t, owner.userId).query(api.meals.forEvent, {
      eventId,
    })
    expect(listed.plan?.buyerName).toBeNull()
    expect(listed.wishes).toEqual([
      expect.objectContaining({
        text: 'kaffe',
        authorName: 'Tidligere medlem',
      }),
    ])
  })
})

function memberAs(t: ReturnType<typeof convexTest>, userId: Id<'users'>) {
  return t.withIdentity({ subject: userId })
}
