import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { requireAdmin, requireWritableProfile } from './authz'

const MIN_OPTIONS = 2
const MAX_OPTIONS = 10
const MAX_TITLE = 120

const answer = v.union(v.literal('yes'), v.literal('maybe'), v.literal('no'))

/** Admins ser afstemningerne, med svar pr. dato. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const polls = await ctx.db
      .query('datePolls')
      .withIndex('by_created')
      .order('desc')
      .take(100)
    return await Promise.all(
      polls.map(async (poll) => {
        const options = await ctx.db
          .query('datePollOptions')
          .withIndex('by_poll', (q) => q.eq('pollId', poll._id))
          .collect()
        options.sort((a, b) => a.position - b.position)
        return {
          id: poll._id,
          title: poll.title,
          description: poll.description ?? null,
          created_by: poll.createdBy ?? null,
          created_at: new Date(poll.createdAt).toISOString(),
          closed_at:
            poll.closedAt === undefined
              ? null
              : new Date(poll.closedAt).toISOString(),
          chosen_option_id: poll.chosenOptionId ?? null,
          event_id: poll.eventId ?? null,
          options: await Promise.all(
            options.map(async (option) => {
              const votes = await ctx.db
                .query('datePollVotes')
                .withIndex('by_option', (q) => q.eq('optionId', option._id))
                .collect()
              return {
                id: option._id,
                position: option.position,
                starts_at: new Date(option.startsAt).toISOString(),
                ends_at:
                  option.endsAt === undefined
                    ? null
                    : new Date(option.endsAt).toISOString(),
                votes: votes.map((vote) => ({
                  user_id: vote.voterId,
                  answer: vote.answer,
                })),
              }
            }),
          ),
        }
      }),
    )
  },
})

export const create = mutation({
  args: {
    title: v.string(),
    description: v.union(v.string(), v.null()),
    options: v.array(
      v.object({
        startsAt: v.number(),
        endsAt: v.union(v.number(), v.null()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const admin = await requireWritableProfile(ctx)
    if (!admin.isAdmin) throw new ConvexError('DATE_POLL_NOT_AUTHORIZED')
    const title = args.title.trim()
    if (title.length < 1 || title.length > MAX_TITLE) {
      throw new ConvexError('DATE_POLL_INVALID_TITLE')
    }
    if (
      args.options.length < MIN_OPTIONS ||
      args.options.length > MAX_OPTIONS
    ) {
      throw new ConvexError('DATE_POLL_INVALID_OPTIONS')
    }
    const starts = new Set<number>()
    for (const option of args.options) {
      if (!Number.isFinite(option.startsAt)) {
        throw new ConvexError('DATE_POLL_INVALID_OPTIONS')
      }
      if (starts.has(option.startsAt)) {
        throw new ConvexError('DATE_POLL_DUPLICATE_OPTION')
      }
      starts.add(option.startsAt)
      if (option.endsAt !== null && option.endsAt < option.startsAt) {
        throw new ConvexError('DATE_POLL_INVALID_OPTIONS')
      }
    }
    const pollId = await ctx.db.insert('datePolls', {
      title,
      description: args.description?.trim() || undefined,
      createdBy: admin._id,
      createdAt: Date.now(),
    })
    for (const [position, option] of args.options.entries()) {
      await ctx.db.insert('datePollOptions', {
        pollId,
        position,
        startsAt: option.startsAt,
        endsAt: option.endsAt ?? undefined,
      })
    }
    return pollId
  },
})

export const vote = mutation({
  args: {
    optionId: v.id('datePollOptions'),
    answer: v.union(answer, v.null()),
  },
  handler: async (ctx, args) => {
    const admin = await requireWritableProfile(ctx)
    if (!admin.isAdmin) throw new ConvexError('DATE_POLL_NOT_AUTHORIZED')
    const option = await ctx.db.get(args.optionId)
    if (option === null) throw new ConvexError('DATE_POLL_OPTION_NOT_FOUND')
    const poll = await ctx.db.get(option.pollId)
    if (poll === null) throw new ConvexError('DATE_POLL_NOT_FOUND')
    if (poll.closedAt !== undefined) throw new ConvexError('DATE_POLL_CLOSED')
    const existing = await ctx.db
      .query('datePollVotes')
      .withIndex('by_option_voter', (q) =>
        q.eq('optionId', args.optionId).eq('voterId', admin._id),
      )
      .unique()
    if (args.answer === null) {
      if (existing !== null) await ctx.db.delete(existing._id)
      return null
    }
    if (existing === null) {
      await ctx.db.insert('datePollVotes', {
        optionId: args.optionId,
        voterId: admin._id,
        answer: args.answer,
        updatedAt: Date.now(),
      })
    } else {
      await ctx.db.patch(existing._id, {
        answer: args.answer,
        updatedAt: Date.now(),
      })
    }
    return null
  },
})

export const close = mutation({
  args: {
    pollId: v.id('datePolls'),
    optionId: v.id('datePollOptions'),
  },
  handler: async (ctx, args) => {
    const admin = await requireWritableProfile(ctx)
    if (!admin.isAdmin) throw new ConvexError('DATE_POLL_NOT_AUTHORIZED')
    const poll = await ctx.db.get(args.pollId)
    if (poll === null) throw new ConvexError('DATE_POLL_NOT_FOUND')
    if (poll.closedAt !== undefined) throw new ConvexError('DATE_POLL_CLOSED')
    const option = await ctx.db.get(args.optionId)
    if (option === null || option.pollId !== args.pollId) {
      throw new ConvexError('DATE_POLL_OPTION_NOT_IN_POLL')
    }
    await ctx.db.patch(poll._id, {
      closedAt: Date.now(),
      closedBy: admin._id,
      chosenOptionId: args.optionId,
    })
    return null
  },
})

export const linkEvent = mutation({
  args: {
    pollId: v.id('datePolls'),
    eventId: v.id('events'),
  },
  handler: async (ctx, args) => {
    const admin = await requireWritableProfile(ctx)
    if (!admin.isAdmin) throw new ConvexError('DATE_POLL_NOT_AUTHORIZED')
    const poll = await ctx.db.get(args.pollId)
    if (poll === null) throw new ConvexError('DATE_POLL_NOT_FOUND')
    if (poll.closedAt === undefined)
      throw new ConvexError('DATE_POLL_NOT_CLOSED')
    const event = await ctx.db.get(args.eventId)
    if (event === null) throw new ConvexError('DATE_POLL_EVENT_NOT_FOUND')
    await ctx.db.patch(poll._id, { eventId: args.eventId })
    return null
  },
})

export const remove = mutation({
  args: { pollId: v.id('datePolls') },
  handler: async (ctx, args) => {
    const admin = await requireWritableProfile(ctx)
    if (!admin.isAdmin) throw new ConvexError('DATE_POLL_NOT_AUTHORIZED')
    const poll = await ctx.db.get(args.pollId)
    if (poll === null) throw new ConvexError('DATE_POLL_NOT_FOUND')
    const options = await ctx.db
      .query('datePollOptions')
      .withIndex('by_poll', (q) => q.eq('pollId', poll._id))
      .collect()
    for (const option of options) {
      const votes = await ctx.db
        .query('datePollVotes')
        .withIndex('by_option', (q) => q.eq('optionId', option._id))
        .collect()
      for (const vote of votes) await ctx.db.delete(vote._id)
      await ctx.db.delete(option._id)
    }
    await ctx.db.delete(poll._id)
    return null
  },
})

export type DatePollId = Id<'datePolls'>
