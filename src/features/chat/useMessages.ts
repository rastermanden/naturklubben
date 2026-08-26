import { useEffect, useRef } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export type MessageType = 'text' | 'action'

export interface Message {
  id: string
  user_id: string | null
  content: string
  message_type?: MessageType
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
  reply_to_message_id: string | null
  reply_to: ReplyPreview | null
}

export interface ReplyPreview {
  id: string
  user_id: string | null
  content: string
  deleted_at: string | null
  deleted_by: string | null
}

export interface MessageRow {
  id: string
  user_id: string | null
  content: string
  message_type?: string
  created_at: string
  deleted_at?: string | null
  deleted_by?: string | null
  reply_to_message_id?: string | null
  reply_to?: ReplyPreview | ReplyPreview[] | null
}

export const MESSAGE_HISTORY_LIMIT = 100
const SEARCH_RESULT_LIMIT = 20
const queryKey = ['messages']
const searchQueryKey = ['message-search']
// Svarets ophav indlejres med *kolonnenavnet* som hint, ikke med
// foreign key'ens navn. PostgREST slår ikke en selvrefererende relation op på
// constraint-navnet: `messages!messages_reply_to_message_id_fkey` svarer
// PGRST200 "Could not find a relationship between 'messages' and 'messages'",
// selv om constraint'en findes i databasen. Og fordi embeddet indgår i *hver*
// beskedhentning, væltede det hele chatten -- ikke bare svar-visningen.
// Verificeret mod produktions-API'et: kolonnenavnet svarer 200, constraint-
// navnet 400. Skift det ikke tilbage.
export const messageFields = `
  id,
  user_id,
  content,
  message_type,
  created_at,
  deleted_at,
  deleted_by,
  reply_to_message_id,
  reply_to:messages!reply_to_message_id (
    id,
    user_id,
    content,
    deleted_at,
    deleted_by
  )
`

export function normalizeMessage(row: MessageRow): Message {
  const replyTo = Array.isArray(row.reply_to)
    ? (row.reply_to[0] ?? null)
    : (row.reply_to ?? null)

  return {
    id: row.id,
    user_id: row.user_id,
    content: row.content,
    message_type: row.message_type === 'action' ? 'action' : 'text',
    created_at: row.created_at,
    deleted_at: row.deleted_at ?? null,
    deleted_by: row.deleted_by ?? null,
    reply_to_message_id: row.reply_to_message_id ?? null,
    reply_to: replyTo,
  }
}

export interface MessagePage {
  messages: Message[]
  hasMore: boolean
}

export interface MessageCursor {
  createdAt: string
  id: string
}

export function mergeMessagePages(pages: MessagePage[]): Message[] {
  const seen = new Set<string>()
  return pages
    .flatMap((page) => page.messages)
    .sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id),
    )
    .filter((message) => {
      if (seen.has(message.id)) return false
      seen.add(message.id)
      return true
    })
}

async function fetchMessagePage(
  cursor: MessageCursor | undefined,
): Promise<MessagePage> {
  let query = supabase
    .from('messages')
    .select(messageFields)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGE_HISTORY_LIMIT + 1)

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const { data, error } = await query
  if (error) throw error
  return {
    messages: data.slice(0, MESSAGE_HISTORY_LIMIT).map(normalizeMessage),
    hasMore: data.length > MESSAGE_HISTORY_LIMIT,
  }
}

function previewOf(message: ReplyPreview): ReplyPreview {
  return {
    id: message.id,
    user_id: message.user_id,
    content: message.content,
    deleted_at: message.deleted_at,
    deleted_by: message.deleted_by,
  }
}

export function addMessage(
  current: Message[] | undefined,
  incoming: Message,
): Message[] {
  const replyTo =
    incoming.reply_to ??
    current?.find((message) => message.id === incoming.reply_to_message_id)
  const message = {
    ...incoming,
    reply_to: replyTo ? previewOf(replyTo) : null,
  }

  if (!current) return [message]
  if (current.some((existing) => existing.id === message.id)) return current
  return [...current, message]
}

export function needsReplyRefetch(
  current: Message[] | undefined,
  incoming: Message,
): boolean {
  return Boolean(
    incoming.reply_to_message_id &&
    !incoming.reply_to &&
    !current?.some((message) => message.id === incoming.reply_to_message_id),
  )
}

export function removeMessage(
  current: Message[] | undefined,
  deletedId: string,
): Message[] | undefined {
  return current
    ?.filter((message) => message.id !== deletedId)
    .map((message) =>
      message.reply_to_message_id === deletedId
        ? { ...message, reply_to_message_id: null, reply_to: null }
        : message,
    )
}

