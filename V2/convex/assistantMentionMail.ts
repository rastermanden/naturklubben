import { ConvexError, v } from 'convex/values'
import { internal } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server'
import type { Id } from './_generated/dataModel'
import { authFromAddress, postResendEmail } from './authEmail'
import {
  assistantMentionEmail,
  assistantMentionMail,
  assistantProfileEmail,
  messageMentionsAssistant,
} from './assistantMention'

type DbCtx = QueryCtx | MutationCtx

/** Profilen bag den konfigurerede adresse, eller null hvis den ikke er oprettet endnu. */
export async function findAssistantProfileId(
  ctx: DbCtx,
): Promise<Id<'profiles'> | null> {
  const email = assistantProfileEmail()
  const account = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'password').eq('providerAccountId', email),
    )
    .unique()
  if (account === null) return null
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', account.userId))
    .unique()
  return profile?._id ?? null
}

export const detail = internalQuery({
  args: { messageId: v.id('messages') },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId)
    if (message === null || message.deletedAt !== undefined) return null
    const authorId = message.authorId
    if (authorId === undefined) return null
    const to = assistantMentionEmail(env.ASSISTANT_MENTION_EMAIL)
    const assistantProfileId = await findAssistantProfileId(ctx)
    if (
      !messageMentionsAssistant({
        content: message.content,
        mentionIds: message.mentions.map((id) => String(id)),
        assistantProfileId:
          assistantProfileId === null ? null : String(assistantProfileId),
        authorProfileId: String(authorId),
      })
    ) {
      return null
    }
    const author = await ctx.db.get(authorId)
    return {
      room: message.room,
      authorName: author?.fullName?.trim() || 'Et medlem',
      createdAt: message.createdAt,
      content: message.content,
      to,
    }
  },
})

/** True, hvis denne kørsel må sende. En række der allerede findes, betyder at mailen er taget. */
export const claim = internalMutation({
  args: { messageId: v.id('messages') },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query('assistantMentionMails')
      .withIndex('by_message', (q) => q.eq('messageId', args.messageId))
      .unique()
    if (existing !== null) return false
    await ctx.db.insert('assistantMentionMails', {
      messageId: args.messageId,
      sentAt: Date.now(),
    })
    return true
  },
})

export const release = internalMutation({
  args: { messageId: v.id('messages') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const existing = await ctx.db
      .query('assistantMentionMails')
      .withIndex('by_message', (q) => q.eq('messageId', args.messageId))
      .unique()
    if (existing !== null) await ctx.db.delete(existing._id)
    return null
  },
})

/**
 * Sender højst én mail om beskeden til den konfigurerede adresse.
 * Uden Resend-nøgle logges det, og beskeden i chatten er stadig gemt.
 */
export const notify = internalAction({
  args: { messageId: v.id('messages') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const message = await ctx.runQuery(internal.assistantMentionMail.detail, {
      messageId: args.messageId,
    })
    if (message === null) return null
    const claimed = await ctx.runMutation(internal.assistantMentionMail.claim, {
      messageId: args.messageId,
    })
    if (!claimed) return null

    const apiKey = env.RESEND_API_KEY?.trim()
    const mail = assistantMentionMail({
      room: message.room,
      authorName: message.authorName,
      createdAt: message.createdAt,
      content: message.content,
      siteUrl: env.SITE_URL ?? 'https://naturklubben.dk',
    })
    if (!apiKey) {
      console.log(`Assistent-mail uden nøgle (${message.room})`)
      return null
    }

    try {
      const result = await postResendEmail({
        apiKey,
        from: authFromAddress(env.AUTH_EMAIL_FROM),
        to: message.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        fetchImpl: fetch,
      })
      if (!result.accepted) {
        console.error(`Assistent-mail afvist status ${result.status}`)
        await ctx.runMutation(internal.assistantMentionMail.release, {
          messageId: args.messageId,
        })
      }
    } catch {
      console.error('Assistent-mail blev ikke sendt')
      await ctx.runMutation(internal.assistantMentionMail.release, {
        messageId: args.messageId,
      })
    }
    return null
  },
})

export const PROBE_CONFIRM = 'PROBE_MENTION_MAIL'

/**
 * Sender én prøvemail til den konfigurerede modtager uden at skrive i chatten.
 * Bekræftelsen gør, at et almindeligt kald ikke vækker indbakken.
 */
export const probe = internalAction({
  args: { confirm: v.string() },
  returns: v.object({ accepted: v.boolean() }),
  handler: async (_ctx, args): Promise<{ accepted: boolean }> => {
    if (args.confirm !== PROBE_CONFIRM) throw new ConvexError('NOT_CONFIRMED')
    const apiKey = env.RESEND_API_KEY?.trim()
    if (!apiKey) return { accepted: false }
    const result = await postResendEmail({
      apiKey,
      from: authFromAddress(env.AUTH_EMAIL_FROM),
      to: assistantMentionEmail(env.ASSISTANT_MENTION_EMAIL),
      subject: 'Naturklubben: omtale-mail virker',
      text: 'Dette er en prøve på omtale-mailen. Der er ikke skrevet i chatten.',
      html: '<!doctype html><html lang="da"><body><p>Dette er en prøve på omtale-mailen. Der er ikke skrevet i chatten.</p></body></html>',
      fetchImpl: fetch,
    })
    return { accepted: result.accepted }
  },
})
