import { v } from 'convex/values'
import { mutation } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireWritableProfile } from './authz'

/**
 * Afstemninger i chatten (#217).
 *
 * Afstemningsbeskeden er en helt almindelig besked i `messages` med
 * spørgsmålet som indhold; det, der er nyt, er `chatPolls` (ét-til-ét med
 * beskeden), `pollOptions` og `pollVotes`. Søgning, sletning og svar rører
 * derfor ingenting nyt -- de kender allerede beskeder.
 *
 * Synligheden arves fra beskeden: en afstemning i admin-rummet er lige så
 * skjult for et almindeligt medlem som selve beskeden. Den regel håndhæves
 * her i hver mutation, fordi Convex -- i modsætning til Postgres -- ikke har
 * en politik, der gør det af sig selv.
 */

// Samme grænser som den gamle apps `check`-constraints
// (20260913180000_chat_polls.sql), så en afstemning, der blev afvist dengang,
// også bliver afvist nu.
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 6
export const POLL_QUESTION_MAX_LENGTH = 300
export const POLL_OPTION_MAX_LENGTH = 200

/**
 * Rumreglen. Står også i `convex/chat.ts`; den er tre linjer, og en fælles
 * hjælper ville gøre de to filer cirkulært afhængige af hinanden.
 */
function requireRoomAccess(
  profile: Doc<'profiles'>,
  room: 'general' | 'admin',
) {
  if (room === 'admin' && !profile.isAdmin) {
    throw new Error('NOT_ADMIN')
  }
}

/**
 * Afstemningen på en besked, samlet til det, boblen skal vise.
 *
 * Både en forespørgsel og en mutation bruger den: forespørgslen for at vise
 * afstemningen, mutationen for at svare med det samme resultat, så opretteren
 * ser sin egen afstemning uden at vente på, at abonnementet sender den tilbage.
 *
 * Stemmetallet tælles ved at læse stemmerne. Convex har ingen `count(*)`, men
 * en afstemning i en klub af denne størrelse har få stemmer, og de skal
 * alligevel bruges til at afgøre, hvad læseren selv har stemt.
 */
export async function pollViewForMessage(
  ctx: QueryCtx | MutationCtx,
  messageId: Id<'messages'>,
  viewer: Doc<'profiles'>,
) {
  const poll = await ctx.db
    .query('chatPolls')
    .withIndex('by_message', (q) => q.eq('messageId', messageId))
    .unique()
  if (poll === null) return null

  const options = await ctx.db
    .query('pollOptions')
    .withIndex('by_poll_and_position', (q) => q.eq('pollId', poll._id))
    .collect()
  const votes = await ctx.db
    .query('pollVotes')
    .withIndex('by_poll', (q) => q.eq('pollId', poll._id))
    .collect()

  const totalVotes = votes.length
  const ownVote = votes.find((vote) => vote.profileId === viewer._id) ?? null

  return {
    pollId: poll._id,
    question: poll.question,
    closed: poll.closedAt !== undefined,
    createdBy: poll.createdBy ?? null,
    /**
     * Samme regel som for at slette en besked: opretteren eller en admin.
     * Regnet her, så visningen ikke skal kende autorisationsmodellen.
     */
    canClose:
      poll.closedAt === undefined &&
      (poll.createdBy === viewer._id || viewer.isAdmin),
    totalVotes,
    // Svarene står i den rækkefølge, de blev skrevet, ikke i
    // stemmetalsrækkefølge -- ellers ville rækkefølgen hoppe rundt, mens
    // folk stemmer.
    options: options.map((option) => {
      const count = votes.filter((vote) => vote.optionId === option._id).length
      return {
        optionId: option._id,
        label: option.label,
        count,
        percentage:
          totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100),
        votedByMe: ownVote?.optionId === option._id,
      }
    }),
    ownVoteOptionId: ownVote?.optionId ?? null,
  }
}

/**
 * Kræver: medlem, der ikke er på vej til at blive slettet
 * (`requireWritableProfile`), og som ejer beskeden.
 *
 * Afstemningen oprettes på en besked, afsenderen selv har sendt. Klienten
 * sender først beskeden som en helt almindelig besked og kalder derefter denne
 * -- to kald, ikke ét, netop fordi beskeden ikke er andet end en besked.
 */
