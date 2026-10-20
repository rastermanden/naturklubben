import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Id } from '../../convex/_generated/dataModel'
import {
  useChatContext,
  useChatMembers,
  useChatUnread,
  useChatViewer,
  useChatPresence,
  useOnlineMembers,
  useChatSearch,
  useMessages,
} from '../features/chat/useChat'
import type { ChatViewer, ChatRoom, MessageView, PollSummary } from '../features/chat/types'
import { MessageBubble } from '../features/chat/MessageBubble'
import { OnlineMembers } from '../features/chat/OnlineMembers'
import { PendingMessage } from '../features/chat/PendingMessage'
import { useFullscreen } from '../features/chat/useFullscreen'
import {
  helpText,
  matchSlashCommandHints,
  parseChatCommand,
} from '../features/chat/slashCommands'
import type { ParsedCommand } from '../features/chat/slashCommands'
import {
  applyMention,
  matchMentionCandidates,
  matchMentionQuery,
  mentionMembers,
  resolveMentions,
} from '../features/chat/mentions'
import type { MentionMember } from '../features/chat/mentions'

/**
 * Chatten (#14), og det samme for admin-rummet (#212).
 *
 * Siden er bevidst den samme for begge rum: `ChatPage` vælger rum, og resten
 * kender ikke forskellen. Adgangen håndhæves i backend (`requireAdmin` i
 * `convex/chat.ts` for hver funktion, der rører admin-rummet) -- ruten er
 * pakket ind i `AdminRoute` for at slippe for at vise en side, der alligevel
 * ikke kan hente noget, men det er ikke det, der beskytter data.
 *
 * Forskellen fra den gamle app er først og fremmest, hvad der *ikke* er her:
 * ingen `supabase.channel`, ingen `queryClient.invalidateQueries`, ingen
 * sammenfletning af Realtime-events med en cache. Beskeder, reaktioner og
 * stemmer kommer ind gennem `useQuery`/`usePaginatedQuery`, som abonnerer på
 * det, de læser.
 */

const MAX_MESSAGE_LENGTH = 2000
const SCROLL_BOTTOM_THRESHOLD = 80

interface ChatPageProps {
  room?: ChatRoom
}

/**
 * Yderste lag: hvem læseren er. Alt andet venter på det svar, fordi både
 * "Du er nævnt" og "Slet" kræver profil-id'et.
 */
function ChatPage({ room = 'general' }: ChatPageProps) {
  const viewer = useChatViewer()

  if (viewer === undefined) {
    return (
      <p role="status" className="p-6 text-center text-ink-subtle">
        Henter chatten…
      </p>
    )
  }

  return <ChatRoomView room={room} viewer={viewer} />
}

