import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { MessageBubble } from '../features/chat/MessageBubble'
import { useMessages } from '../features/chat/useMessages'
import { useProfilesMap } from '../features/chat/useProfilesMap'
import { NotificationToggle } from '../features/notifications/NotificationToggle'

const MAX_MESSAGE_LENGTH = 2000
const SCROLL_BOTTOM_THRESHOLD = 80

function ChatPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const { messagesQuery, sendMessage } = useMessages()
  const { data: profiles, refetch: refetchProfiles } = useProfilesMap()

  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const [isNearBottom, setIsNearBottom] = useState(true)

  const listRef = useRef<HTMLUListElement>(null)
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
    sendMessage.mutate(
      { userId, content },
      { onError: () => setSendError('Beskeden kunne ikke sendes. Prøv igen.') },
    )
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

      {messagesQuery.isPending && (
        <p className="py-12 text-center text-green-700">Henter beskeder…</p>
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
                isOwn={message.user_id === userId}
              />
            ))}
          </ul>

          {newMessageCount > 0 && (
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
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          placeholder="Skriv en besked…"
          aria-label="Skriv en besked"
          className="min-h-11 flex-1 resize-none rounded-lg border border-green-300 px-4 py-2 text-green-950"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sendMessage.isPending}
          className="min-h-11 shrink-0 rounded-lg bg-green-800 px-5 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
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
