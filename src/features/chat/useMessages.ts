import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface Message {
  id: string
  user_id: string | null
  content: string
  created_at: string
}

const MESSAGE_HISTORY_LIMIT = 100
const queryKey = ['messages']

async function fetchRecentMessages(): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, user_id, content, created_at')
    .order('created_at', { ascending: false })
    .limit(MESSAGE_HISTORY_LIMIT)
  if (error) throw error
  return data.reverse()
}

function addMessage(current: Message[] | undefined, message: Message) {
  if (!current) return [message]
  if (current.some((existing) => existing.id === message.id)) return current
  return [...current, message]
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
          queryClient.setQueryData<Message[]>(queryKey, (current) =>
            addMessage(current, payload.new as Message),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const updated = payload.new as Message
          queryClient.setQueryData<Message[]>(queryKey, (current) =>
            current?.map((message) =>
              message.id === updated.id ? updated : message,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          queryClient.setQueryData<Message[]>(queryKey, (current) =>
            current?.filter((message) => message.id !== deletedId),
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
    }: {
      userId: string
      content: string
    }) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({ user_id: userId, content })
        .select('id, user_id, content, created_at')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (message) => {
      queryClient.setQueryData<Message[]>(queryKey, (current) =>
        addMessage(current, message),
      )
      void notifyOthers(message.id)
    },
  })

  return { messagesQuery, sendMessage }
}