export function updateMessage(
  current: Message[] | undefined,
  incoming: MessageRow,
): Message[] | undefined {
  if (!current) return current

  const existing = current.find((message) => message.id === incoming.id)
  const updated = normalizeMessage({
    ...incoming,
    reply_to: incoming.reply_to ?? existing?.reply_to,
  })

  return current.map((message) => {
    if (message.id === updated.id) return updated
    if (message.reply_to_message_id === updated.id) {
      return { ...message, reply_to: previewOf(updated) }
    }
    return message
  })
}

export function addMessageToHistory(
  history: InfiniteData<MessagePage> | undefined,
  incoming: Message,
): InfiniteData<MessagePage> | undefined {
  if (!history) return history
  const current = mergeMessagePages(history.pages)
  const updated = addMessage(current, incoming)
  if (updated === current) return history
  const added = updated.find(
    (message) => !current.some((existing) => existing.id === message.id),
  )
  if (!added) return history
  return {
    pageParams: history.pageParams,
    pages: history.pages.map((page, index) =>
      index === 0 ? { ...page, messages: [added, ...page.messages] } : page,
    ),
  }
}

function updateMessageInHistory(
  history: InfiniteData<MessagePage> | undefined,
  incoming: MessageRow,
): InfiniteData<MessagePage> | undefined {
  if (!history) return history
  let changed = false
  const pages = history.pages.map((page) => {
    if (
      !page.messages.some(
        (message) =>
          message.id === incoming.id ||
          message.reply_to_message_id === incoming.id,
      )
    ) {
      return page
    }
    changed = true
    return {
      ...page,
      messages: updateMessage(page.messages, incoming) ?? page.messages,
    }
  })
  return changed ? { ...history, pages } : history
}

function removeMessageFromHistory(
  history: InfiniteData<MessagePage> | undefined,
  deletedId: string,
): InfiniteData<MessagePage> | undefined {
  if (!history) return history
  let changed = false
  const pages = history.pages.map((page) => {
    const messages = page.messages
      .filter((message) => {
        if (message.id !== deletedId) return true
        changed = true
        return false
      })
      .map((message) => {
        if (message.reply_to_message_id !== deletedId) return message
        changed = true
        return { ...message, reply_to_message_id: null, reply_to: null }
      })
    return changed ? { ...page, messages } : page
  })
  return changed ? { ...history, pages } : history
}

/**
 * Beder chat-push-edge-functionen sende en notifikation til de andre
 * medlemmers telefoner. Samme mønster som optimize-image efter en upload:
 * beskeden er allerede gemt og vist, så en fejl her må ikke vælte afsendelsen
 * -- så går de andre bare glip af *notifikationen*, ikke af beskeden, som de
 * stadig får live via Realtime.
 *
 * Kun besked-id'et sendes med; functionen slår selv indholdet op og nægter at
 * sende for en besked, kalderen ikke selv har skrevet.
 */
async function notifyOthers(messageId: string) {
  const { error } = await supabase.functions.invoke('chat-push', {
    body: { messageId },
  })
  if (error) console.warn('Notifikationer kunne ikke sendes', error)
}

