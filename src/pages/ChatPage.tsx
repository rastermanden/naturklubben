import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { MessageBubble } from '../features/chat/MessageBubble'
import { OnlineMembers } from '../features/chat/OnlineMembers'
import { useMessages, useMessageSearch } from '../features/chat/useMessages'
import { useReactions } from '../features/chat/useReactions'
import {
  groupReactionsByMessage,
  summarizeReactions,
} from '../features/chat/reactions'
import { useOnlinePresence } from '../features/chat/useOnlinePresence'
import {
  helpText,
  matchSlashCommandHints,
  parseChatCommand,
} from '../features/chat/slashCommands'
import type { ParsedCommand } from '../features/chat/slashCommands'
import type { AwayState } from '../features/chat/useOnlinePresence'
import { useProfilesMap } from '../features/chat/useProfilesMap'
import {
  applyMention,
  matchMentionCandidates,
  matchMentionQuery,
  mentionMembers,
  resolveMentions,
} from '../features/chat/mentions'
import type { MentionMember } from '../features/chat/mentions'
import { ChatNotificationPreference } from '../features/notifications/ChatNotificationPreference'
import { NotificationToggle } from '../features/notifications/NotificationToggle'
import { useIsAdmin } from '../features/admin/useIsAdmin'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { Message } from '../features/chat/useMessages'

const MAX_MESSAGE_LENGTH = 2000
const SCROLL_BOTTOM_THRESHOLD = 80
const SEARCH_DEBOUNCE_MS = 250

function ChatPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const { messagesQuery, sendMessage, deleteMessage, openMessage } =
    useMessages()
  const { isAdmin } = useIsAdmin()
  const { data: profiles, refetch: refetchProfiles } = useProfilesMap()
  const [away, setAway] = useState<AwayState | null>(null)
  const onlineMembers = useOnlinePresence(userId, away)
  const messages = useMemo(
    () => messagesQuery.data?.messages ?? [],
    [messagesQuery.data?.messages],
  )
  const { reactions, toggleReaction } = useReactions(messages, userId)
  const reactionsByMessage = useMemo(
    () => groupReactionsByMessage(reactions),
    [reactions],
  )

  const [draft, setDraft] = useState('')
  // Markørens position i skrivefeltet: en mention kan skrives midt i teksten,
  // så det er den, og ikke slutningen af feltet, der afgør, hvad der søges på.
  const [caret, setCaret] = useState(0)
  const [pickedMentionIds, setPickedMentionIds] = useState<string[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([])
  const nextNoticeId = useRef(1)
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null)
  // Søgefeltet slår op ved hvert tastetryk; uden pausen ville en hel
  // søgestreng koste ét opslag pr. bogstav, hvoraf kun det sidste bruges.
  const debouncedSearchTerm = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS)
  const searchQuery = useMessageSearch(debouncedSearchTerm)
  // Mens pausen løber, hører resultaterne på skærmen til en ældre søgestreng.
  const isSearchSettling = searchTerm.trim() !== debouncedSearchTerm.trim()
  const commandHints = useMemo(() => matchSlashCommandHints(draft), [draft])

  // Alle med et navn kan nævnes; pickeren viser bare ikke én selv.
  const allMembers = useMemo(() => mentionMembers(profiles), [profiles])
  const pickableMembers = useMemo(
    () => mentionMembers(profiles, userId),
    [profiles, userId],
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

  function nameOf(id: string) {
    return profiles?.[id]?.full_name ?? 'Medlem'
  }

  const listRef = useRef<HTMLUListElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const previousMessageCount = useRef(0)
  const previousOldestMessageId = useRef<string | undefined>(undefined)
  const [prependScrollSnapshot, setPrependScrollSnapshot] = useState<{
    scrollHeight: number
    scrollTop: number
  } | null>(null)
  const lookedUpAuthorIds = useRef(new Set<string>())
  const replyingTo =
    messages.find((message) => message.id === replyingToId) ?? null
  const searchResults =
    searchQuery.data?.pages.flatMap((resultPage) => resultPage.messages) ?? []
  const replyingToName =
    replyingTo?.user_id === null
      ? 'Tidligere medlem'
      : replyingTo
        ? (profiles?.[replyingTo.user_id]?.full_name ?? 'Medlem')
        : null

  // Profilkortet caches i 5 minutter, så en besked fra et medlem, der er kommet
  // til siden hen, ville ellers stå uden navn. Hent kortet igen — én gang per
  // ukendt afsender, så en manglende profil ikke udløser en uendelig løkke.
  useEffect(() => {
    if (!profiles || !messagesQuery.data) return
    const unknownAuthorIds = messagesQuery.data.messages
      .map((message) => message.user_id)
      .filter(
        (id): id is string =>
          id !== null && !profiles[id] && !lookedUpAuthorIds.current.has(id),
      )
    if (unknownAuthorIds.length === 0) return
    unknownAuthorIds.forEach((id) => lookedUpAuthorIds.current.add(id))
    void refetchProfiles()
  }, [messagesQuery.data, profiles, refetchProfiles])

  useEffect(() => {
    if (replyingTo?.deleted_at) setReplyingToId(null)
  }, [replyingTo])

  useLayoutEffect(() => {
    const snapshot = prependScrollSnapshot
    const list = listRef.current
    if (!snapshot || !list) return
    list.scrollTop =
      snapshot.scrollTop + (list.scrollHeight - snapshot.scrollHeight)
    setPrependScrollSnapshot(null)
  }, [prependScrollSnapshot])

  function scrollToBottom(behavior: ScrollBehavior) {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior })
  }

  useEffect(() => {
    const previousCount = previousMessageCount.current
    const delta = messages.length - previousCount
    const oldestMessageId = messages[0]?.id
    const addedOlderMessages =
      previousOldestMessageId.current !== undefined &&
      oldestMessageId !== previousOldestMessageId.current
    if (delta > 0 && !addedOlderMessages) {
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
    previousOldestMessageId.current = oldestMessageId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  useEffect(() => {
    if (!highlightedMessageId) return
    const element = listRef.current?.querySelector(
      `[data-message-id="${highlightedMessageId}"]`,
    )
    element?.scrollIntoView({ block: 'center' })
    const timeout = window.setTimeout(() => setHighlightedMessageId(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [highlightedMessageId, messages])

  async function loadOlderMessages() {
    const list = listRef.current
    const snapshot = list
      ? { scrollHeight: list.scrollHeight, scrollTop: list.scrollTop }
      : null
    try {
      const result = await messagesQuery.fetchNextPage()
      if (result?.isError) return
      setPrependScrollSnapshot(snapshot)
    } catch {
      setPrependScrollSnapshot(null)
    }
  }

  async function openSearchResult(messageId: string) {
    try {
      await openMessage.mutateAsync(messageId)
      setSearchTerm('')
      setHighlightedMessageId(messageId)
    } catch {
      // Mutation state renders the actionable error next to the search results.
    }
  }

  function handleScroll() {
    const list = listRef.current
    if (!list) return
    const distanceFromBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight
    const nearBottom = distanceFromBottom < SCROLL_BOTTOM_THRESHOLD
    setIsNearBottom(nearBottom)
    if (nearBottom) setNewMessageCount(0)
  }

  function pushNotice(text: string) {
    setNotices((current) => [...current, { id: nextNoticeId.current++, text }])
    // Systemlinjen står nederst i strømmen, så den skal rulles frem som en
    // ny besked ville blive det.
    requestAnimationFrame(() => scrollToBottom('smooth'))
  }

  // Kommandoer, der ikke sender noget til chatten, men kun virker for
  // afsenderen selv -- svaret vises som en systemlinje, ingen andre ser.
  function runLocalCommand(
    command: Exclude<ParsedCommand, { kind: 'message' }>,
  ) {
    if (command.kind === 'help') {
      pushNotice(helpText())
      return
    }
    if (command.kind === 'away') {
      setAway({ message: command.message })
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
    // Feltet skal have den nye markørposition, når React har skrevet teksten
    // -- ellers står markøren tilbage i slutningen af feltet.
    requestAnimationFrame(() =>
      field?.setSelectionRange(next.caret, next.caret),
    )
  }

  function sendCurrentDraft() {
    const rawContent = draft.trim()
    if (!rawContent || rawContent.length > MAX_MESSAGE_LENGTH) return

    // De lokale kommandoer sender ingenting og skal derfor virke, også mens
    // en tidligere besked stadig er undervejs.
    const command = parseChatCommand(rawContent)
    if (command && command.kind !== 'message') {
      setDraft('')
      setSendError(null)
      runLocalCommand(command)
      return
    }

    if (sendMessage.isPending) return
    const content = command ? command.content : rawContent
    if (content.length > MAX_MESSAGE_LENGTH) return

    // Mentions læses af den tekst, der faktisk sendes: et navn valgt fra
    // listen og rettet væk igen skal ikke efterlade en usynlig mention. Man
    // nævner ikke sig selv -- chat-push springer alligevel afsenderen over.
    const mentions = resolveMentions(
      content,
      allMembers,
      pickedMentionIds,
    ).filter((id) => id !== userId)

    setSendError(null)
    setDraft('')
    setCaret(0)
    setPickedMentionIds([])
    const replyToMessageId = replyingTo?.id ?? null
    sendMessage.mutate(
      {
        userId,
        content,
        replyToMessageId,
        ...(command?.messageType === 'action'
          ? { messageType: 'action' as const }
          : {}),
        ...(mentions.length > 0 ? { mentions } : {}),
      },
      {
        onSuccess: () =>
          setReplyingToId((current) =>
            current === replyToMessageId ? null : current,
          ),
        onError: () => {
          setDraft((current) => current || rawContent)
          setSendError('Beskeden kunne ikke sendes. Prøv igen.')
        },
      },
    )
  }

  function reactTo(message: Message, emoji: string) {
    const summary = summarizeReactions(
      reactionsByMessage.get(message.id),
      userId,
      nameOf,
    ).find((entry) => entry.emoji === emoji)
    toggleReaction.mutate({
      messageId: message.id,
      emoji,
      reactedByMe: summary?.reactedByMe ?? false,
    })
  }

  function selectReply(message: Message) {
    if (message.deleted_at) return
    setReplyingToId(message.id)
    draftRef.current?.focus()
  }

  function cancelReply() {
    setReplyingToId(null)
    draftRef.current?.focus()
  }

  function deleteSelectedMessage(message: Message) {
    const moderation = message.user_id !== userId
    const confirmation = moderation
      ? 'Vil du fjerne denne besked som administrator? Det oprindelige indhold slettes permanent og kan ikke gendannes.'
      : 'Vil du slette din besked? Det oprindelige indhold slettes permanent og kan ikke gendannes.'
    if (!window.confirm(confirmation)) return

    setDeleteError(null)
    deleteMessage.mutate(message.id, {
      onError: () => setDeleteError('Beskeden kunne ikke slettes. Prøv igen.'),
    })
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    sendCurrentDraft()
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
    // Mention-listen har forrang for både Tab og Enter, mens den er åben:
    // Enter skal vælge det fremhævede navn, ikke sende en halvskrevet besked.
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

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-body">Chat</h1>
          <p className="text-ink-subtle">Fælles snak for alle medlemmer.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <NotificationToggle userId={userId} />
          <ChatNotificationPreference userId={userId} />
        </div>
      </div>
      {onlineMembers.length > 0 && (
        <div className="shrink-0">
          <OnlineMembers
            members={onlineMembers}
            profiles={profiles}
            currentUserId={userId}
          />
        </div>
      )}

      <div className="relative shrink-0">
        <label
          htmlFor="chat-search"
          className="mb-1 block text-sm font-medium text-ink-body"
        >
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
            {(searchQuery.isPending || isSearchSettling) && (
              <p role="status" className="p-3 text-ink-subtle">
                Søger…
              </p>
            )}
            {searchQuery.isError && (
              <p role="alert" className="p-3 text-danger">
                Søgningen kunne ikke gennemføres.
              </p>
            )}
            {openMessage.isError && (
              <p role="alert" className="p-3 text-danger">
                Beskeden kunne ikke åbnes. Den kan være slettet.
              </p>
            )}
            {searchQuery.isSuccess &&
              !isSearchSettling &&
              searchResults.length === 0 && (
                <p className="p-3 text-ink-subtle">Ingen beskeder fundet.</p>
              )}
            {searchResults.length > 0 && (
              <ul aria-label="Søgeresultater">
                {searchResults.map((message) => {
                  const authorName =
                    message.user_id === null
                      ? 'Tidligere medlem'
                      : (profiles?.[message.user_id]?.full_name ?? 'Medlem')
                  return (
                    <li key={message.id}>
                      <button
                        type="button"
                        onClick={() => void openSearchResult(message.id)}
                        disabled={openMessage.isPending}
                        className="min-h-11 w-full rounded px-3 py-2 text-left hover:bg-surface-sunken disabled:opacity-50"
                      >
                        <span className="block text-xs font-medium text-ink-muted">
                          {authorName} ·{' '}
                          {new Date(message.created_at).toLocaleString('da-DK')}
                        </span>
                        <span className="line-clamp-2 text-sm text-ink">
                          {message.content}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {searchQuery.hasNextPage && (
              <button
                type="button"
                onClick={() => void searchQuery.fetchNextPage()}
                disabled={searchQuery.isFetchingNextPage}
                className="min-h-11 w-full rounded px-3 text-sm font-medium text-ink-muted hover:bg-surface-sunken disabled:opacity-50"
              >
                {searchQuery.isFetchingNextPage
                  ? 'Henter flere…'
                  : 'Vis flere resultater'}
              </button>
            )}
          </div>
        )}
      </div>

      {messagesQuery.isPending && (
        <p role="status" className="py-12 text-center text-ink-subtle">
          Henter beskeder…
        </p>
      )}

      {messagesQuery.isError && (
        <div
          role="alert"
          className="rounded border border-danger-line bg-danger-surface p-4 text-danger-strong"
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
            {messagesQuery.hasNextPage && (
              <li className="text-center">
                <button
                  type="button"
                  onClick={() => void loadOlderMessages()}
                  disabled={messagesQuery.isFetchingNextPage}
                  className="min-h-11 rounded px-4 text-sm font-medium text-ink-muted underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {messagesQuery.isFetchingNextPage
                    ? 'Henter ældre…'
                    : 'Hent ældre beskeder'}
                </button>
              </li>
            )}
            {messages.length === 0 && (
              <li className="py-12 text-center text-ink-subtle">
                Ingen beskeder endnu. Vær den første til at sige hej!
              </li>
            )}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                author={
                  message.user_id ? profiles?.[message.user_id] : undefined
                }
                replyAuthor={
                  message.reply_to?.user_id
                    ? profiles?.[message.reply_to.user_id]
                    : undefined
                }
                isOwn={message.user_id === userId}
                canDelete={message.user_id === userId || isAdmin}
                isDeleting={
                  deleteMessage.isPending &&
                  deleteMessage.variables === message.id
                }
                onReply={selectReply}
                reactions={summarizeReactions(
                  reactionsByMessage.get(message.id),
                  userId,
                  nameOf,
                )}
                onToggleReaction={reactTo}
                onDelete={deleteSelectedMessage}
                isHighlighted={message.id === highlightedMessageId}
                isMentioned={message.mentions.includes(userId)}
                members={allMembers}
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
                  className="min-h-11 shrink-0 rounded px-2 font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Luk
                </button>
              </li>
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
                className="absolute bottom-4 left-1/2 min-h-11 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-sm text-white shadow-lg"
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

      <form onSubmit={handleSubmit} className="flex shrink-0 flex-col gap-2">
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
              className="min-h-11 shrink-0 rounded px-3 font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
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
              aria-live="polite"
              className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink"
            >
              Der er ingen andre medlemmer at nævne endnu.
            </p>
          )}
        {mentionCandidates.length > 0 && (
          <div className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink">
            <p role="status" aria-live="polite" className="sr-only">
              {mentionCandidates.length === 1
                ? `1 medlem foreslås: ${mentionCandidates[0].name}.`
                : `${mentionCandidates.length} medlemmer foreslås. Vælg med piletasterne og Enter.`}
            </p>
            <ul id="chat-mentions" aria-label="Nævn et medlem">
              {mentionCandidates.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => selectMention(member)}
                    aria-label={`Nævn ${member.name}`}
                    aria-current={member.id === activeMention?.id}
                    className={`flex min-h-11 w-full items-center gap-2 rounded px-1 text-left hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent ${
                      member.id === activeMention?.id ? 'bg-surface-raised' : ''
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
            <p role="status" aria-live="polite" className="sr-only">
              {commandHints.length === 1
                ? `Kommando: ${commandHints[0].usage}. ${commandHints[0].description}.`
                : `${commandHints.length} kommandoer foreslås.`}
            </p>
            <ul className="flex flex-col gap-1">
              {commandHints.map((hint) => (
                <li key={hint.command}>
                  <button
                    type="button"
                    onClick={() => completeCommand(hint.completion)}
                    aria-label={`Indsæt ${hint.command}`}
                    className="flex min-h-11 w-full items-baseline gap-2 rounded px-1 text-left hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent"
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
            disabled={!draft.trim() || sendMessage.isPending}
            className="min-h-11 shrink-0 rounded-lg bg-accent px-5 py-2 text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>

      {sendError && (
        <p role="alert" className="shrink-0 text-sm text-danger">
          {sendError}
        </p>
      )}
      {deleteError && (
        <p role="alert" className="shrink-0 text-sm text-danger">
          {deleteError}
        </p>
      )}
    </main>
  )
}

export default ChatPage
