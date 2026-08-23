import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface Message {
  id: string
  user_id: string | null
  content: string
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

interface MessageRow {
  id: string
  user_id: string | null
  content: string
  created_at: string
  deleted_at?: string | null
  deleted_by?: string | null
  reply_to_message_id?: string | null
  reply_to?: ReplyPreview | ReplyPreview[] | null
}

const MESSAGE_HISTORY_LIMIT = 100
const queryKey = ['messages']
const messageFields = `
  id,
  user_id,
  content,
  created_at,
  deleted_at,
  deleted_by,
  reply_to_message_id,
  reply_to:messages!messages_reply_to_message_id_fkey (
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
    created_at: row.created_at,
    deleted_at: row.deleted_at ?? null,
    deleted_by: row.deleted_by ?? null,
    reply_to_message_id: row.reply_to_message_id ?? null,
    reply_to: replyTo,
  }
}

async function fetchRecentMessages(): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(messageFields)
    .order('created_at', { ascending: false })
    .limit(MESSAGE_HISTORY_LIMIT)
  if (error) throw error
  return data.reverse().map(normalizeMessage)
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

  const messagesQuery = useQuery({ queryKey, queryFn: fetchRecentMessages })

  useEffect(() => {
    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const message = normalizeMessage(payload.new as MessageRow)
          const current = queryClient.getQueryData<Message[]>(queryKey)
          queryClient.setQueryData<Message[]>(queryKey, (current) =>
            addMessage(current, message),
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
          queryClient.setQueryData<Message[]>(queryKey, (current) =>
            updateMessage(current, payload.new as MessageRow),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          queryClient.setQueryData<Message[]>(queryKey, (current) =>
            removeMessage(current, deletedId),
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
    }: {
      userId: string
      content: string
      replyToMessageId: string | null
    }) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          user_id: userId,
          content,
          reply_to_message_id: replyToMessageId,
        })
        .select(messageFields)
        .single()
      if (error) throw error
      return normalizeMessage(data)
    },
    onSuccess: (message) => {
      queryClient.setQueryData<Message[]>(queryKey, (current) =>
        addMessage(current, message),
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

  return { messagesQuery, sendMessage, deleteMessage }
}
