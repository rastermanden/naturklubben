import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireProfile, requireWritableProfile } from './authz'
import { mealWishCategory } from './tables/calendar'

/**
 * Mad og indkøb på en begivenhed.
 *
 * Alle medlemmer må se listen og skrive et ønske. Arrangøren eller en admin
 * opretter planen og vælger, hvem der køber ind. Madansvarlig, forfatteren og
 * arrangøren kan fjerne et ønske. Klienten viser kun knapperne. Reglerne
 * står her.
 */

const MAX_TEXT = 80
const MAX_WISHES = 100

type Ctx = QueryCtx | MutationCtx

async function requireEvent(
  ctx: Ctx,
  eventId: Id<'events'>,
): Promise<Doc<'events'>> {
  const event = await ctx.db.get(eventId)
  if (event === null) throw new ConvexError('EVENT_NOT_FOUND')
  return event
}

function canManageEvent(profile: Doc<'profiles'>, event: Doc<'events'>) {
  return event.createdBy === profile._id || profile.isAdmin
}

function cleanText(value: string, code: string): string {
  const text = value.trim()
  if (text.length === 0 || text.length > MAX_TEXT) {
    throw new ConvexError(code)
  }
  return text
}

async function mealForEvent(ctx: Ctx, eventId: Id<'events'>) {
  return await ctx.db
    .query('eventMeals')
    .withIndex('by_event', (q) => q.eq('eventId', eventId))
    .unique()
}

async function resolveBuyer(
  ctx: Ctx,
  buyerId: Id<'profiles'> | null,
): Promise<Id<'profiles'> | undefined> {
  if (buyerId === null) return undefined
  const buyer = await ctx.db.get(buyerId)
  if (buyer === null) throw new ConvexError('BUYER_NOT_FOUND')
  return buyer._id
}

/** Madplanen og ønskerne. Alle medlemmer må se dem. */
export const forEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const event = await requireEvent(ctx, args.eventId)
    const canManage = canManageEvent(profile, event)
    const meal = await mealForEvent(ctx, args.eventId)
    if (meal === null) {
      return { plan: null, canManage, wishes: [] }
    }

    const buyer =
      meal.buyerId === undefined ? null : await ctx.db.get(meal.buyerId)
    const rows = await ctx.db
      .query('eventMealWishes')
      .withIndex('by_event_created', (q) => q.eq('eventId', args.eventId))
      .take(MAX_WISHES)
    const isBuyer = meal.buyerId === profile._id
    const wishes = []
    for (const row of rows) {
      const author =
        row.authorId === undefined ? null : await ctx.db.get(row.authorId)
      const mine = row.authorId === profile._id
      wishes.push({
        id: row._id,
        category: row.category,
        text: row.text,
        authorName:
          author?.fullName ??
          (row.authorId === undefined ? 'Tidligere medlem' : 'Medlem'),
        mine,
        canDelete: mine || isBuyer || canManage,
      })
    }

    return {
      plan: {
        mainDish: meal.mainDish,
        buyerId: meal.buyerId ?? null,
        buyerName: buyer?.fullName ?? null,
        isBuyer,
      },
      canManage,
      wishes,
    }
  },
})

/** Opret madplanen. Arrangøren eller en admin. */
export const startMeal = mutation({
  args: {
    eventId: v.id('events'),
    mainDish: v.string(),
    buyerId: v.union(v.id('profiles'), v.null()),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const event = await requireEvent(ctx, args.eventId)
    if (!canManageEvent(profile, event)) {
      throw new ConvexError('NOT_EVENT_MANAGER')
    }
    if ((await mealForEvent(ctx, args.eventId)) !== null) {
      throw new ConvexError('MEAL_EXISTS')
    }

    const buyerId = await resolveBuyer(ctx, args.buyerId)
    await ctx.db.insert('eventMeals', {
      eventId: args.eventId,
      mainDish: cleanText(args.mainDish, 'MEAL_DISH_INVALID'),
      ...(buyerId === undefined ? {} : { buyerId }),
    })
    return null
  },
})

/** Skift madansvarlig. Arrangøren eller en admin. */
export const setBuyer = mutation({
  args: {
    eventId: v.id('events'),
    buyerId: v.union(v.id('profiles'), v.null()),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const event = await requireEvent(ctx, args.eventId)
    if (!canManageEvent(profile, event)) {
      throw new ConvexError('NOT_EVENT_MANAGER')
    }
    const meal = await mealForEvent(ctx, args.eventId)
    if (meal === null) throw new ConvexError('MEAL_NOT_FOUND')

    const buyerId = await resolveBuyer(ctx, args.buyerId)
    await ctx.db.patch(meal._id, { buyerId })
    return null
  },
})

/** Skriv et ønske på listen. Alle medlemmer. */
export const addWish = mutation({
  args: {
    eventId: v.id('events'),
    category: mealWishCategory,
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    await requireEvent(ctx, args.eventId)
    if ((await mealForEvent(ctx, args.eventId)) === null) {
      throw new ConvexError('MEAL_NOT_FOUND')
    }

    const existing = await ctx.db
      .query('eventMealWishes')
      .withIndex('by_event_created', (q) => q.eq('eventId', args.eventId))
      .take(MAX_WISHES)
    if (existing.length >= MAX_WISHES) {
      throw new ConvexError('MEAL_WISHES_FULL')
    }

    return await ctx.db.insert('eventMealWishes', {
      eventId: args.eventId,
      authorId: profile._id,
      category: args.category,
      text: cleanText(args.text, 'MEAL_WISH_INVALID'),
      createdAt: Date.now(),
    })
  },
})

/**
 * Fjern et ønske. Forfatteren, madansvarlig, arrangøren eller en admin.
 */
export const deleteWish = mutation({
  args: { wishId: v.id('eventMealWishes') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const wish = await ctx.db.get(args.wishId)
    if (wish === null) throw new ConvexError('MEAL_WISH_NOT_FOUND')

    const event = await requireEvent(ctx, wish.eventId)
    const meal = await mealForEvent(ctx, wish.eventId)
    const isBuyer = meal?.buyerId === profile._id
    const mine = wish.authorId === profile._id
    if (!mine && !isBuyer && !canManageEvent(profile, event)) {
      throw new ConvexError('NOT_MEAL_EDITOR')
    }

    await ctx.db.delete(wish._id)
    return null
  },
})