function ChatRoomView({ room, viewer }: { room: ChatRoom; viewer: ChatViewer }) {
  const chat = useMessages(room, viewer.profileId)
  const memberList = useChatMembers()
  const onlineMembers = useOnlineMembers(room) ?? []
  const unread = useChatUnread()
  const { isFullscreen, toggleFullscreen } = useFullscreen()
  const unreadHere = unread?.find((entry) => entry.room === room)

  const [draft, setDraft] = useState('')
  // Markørens position i skrivefeltet: en mention kan skrives midt i teksten,
  // så det er den, og ikke slutningen af feltet, der afgør, hvad der søges på.
  const [caret, setCaret] = useState(0)
  const [pickedMentionIds, setPickedMentionIds] = useState<Id<'profiles'>[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [replyingToId, setReplyingToId] = useState<Id<'messages'> | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [openMessageId, setOpenMessageId] = useState<Id<'messages'> | null>(null)
  const [away, setAway] = useState<string | null>(null)
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([])
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    Id<'messages'> | null
  >(null)
  const nextNoticeId = useRef(1)

  const search = useChatSearch(room, searchTerm)
  const messageContext = useChatContext(openMessageId)

  useChatPresence({
    room,
    isAway: away !== null,
    awayMessage: away,
  })

  // Mention-vælgeren viser alle andre end én selv; mention-fortolkningen ved
  // afsendelsen bruger hele listen, så et navn skrevet i hånden også tæller.
  const allMembers = useMemo(
    () => mentionMembers(memberList),
    [memberList],
  )
  const pickableMembers = useMemo(
    () => mentionMembers(memberList, viewer.profileId),
    [memberList, viewer.profileId],
  )
  const mentionQuery = useMemo(
    () => matchMentionQuery(draft, caret),
    [draft, caret],
  )
  const mentionCandidates = useMemo(
    () =>
      mentionQuery && !mentionDismissed
        ? matchMentionCandidates(pickableMembers, mentionQuery.query)
        : [],
    [mentionQuery, mentionDismissed, pickableMembers],
  )
  const activeMention =
    mentionCandidates[Math.min(mentionIndex, mentionCandidates.length - 1)] ??
    null
  const commandHints = useMemo(() => matchSlashCommandHints(draft), [draft])

  const replyingTo =
    chat.messages.find((message) => message.messageId === replyingToId) ?? null

  const listRef = useRef<HTMLUListElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const previousMessageCount = useRef(0)
  const previousQueuedCount = useRef(0)
  const [prependScrollSnapshot, setPrependScrollSnapshot] = useState<{
    scrollHeight: number
    scrollTop: number
  } | null>(null)
  const markRoomReadRef = useRef(chat.markRoomRead)
  markRoomReadRef.current = chat.markRoomRead

  // Rummet er læst, når det åbnes. Uden dette ville ulæst-tallet i appens
  // navigation aldrig falde til ro.
  useEffect(() => {
    void markRoomReadRef.current().catch(() => {})
    // markRoomReadRef peger altid på den nyeste funktion; effekten skal kun
    // køre, når rummet skifter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  useEffect(() => {
    if (replyingTo && replyingTo.deletedAt !== null) setReplyingToId(null)
  }, [replyingTo])

  useLayoutEffect(() => {
    const snapshot = prependScrollSnapshot
    const list = listRef.current
    if (!snapshot || !list) return
    list.scrollTop = snapshot.scrollTop + (list.scrollHeight - snapshot.scrollHeight)
    setPrependScrollSnapshot(null)
  }, [prependScrollSnapshot])

  function scrollToBottom(behavior: ScrollBehavior) {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior })
  }

  useEffect(() => {
    const previousCount = previousMessageCount.current
    const delta = chat.messages.length - previousCount
    if (delta > 0) {
      const isInitialLoad = previousCount === 0
      const latest = chat.messages[chat.messages.length - 1]
      if (isInitialLoad || isNearBottom || latest.authorId === viewer.profileId) {
        scrollToBottom(isInitialLoad ? 'auto' : 'smooth')
        setNewMessageCount(0)
      } else {
        setNewMessageCount((count) => count + delta)
      }
    }
    previousMessageCount.current = chat.messages.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.messages])

  // En besked, der lægges i køen, skal stå nederst i strømmen, akkurat som en
  // sendt besked ville gøre -- man skal kunne se, at den kom af sted.
  useEffect(() => {
    if (chat.queuedMessages.length > previousQueuedCount.current) {
      scrollToBottom('smooth')
    }
    previousQueuedCount.current = chat.queuedMessages.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.queuedMessages.length])

  useEffect(() => {
    if (!highlightedMessageId) return
    const element = listRef.current?.querySelector(
      `[data-message-id="${highlightedMessageId}"]`,
    )
    element?.scrollIntoView({ block: 'center' })
    const timeout = window.setTimeout(() => setHighlightedMessageId(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [highlightedMessageId, chat.messages])

  function handleScroll() {
    const list = listRef.current
    if (!list) return
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight
    const nearBottom = distanceFromBottom < SCROLL_BOTTOM_THRESHOLD
    setIsNearBottom(nearBottom)
    if (nearBottom) {
      setNewMessageCount(0)
      // Kun når der faktisk er noget ulæst: ellers ville hver eneste scroll
      // skrive en mutation, som ingen kunne se forskel på.
      if ((unreadHere?.unread ?? 0) > 0) {
        void markRoomReadRef.current().catch(() => {})
      }
    }
  }

  async function loadOlderMessages() {
    const list = listRef.current
    const snapshot = list
      ? { scrollHeight: list.scrollHeight, scrollTop: list.scrollTop }
      : null
    await chat.loadOlder()
    setPrependScrollSnapshot(snapshot)
  }

  function pushNotice(text: string) {
    setNotices((current) => [...current, { id: nextNoticeId.current++, text }])
    requestAnimationFrame(() => scrollToBottom('smooth'))
  }

  // Kommandoer, der ikke sender noget til chatten, men kun virker for
  // afsenderen selv -- svaret vises som en systemlinje, ingen andre ser.
  function runLocalCommand(
    command: Exclude<ParsedCommand, { kind: 'message' } | { kind: 'poll' }>,
  ) {
    if (command.kind === 'help') {
      pushNotice(helpText())
      return
    }
    if (command.kind === 'error') {
      pushNotice(command.message)
      return
    }
    if (command.kind === 'away') {
      setAway(command.message)
      pushNotice(
        command.message
          ? `Du er nu markeret som væk: ${command.message}`
          : 'Du er nu markeret som væk.',
      )
      return
    }
    setAway(null)
    pushNotice('Du er ikke længere markeret som væk.')
  }

  function updateDraft(value: string, nextCaret: number) {
    setDraft(value)
    setCaret(nextCaret)
    setMentionDismissed(false)
    setMentionIndex(0)
  }

  function selectMention(member: MentionMember) {
    if (!mentionQuery) return
    const next = applyMention(draft, mentionQuery, member)
    updateDraft(next.text, next.caret)
    setPickedMentionIds((current) =>
      current.includes(member.id) ? current : [...current, member.id],
    )
    const field = draftRef.current
    field?.focus()
    requestAnimationFrame(() => field?.setSelectionRange(next.caret, next.caret))
  }

  // "/afstemning" sender selve spørgsmålet som en helt almindelig besked --
  // afstemningen er ikke andet end en besked, den hænger på -- og kalder
  // derefter `chatPolls.createPoll` med besked-id'et og svarene. Fejler det
  // bagefter, står spørgsmålet tilbage som en almindelig tekstbesked uden
  // afstemningskort; det er sjældent nok til ikke at kræve en oprydning her.
  async function sendPoll(question: string, options: string[], originalInput: string) {
    try {
      const sent = await chat.sendMessage({
        content: question,
        replyToMessageId: null,
      })
      if (sent.messageId === null) {
        setDraft((current) => current || originalInput)
        setSendError('En afstemning kan først oprettes, når du er online igen.')
        return
      }
      await chat.createPoll(sent.messageId, options)
    } catch {
      setDraft((current) => current || originalInput)
      setSendError('Afstemningen kunne ikke oprettes. Prøv igen.')
    }
  }

  function sendCurrentDraft() {
    const rawContent = draft.trim()
    if (!rawContent || rawContent.length > MAX_MESSAGE_LENGTH) return

    // De lokale kommandoer sender ingenting og skal derfor virke, også mens en
    // tidligere besked stadig er undervejs.
    const command = parseChatCommand(rawContent)
    if (command && command.kind === 'poll') {
      setDraft('')
      setSendError(null)
      void sendPoll(command.question, command.options, rawContent)
      return
    }
    if (command && command.kind !== 'message') {
      setDraft('')
      setSendError(null)
      runLocalCommand(command)
      return
    }

    const content = command ? command.content : rawContent
    if (content.length > MAX_MESSAGE_LENGTH) return

    // Mentions læses af den tekst, der faktisk sendes: et navn valgt fra listen
    // og rettet væk igen skal ikke efterlade en usynlig mention. Man nævner
    // ikke sig selv.
    const mentions = resolveMentions(content, allMembers, pickedMentionIds).filter(
      (id) => id !== viewer.profileId,
    )

    setSendError(null)
    setDraft('')
    setCaret(0)
    setPickedMentionIds([])
    const replyToMessageId = replyingTo?.messageId ?? null
    void chat
      .sendMessage({
        content,
        replyToMessageId,
        ...(command?.messageType === 'action'
          ? { messageType: 'action' as const }
          : {}),
        ...(mentions.length > 0 ? { mentions } : {}),
      })
      .then(() => setReplyingToId(null))
      .catch(() => {
        // Fejlen står allerede i `chat.sendError`, når den ikke kunne lægges i
        // køen; kladden lægges tilbage, så teksten ikke er tabt.
        setDraft((current) => current || rawContent)
      })
  }

  function selectReply(message: MessageView) {
    if (message.deletedAt !== null) return
    setReplyingToId(message.messageId)
    draftRef.current?.focus()
  }

  function cancelReply() {
    setReplyingToId(null)
    draftRef.current?.focus()
  }

  function deleteSelectedMessage(message: MessageView) {
    const moderation = message.authorId !== viewer.profileId
    const confirmation = moderation
      ? 'Vil du fjerne denne besked som administrator? Det oprindelige indhold slettes permanent og kan ikke gendannes.'
      : 'Vil du slette din besked? Det oprindelige indhold slettes permanent og kan ikke gendannes.'
    if (!window.confirm(confirmation)) return

    setDeleteError(null)
    void chat.deleteMessage(message.messageId).catch(() => {
      setDeleteError('Beskeden kunne ikke slettes. Prøv igen.')
    })
  }

  function reactTo(message: MessageView, emoji: string) {
    void chat.toggleReaction(message.messageId, emoji).catch(() => {
      pushNotice('Reaktionen kunne ikke gemmes. Prøv igen.')
    })
  }

  function votePoll(poll: PollSummary, optionId: string) {
    void chat
      .castVote(poll.pollId, optionId as Id<'pollOptions'>)
      .catch(() => pushNotice('Stemmen kunne ikke gemmes. Prøv igen.'))
  }

  function closePoll(poll: PollSummary) {
    void chat
      .closePoll(poll.pollId)
      .catch(() => pushNotice('Afstemningen kunne ikke lukkes. Prøv igen.'))
  }

  function completeCommand(completion: string) {
    updateDraft(completion, completion.length)
    draftRef.current?.focus()
  }

  // Tab udfylder kun, når der er ét oplagt forslag tilbage -- ellers skal
  // tabulator stadig kunne flytte fokus videre til Send-knappen.
  const tabCompletion =
    commandHints.length === 1 && !commandHints[0].isComplete
      ? commandHints[0].completion
      : null

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Mention-listen har forrang for både Tab og Enter, mens den er åben: Enter
    // skal vælge det fremhævede navn, ikke sende en halvskrevet besked.
    if (activeMention) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionIndex(
          (index) => (index + 1) % Math.max(mentionCandidates.length, 1),
        )
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionIndex(
          (index) =>
            (index - 1 + mentionCandidates.length) % mentionCandidates.length,
        )
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionDismissed(true)
        return
      }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault()
        selectMention(activeMention)
        return
      }
    }
    if (event.key === 'Tab' && tabCompletion) {
      event.preventDefault()
      completeCommand(tabCompletion)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendCurrentDraft()
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    sendCurrentDraft()
  }

  const replyingToName = replyingTo?.authorName ?? 'Tidligere medlem'
  const contextMessages = messageContext?.messages ?? []

  return (
    <>
      {/* Fuldskærmen lægger sig over app-shellen -- header, menu og footer --
          men chatten skal stadig stå i en læsbar bredde på en stor skærm.
          Derfor maler et bundlag hele vinduet, og selve spalten står centreret
          ovenpå. */}
      {isFullscreen && (
        <div className="fixed inset-0 z-40 bg-app" aria-hidden="true" />
      )}
      <section
        className={`mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-hidden p-4 sm:gap-4 sm:p-6 ${
          isFullscreen ? 'fixed inset-0 z-50' : ''
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink-body sm:text-2xl">
              {room === 'admin' ? 'Admin-chat' : 'Chat'}
            </h1>
            <p className="text-sm text-ink-subtle">
              {room === 'admin'
                ? 'Kun synlig for administratorer.'
                : 'Fælles snak for alle medlemmer.'}
              {unreadHere && unreadHere.mentions > 0
                ? ` · ${unreadHere.mentions} nye mentions`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? 'Afslut fuldskærm' : 'Vis chatten i fuldskærm'}
            title={isFullscreen ? 'Afslut fuldskærm' : 'Fuldskærm'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line-strong text-lg text-ink-body"
          >
            <span aria-hidden="true">{isFullscreen ? '⤡' : '⤢'}</span>
          </button>
        </div>

        {onlineMembers.length > 0 && (
          <div className="shrink-0">
            <OnlineMembers members={onlineMembers} />
          </div>
        )}

        <div className="relative shrink-0">
          <label htmlFor="chat-search" className="sr-only">
            Søg i beskeder
          </label>
          <input
            id="chat-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Søg i hele historikken…"
            className="min-h-11 w-full rounded-lg border border-line-strong px-4 py-2 text-ink"
          />
          {searchTerm.trim() && (
            <div className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-line bg-surface p-2 shadow-lg">
              {search.isSearching && (
                <p role="status" className="p-3 text-ink-subtle">
                  Søger…
                </p>
              )}
              {!search.isSearching && search.results.length === 0 && (
                <p className="p-3 text-ink-subtle">Ingen beskeder fundet.</p>
              )}
              {search.results.length > 0 && (
                <ul aria-label="Søgeresultater">
                  {search.results.map((message) => (
                    <li key={message.messageId}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMessageId(message.messageId)
                          setHighlightedMessageId(message.messageId)
                          setSearchTerm('')
                        }}
                        className="min-h-11 w-full rounded px-3 py-2 text-left hover:bg-surface-sunken"
                      >
                        <span className="block text-xs font-medium text-ink-muted">
                          {message.authorName ?? 'Tidligere medlem'} ·{' '}
                          {new Date(message.createdAt).toLocaleString('da-DK')}
                        </span>
                        <span className="line-clamp-2 text-sm text-ink">
                          {message.content}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {search.hasMore && (
                <button
                  type="button"
                  onClick={search.loadMore}
                  className="min-h-11 w-full rounded px-3 text-sm font-medium text-ink-muted hover:bg-surface-sunken"
                >
                  Vis flere resultater
                </button>
              )}
            </div>
          )}
        </div>

        {openMessageId && (
          <div className="shrink-0 rounded-lg border border-line bg-surface-sunken p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                Beskeden i sin sammenhæng
              </p>
              <button
                type="button"
                onClick={() => setOpenMessageId(null)}
                className="min-h-11 rounded px-2 text-sm font-medium underline-offset-2 hover:underline"
              >
                Luk
              </button>
            </div>
            {messageContext === undefined ? (
              <p role="status" className="text-sm text-ink-subtle">
                Henter…
              </p>
            ) : contextMessages.length === 0 ? (
              <p className="text-sm text-ink-subtle">
                Beskeden findes ikke længere. Den kan være slettet.
              </p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
                {contextMessages.map((message) => (
                  <li
                    key={message.messageId}
                    className={`rounded px-2 py-1 ${
                      message.messageId === openMessageId
                        ? 'outline-2 outline-warn-ring'
                        : ''
                    }`}
                  >
                    <span className="font-medium text-ink">
                      {message.authorName ?? 'Tidligere medlem'}:
                    </span>{' '}
                    <span className="text-ink-body">{message.content}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {chat.isFirstLoad && (
          <p role="status" className="py-12 text-center text-ink-subtle">
            Henter beskeder…
          </p>
        )}

        {!chat.isFirstLoad && (
          <div className="relative min-h-0 flex-1">
            <ul
              ref={listRef}
              onScroll={handleScroll}
              role="log"
              aria-label="Beskeder"
              aria-live={isNearBottom ? 'polite' : 'off'}
              aria-relevant="additions"
              className="flex h-full flex-col gap-3 overflow-y-auto rounded-lg border border-line-soft bg-surface p-4"
            >
              {chat.hasMore && (
                <li className="text-center">
                  <button
                    type="button"
                    onClick={() => void loadOlderMessages()}
                    disabled={chat.isLoadingMore}
                    className="min-h-11 rounded px-4 text-sm font-medium text-ink-muted underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {chat.isLoadingMore ? 'Henter ældre…' : 'Hent ældre beskeder'}
                  </button>
                </li>
              )}
              {chat.messages.length === 0 && chat.queuedMessages.length === 0 && (
                <li className="py-12 text-center text-ink-subtle">
                  Ingen beskeder endnu. Vær den første til at sige hej!
                </li>
              )}
              {chat.messages.map((message) => (
                <MessageBubble
                  key={message.messageId}
                  message={message}
                  isOwn={message.authorId === viewer.profileId}
                  canDelete={
                    message.authorId === viewer.profileId || viewer.isAdmin
                  }
                  isHighlighted={message.messageId === highlightedMessageId}
                  isMentioned={message.mentions.includes(viewer.profileId)}
                  members={allMembers}
                  onReply={selectReply}
                  onToggleReaction={reactTo}
                  onDelete={deleteSelectedMessage}
                  onVotePoll={votePoll}
                  onClosePoll={closePoll}
                />
              ))}
              {chat.queuedMessages.map((entry) => (
                <PendingMessage
                  key={entry.clientId}
                  entry={entry}
                  author={viewer}
                  replyTo={
                    chat.messages.find(
                      (message) => message.messageId === entry.replyToMessageId,
                    ) ?? null
                  }
                  onRetry={chat.retryQueued}
                  onDiscard={chat.discardQueued}
                />
              ))}
              {notices.map((notice) => (
                <li
                  key={notice.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-body"
                >
                  <p role="status" className="whitespace-pre-wrap">
                    {notice.text}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setNotices((current) =>
                        current.filter((entry) => entry.id !== notice.id),
                      )
                    }
                    aria-label="Luk systembesked"
                    className="min-h-11 shrink-0 rounded px-2 font-medium underline-offset-2 hover:underline"
                  >
                    Luk
                  </button>
                </li>
              ))}
            </ul>

            {newMessageCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  scrollToBottom('smooth')
                  setNewMessageCount(0)
                }}
                className="absolute bottom-4 left-1/2 min-h-11 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-sm text-white shadow-lg"
              >
                {newMessageCount === 1
                  ? '1 ny besked'
                  : `${newMessageCount} nye beskeder`}{' '}
                ↓
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex shrink-0 flex-col gap-2">
          {chat.isOffline && (
            <p
              role="status"
              className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-body"
            >
              Du er offline. Beskeder sendes automatisk, når du igen har
              forbindelse.
            </p>
          )}
          {replyingTo && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink">
              <p role="status" aria-live="polite" className="min-w-0">
                <span className="font-medium">Svarer {replyingToName}</span>
                <span className="block truncate opacity-75">
                  {replyingTo.content}
                </span>
              </p>
              <button
                type="button"
                onClick={cancelReply}
                aria-label="Annuller svar"
                className="min-h-11 shrink-0 rounded px-3 font-medium underline-offset-2 hover:underline"
              >
                Annuller
              </button>
            </div>
          )}
          {mentionQuery &&
            !mentionDismissed &&
            mentionCandidates.length === 0 &&
            pickableMembers.length === 0 && (
              <p
                role="status"
                className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink"
              >
                Der er ingen andre medlemmer at nævne endnu.
              </p>
            )}
          {mentionCandidates.length > 0 && (
            <div className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink">
              <ul id="chat-mentions" aria-label="Nævn et medlem">
                {mentionCandidates.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => selectMention(member)}
                      aria-label={`Nævn ${member.name}`}
                      aria-current={member.id === activeMention?.id}
                      className={`flex min-h-11 w-full items-center gap-2 rounded px-1 text-left hover:bg-surface-raised ${
                        member.id === activeMention?.id
                          ? 'bg-surface-raised'
                          : ''
                      }`}
                    >
                      <span className="font-medium">@{member.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 px-1 text-xs opacity-75">
                Tryk Enter eller Tab for at indsætte navnet.
              </p>
            </div>
          )}
          {commandHints.length > 0 && (
            <div className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink">
              <ul className="flex flex-col gap-1">
                {commandHints.map((hint) => (
                  <li key={hint.command}>
                    <button
                      type="button"
                      onClick={() => completeCommand(hint.completion)}
                      aria-label={`Indsæt ${hint.command}`}
                      className="flex min-h-11 w-full items-baseline gap-2 rounded px-1 text-left hover:bg-surface-raised"
                    >
                      <span className="shrink-0 font-medium">{hint.usage}</span>
                      <span className="min-w-0 truncate opacity-75">
                        {hint.description}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {tabCompletion && (
                <p className="mt-1 px-1 text-xs opacity-75">
                  Tryk Tab for at udfylde.
                </p>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={draftRef}
              value={draft}
              onChange={(event) =>
                updateDraft(
                  event.target.value,
                  event.target.selectionStart ?? event.target.value.length,
                )
              }
              onSelect={(event) =>
                setCaret(event.currentTarget.selectionStart ?? caret)
              }
              onKeyDown={handleKeyDown}
              aria-controls={
                mentionCandidates.length > 0 ? 'chat-mentions' : undefined
              }
              aria-expanded={mentionCandidates.length > 0}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={1}
              placeholder="Skriv en besked…"
              aria-label={
                replyingTo
                  ? `Skriv et svar til ${replyingToName}`
                  : 'Skriv en besked'
              }
              className="min-h-11 flex-1 resize-none rounded-lg border border-line-strong px-4 py-2 text-ink"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="min-h-11 shrink-0 rounded-lg bg-accent px-5 py-2 text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>

        {(sendError ?? chat.sendError) && (
          <p role="alert" className="shrink-0 text-sm text-danger">
            {sendError ?? chat.sendError}
          </p>
        )}
        {deleteError && (
          <p role="alert" className="shrink-0 text-sm text-danger">
            {deleteError}
          </p>
        )}
      </section>
    </>
  )
}

export default ChatPage
