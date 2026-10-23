import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'

/**
 * Typerne, som chatten arbejder med, udledt af Convex-funktionerne selv.
 *
 * De er ikke skrevet i hånden: `convex/_generated/api` kender allerede
 * returformerne fra `convex/chat.ts` og `convex/chatPolls.ts`, så en ændring i
 * backend'en slår igennem her som en typefejl i stedet for som en tavs
 * forskel mellem to lister af felter. Det er den samme disciplin som
 * `Doc<'messages'>` i backend'en, bare set fra klienten.
 *
 * `api` importeres som værdi, fordi `typeof api` er en værdireference i en
 * typeposition; den kompileres væk i bundlen, og offline-køen (som er ren
 * logik og testes uden browser-API'er) importerer kun typer herfra.
 */

/** Rummet: 'general' for alle medlemmer, 'admin' kun for administratorer. */
export type ChatRoom = FunctionArgs<typeof api.chat.history>['room']

/** Spejler unionen i `convex/tables/chat.ts` (`messageType`). */
export type MessageType = 'text' | 'action'

/** Én side af beskedhistorikken, som `usePaginatedQuery` leverer den. */
export type MessageView =
  FunctionReturnType<typeof api.chat.history>['page'][number]

export type ReactionSummary = MessageView['reactions'][number]
export type ReplyPreview = NonNullable<MessageView['replyTo']>
export type PollSummary = NonNullable<MessageView['poll']>
export type PollOptionSummary = PollSummary['options'][number]

export type ChatMember = FunctionReturnType<typeof api.chat.members>[number]
export type ChatViewer = FunctionReturnType<typeof api.chat.viewer>
export type OnlineMember =
  FunctionReturnType<typeof api.chat.onlineMembers>[number]
export type UnreadSummary = FunctionReturnType<typeof api.chat.unread>[number]
export type SearchResult = FunctionReturnType<typeof api.chat.search>
export type MessageContext = FunctionReturnType<typeof api.chat.context>
