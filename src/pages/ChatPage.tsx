import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { MessageBubble } from '../features/chat/MessageBubble'
import { OnlineMembers } from '../features/chat/OnlineMembers'
import { useMessages } from '../features/chat/useMessages'
import { useOnlinePresence } from '../features/chat/useOnlinePresence'
import { useProfilesMap } from '../features/chat/useProfilesMap'
import { NotificationToggle } from '../features/notifications/NotificationToggle'
import type { Message } from '../features/chat/useMessages'

const MAX_MESSAGE_LENGTH = 2000
const SCROLL_BOTTOM_THRESHOLD = 80

function ChatPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const { messagesQuery, sendMessage } = useMessages()
  const { data: profiles, refetch: refetchProfiles } = useProfilesMap()
  const onlineUserIds = useOnlinePresence(userId)

  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)

  const listRef = useRef<HTMLUListElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const previousMessageCount = useRef(0)
  const lookedUpAuthorIds = useRef(new Set<string>())
  const messages = messagesQuery.data ?? []

  // Profilkortet caches i 5 minutter, så en besked fra et medlem, der er kommet
  // til siden hen, ville ellers stå uden navn. Hent kortet igen — én gang per
  // ukendt afsender, så en manglende profil ikke udløser en uendelig løkke.
  useEffect(() => {
    if (!profiles || !messagesQuery.data) return
    const unknownAuthorIds = messagesQuery.data
      .map((message) => message.user_id)
      .filter((id) => !profiles[id] && !lookedUpAuthorIds.current.has(id))
    if (unknownAuthorIds.length === 0) return
    unknownAuthorIds.forEach((id) => lookedUpAuthorIds.current.add(id))
    void refetchProfiles()
  }, [messagesQuery.data, profiles, refetchProfiles])

  function scrollToBottom(behavior: ScrollBehavior) {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior })
  }

  useEffect(() => {
    const previousCount = previousMessageCount.current
    const delta = messages.length - previousCount
    if (delta > 0) {
      const isInitialLoad = previousCount === 0
      const latest = messages[messages.length - 1]
      if (isInitialLoad || isNearBottom || latest.user_id === userId) {
        scrollToBottom(isInitialLoad ? 'auto' : 'smooth')
        setNewMessageCount(0)
      } else {
        setNewMessageCount((count) => count + delta)
      }
    }
    previousMessageCount.current = messages.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  function handleScroll() {
    const list = listRef.current
    if (!list) return
    const distanceFromBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight
    const nearBottom = distanceFromBottom < SCROLL_BOTTOM_THRESHOLD
    setIsNearBottom(nearBottom)
    if (nearBottom) setNewMessageCount(0)
  }

  function sendCurrentDraft() {
    const content = draft.trim()
    if (
      !content ||
      content.length > MAX_MESSAGE_LENGTH ||
      sendMessage.isPending
    ) {
      return
    }

    setSendError(null)
    setDraft('')
    const replyToMessageId = replyingTo?.id ?? null
    sendMessage.mutate(
      { userId, content, replyToMessageId },
      {
        onSuccess: () =>
          setReplyingTo((current) =>
            current?.id === replyToMessageId ? null : current,
          ),
        onError: () => {
          setDraft((current) => current || content)
          setSendError('Beskeden kunne ikke sendes. Prøv igen.')
        },
      },
    )
  }

  function selectReply(message: Message) {
    setReplyingTo(message)
    draftRef.current?.focus()
  }

  function cancelReply() {
    setReplyingTo(null)
    draftRef.current?.focus()
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    sendCurrentDraft()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendCurrentDraft()
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-green-900">Chat</h1>
          <p className="text-green-700">Fælles snak for alle medlemmer.</p>
        </div>
        <NotificationToggle userId={userId} />
      </div>
      <OnlineMembers
        onlineUserIds={onlineUserIds}
        profiles={profiles}
        currentUserId={userId}
      />

      {messagesQuery.isPending && (
        <p role="status" className="py-12 text-center text-green-700">
          Henter beskeder…
        </p>
      )}

      {messagesQuery.isError && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-red-800"
        >
          Chatten kunne ikke hentes.
          <button
            type="button"
            onClick={() => messagesQuery.refetch()}
            className="ml-2 underline"
          >
            Prøv igen
          </button>
        </div>
      )}

      {messagesQuery.data && (
        <div className="relative">
          <ul
            ref={listRef}
            onScroll={handleScroll}
            role="log"
            aria-label="Beskeder"
            aria-live={isNearBottom ? 'polite' : 'off'}
            aria-relevant="additions"
            className="flex h-[60svh] flex-col gap-3 overflow-y-auto rounded-lg border border-green-100 bg-white p-4"
          >
            {messages.length === 0 && (
              <li className="py-12 text-center text-green-700">
                Ingen beskeder endnu. Vær den første til at sige hej!
              </li>
            )}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                author={profiles?.[message.user_id]}
                replyAuthor={
                  message.reply_to
                    ? profiles?.[message.reply_to.user_id]
                    : undefined
                }
                isOwn={message.user_id === userId}
                onReply={selectReply}
              />
            ))}
          </ul>

          {newMessageCount > 0 && (
            <>
              <p role="status" className="sr-only">
                {newMessageCount === 1
                  ? '1 ny besked'
                  : `${newMessageCount} nye beskeder`}
              </p>
              <button
                type="button"
                onClick={() => {
                  scrollToBottom('smooth')
                  setNewMessageCount(0)
                }}
                className="absolute bottom-4 left-1/2 min-h-11 -translate-x-1/2 rounded-full bg-green-800 px-4 py-2 text-sm text-white shadow-lg"
              >
                {newMessageCount === 1
                  ? '1 ny besked'
                  : `${newMessageCount} nye beskeder`}{' '}
                ↓
              </button>
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {replyingTo && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-950">
            <p role="status" aria-live="polite" className="min-w-0">
              <span className="font-medium">
                Svarer {profiles?.[replyingTo.user_id]?.full_name ?? 'Medlem'}
              </span>
              <span className="block truncate opacity-75">
                {replyingTo.content}
              </span>
            </p>
            <button
              type="button"
              onClick={cancelReply}
              aria-label="Annuller svar"
              className="min-h-11 shrink-0 rounded px-3 font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-green-800"
            >
              Annuller
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={1}
            placeholder="Skriv en besked…"
            aria-label={
              replyingTo
                ? `Skriv et svar til ${
                    profiles?.[replyingTo.user_id]?.full_name ?? 'Medlem'
                  }`
                : 'Skriv en besked'
            }
            className="min-h-11 flex-1 resize-none rounded-lg border border-green-300 px-4 py-2 text-green-950"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sendMessage.isPending}
            className="min-h-11 shrink-0 rounded-lg bg-green-800 px-5 py-2 text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>

      {sendError && (
        <p role="alert" className="text-sm text-red-700">
          {sendError}
        </p>
      )}
    </main>
  )
}

export default ChatPage