export function useMessages() {
  const queryClient = useQueryClient()
  const liveMessages = useRef(new Map<string, Message>())
  const deletedMessageIds = useRef(new Set<string>())
  const wasFetching = useRef(false)

  const messagesQuery = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as MessageCursor | undefined,
    queryFn: ({ pageParam }) => fetchMessagePage(pageParam),
    getNextPageParam: (lastPage) => {
      const oldest = lastPage.messages.at(-1)
      return lastPage.hasMore && oldest
        ? { createdAt: oldest.created_at, id: oldest.id }
        : undefined
    },
    select: (history) => ({
      ...history,
      messages: mergeMessagePages(history.pages),
    }),
  })

  // A server fetch is assembled from a snapshot of the old pages. Reapply
  // concurrent Realtime events once when that fetch completes so its snapshot
  // cannot make a newly arrived message disappear.
  useEffect(() => {
    if (messagesQuery.isFetching) {
      wasFetching.current = true
      return
    }
    if (!wasFetching.current) return
    wasFetching.current = false
    if (
      liveMessages.current.size === 0 &&
      deletedMessageIds.current.size === 0
    ) {
      return
    }
    queryClient.setQueryData<InfiniteData<MessagePage>>(queryKey, (history) => {
      let updated = history
      for (const deletedId of deletedMessageIds.current) {
        updated = removeMessageFromHistory(updated, deletedId)
      }
      for (const message of liveMessages.current.values()) {
        if (!deletedMessageIds.current.has(message.id)) {
          updated = addMessageToHistory(updated, message)
          updated = updateMessageInHistory(updated, message)
        }
      }
      return updated
    })
  }, [messagesQuery.isFetching, queryClient])

  useEffect(() => {
    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const message = normalizeMessage(payload.new as MessageRow)
          deletedMessageIds.current.delete(message.id)
          const history =
            queryClient.getQueryData<InfiniteData<MessagePage>>(queryKey)
          const current = history ? mergeMessagePages(history.pages) : undefined
          const enriched =
            addMessage(current, message).find(
              (candidate) => candidate.id === message.id,
            ) ?? message
          liveMessages.current.set(enriched.id, enriched)
          queryClient.setQueryData<InfiniteData<MessagePage>>(
            queryKey,
            (history) => addMessageToHistory(history, enriched),
          )
          if (needsReplyRefetch(current, message)) {
            void queryClient.invalidateQueries({ queryKey })
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const normalized = normalizeMessage(payload.new as MessageRow)
          const history =
            queryClient.getQueryData<InfiniteData<MessagePage>>(queryKey)
          const existing = history
            ? mergeMessagePages(history.pages).find(
                (message) => message.id === normalized.id,
              )
            : undefined
          const enriched = {
            ...normalized,
            reply_to: normalized.reply_to ?? existing?.reply_to ?? null,
          }
          liveMessages.current.set(enriched.id, enriched)
          queryClient.setQueryData<InfiniteData<MessagePage>>(
            queryKey,
            (history) => updateMessageInHistory(history, enriched),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          liveMessages.current.delete(deletedId)
          deletedMessageIds.current.add(deletedId)
          queryClient.setQueryData<InfiniteData<MessagePage>>(
            queryKey,
            (history) => removeMessageFromHistory(history, deletedId),
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const sendMessage = useMutation({
    mutationFn: async ({
      userId,
      content,
      replyToMessageId,
      messageType = 'text',
    }: {
      userId: string
      content: string
      replyToMessageId: string | null
      messageType?: MessageType
    }) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          user_id: userId,
          content,
          reply_to_message_id: replyToMessageId,
          message_type: messageType,
        })
        .select(messageFields)
        .single()
      if (error) throw error
      return normalizeMessage(data)
    },
    onSuccess: (message) => {
      liveMessages.current.set(message.id, message)
      queryClient.setQueryData<InfiniteData<MessagePage>>(queryKey, (history) =>
        addMessageToHistory(history, message),
      )
      void notifyOthers(message.id)
    },
  })

  const deleteMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc('soft_delete_message', {
        p_message_id: messageId,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const openMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase.rpc('get_chat_message_context', {
        target_message_id: messageId,
      })
      if (error) throw error
      const rows = data as (MessageRow & { has_more_older: boolean })[]
      if (!rows.some((row) => row.id === messageId)) {
        throw new Error('Beskeden findes ikke længere.')
      }
      return {
        messages: rows.map(normalizeMessage).reverse(),
        hasMore: rows[0]?.has_more_older ?? false,
      } satisfies MessagePage
    },
    onSuccess: (page) => {
      queryClient.setQueryData<InfiniteData<MessagePage>>(queryKey, {
        pages: [page],
        pageParams: [undefined],
      })
    },
  })

  return { messagesQuery, sendMessage, deleteMessage, openMessage }
}

export function useMessageSearch(searchTerm: string) {
  const normalizedTerm = searchTerm.trim()
  return useInfiniteQuery({
    queryKey: [...searchQueryKey, normalizedTerm],
    enabled: normalizedTerm.length > 0,
    initialPageParam: undefined as MessageCursor | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('search_chat_messages', {
        search_query: normalizedTerm,
        before_created_at: pageParam?.createdAt ?? null,
        before_id: pageParam?.id ?? null,
        page_size: SEARCH_RESULT_LIMIT + 1,
      })
      if (error) throw error
      const rows = data as MessageRow[]
      return {
        messages: rows.slice(0, SEARCH_RESULT_LIMIT).map(normalizeMessage),
        hasMore: rows.length > SEARCH_RESULT_LIMIT,
      }
    },
    getNextPageParam: (lastPage) => {
      const oldest = lastPage.messages.at(-1)
      return lastPage.hasMore && oldest
        ? { createdAt: oldest.created_at, id: oldest.id }
        : undefined
    },
  })
}