export const createPoll = mutation({
  args: { messageId: v.id('messages'), options: v.array(v.string()) },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const message = await ctx.db.get(args.messageId)
    if (message === null) throw new Error('POLL_CREATE_MESSAGE_NOT_FOUND')
    requireRoomAccess(profile, message.room)

    if (message.authorId !== profile._id) {
      throw new Error('POLL_CREATE_NOT_AUTHORIZED')
    }
    if (message.deletedAt !== undefined) {
      throw new Error('POLL_CREATE_MESSAGE_DELETED')
    }

    const existing = await ctx.db
      .query('chatPolls')
      .withIndex('by_message', (q) => q.eq('messageId', args.messageId))
      .unique()
    if (existing !== null) throw new Error('POLL_CREATE_ALREADY_EXISTS')

    if (
      args.options.length < POLL_MIN_OPTIONS ||
      args.options.length > POLL_MAX_OPTIONS
    ) {
      throw new Error('POLL_CREATE_INVALID_OPTIONS')
    }

    const labels = args.options.map((option) => option.trim())
    if (
      labels.some(
        (label) => label.length === 0 || label.length > POLL_OPTION_MAX_LENGTH,
      )
    ) {
      throw new Error('POLL_CREATE_INVALID_OPTIONS')
    }

    // Spørgsmålet er beskedens indhold. Er beskeden længere end et spørgsmål
    // må være, afvises den her frem for at blive klippet -- samme grænse som
    // den gamle apps constraint på `polls.question`.
    if (message.content.length > POLL_QUESTION_MAX_LENGTH) {
      throw new Error('POLL_CREATE_QUESTION_TOO_LONG')
    }

    const pollId = await ctx.db.insert('chatPolls', {
      messageId: args.messageId,
      question: message.content,
      createdBy: profile._id,
      createdAt: Date.now(),
    })

    let position = 0
    for (const label of labels) {
      await ctx.db.insert('pollOptions', { pollId, position, label })
      position += 1
    }

    return await pollViewForMessage(ctx, args.messageId, profile)
  },
})

/**
 * Kræver: medlem (`requireWritableProfile`). Ét kald dækker både "stem" og
 * "stem om": stemmen slås op på `(pollId, profileId)` og erstattes, så et
 * medlem aldrig kan ligge med to stemmer.
 *
 * Synligheden tjekkes, før der gøres noget: et medlem uden adgang til
 * beskedens rum kan ikke stemme, selv om id'et på afstemningen er kendt.
 */
export const castPollVote = mutation({
  args: { pollId: v.id('chatPolls'), optionId: v.id('pollOptions') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const poll = await ctx.db.get(args.pollId)
    if (poll === null) throw new Error('POLL_VOTE_NOT_FOUND')

    const message = await ctx.db.get(poll.messageId)
    if (message === null) throw new Error('POLL_VOTE_NOT_FOUND')
    requireRoomAccess(profile, message.room)

    if (poll.closedAt !== undefined) throw new Error('POLL_VOTE_CLOSED')

    const option = await ctx.db.get(args.optionId)
    if (option === null || option.pollId !== poll._id) {
      throw new Error('POLL_VOTE_UNKNOWN_OPTION')
    }

    const existing = await ctx.db
      .query('pollVotes')
      .withIndex('by_poll_and_profile', (q) =>
        q.eq('pollId', poll._id).eq('profileId', profile._id),
      )
      .unique()

    const now = Date.now()
    if (existing === null) {
      await ctx.db.insert('pollVotes', {
        pollId: poll._id,
        profileId: profile._id,
        optionId: option._id,
        createdAt: now,
      })
    } else {
      await ctx.db.patch(existing._id, {
        optionId: option._id,
        createdAt: now,
      })
    }

    return await pollViewForMessage(ctx, poll.messageId, profile)
  },
})

/**
 * Kræver: medlem (`requireWritableProfile`), og derudover opretteren eller en
 * administrator -- samme regel som `softDeleteMessage` bruger for hvem der må
 * slette en besked.
 *
 * Lukning er idempotent: en allerede lukket afstemning ændrer ikke
 * `closedAt`/`closedBy` igen. Synligheden tjekkes *før* den no-op, så et
 * almindeligt medlem ikke kan lukke en afstemning i admin-rummet ved at kalde
 * igen på en, der allerede er lukket.
 */
export const closePoll = mutation({
  args: { pollId: v.id('chatPolls') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const poll = await ctx.db.get(args.pollId)
    if (poll === null) throw new Error('POLL_CLOSE_NOT_FOUND')

    const message = await ctx.db.get(poll.messageId)
    if (message === null) throw new Error('POLL_CLOSE_NOT_FOUND')
    requireRoomAccess(profile, message.room)

    if (poll.createdBy !== profile._id && !profile.isAdmin) {
      throw new Error('POLL_CLOSE_NOT_AUTHORIZED')
    }

    if (poll.closedAt !== undefined) return

    await ctx.db.patch(poll._id, {
      closedAt: Date.now(),
      closedBy: profile._id,
    })
  },
})
