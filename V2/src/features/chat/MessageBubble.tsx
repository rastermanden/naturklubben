import { useEffect, useMemo, useState } from 'react'
import { MemberAvatar } from './MemberAvatar'
import { MessageReactions, ReactionPicker } from './MessageReactions'
import { PollCard } from './PollCard'
import { readableTextColor } from './constants'
import { formatRelativeTime } from './formatRelativeTime'
import { splitLinks } from './linkify'
import { splitMentions } from './mentions'
import type { MentionMember } from './mentions'
import type { MessageView, PollSummary } from './types'

/**
 * Beskedteksten med de nævnte medlemmer fremhævet. Navnet, der fremhæves, er
 * det, afsenderen skrev -- id'et bag mention'en afgør bare, om der skal
 * fremhæves. Har den nævnte skiftet navn siden, står den gamle stavemåde
 * tilbage som almindelig tekst; selve mention'en er der stadig.
 */
function MessageText({
  content,
  mentions,
  members,
}: {
  content: string
  mentions: MessageView['mentions']
  members: readonly MentionMember[]
}) {
  const segments = useMemo(
    () => splitMentions(content, mentions, members),
    [content, mentions, members],
  )

  return (
    <>
      {segments.map((segment, index) =>
        segment.mentionedId ? (
          <span
            key={index}
            className="rounded bg-amber-200/80 px-1 font-semibold text-ink-fixed"
          >
            {segment.text}
          </span>
        ) : (
          <LinkifiedText key={index} text={segment.text} />
        ),
      )}
    </>
  )
}

/** Almindelig tekst med links gjort klikbare. */
function LinkifiedText({ text }: { text: string }) {
  const segments = useMemo(() => splitLinks(text), [text])

  return (
    <>
      {segments.map((segment, index) =>
        segment.href ? (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:no-underline"
          >
            {segment.text}
          </a>
        ) : (
          segment.text
        ),
      )}
    </>
  )
}

// Ikonknapper i stedet for ord: rækken med Svar/Reagér/Slet fyldte 44 px under
// hver eneste besked. 32 px er stadig et rigeligt trykmål (WCAG 2.5.8 beder om
// 24), og skærmlæseren får de samme navne som før. Tegnene bærer U+FE0E, så de
// tegnes som skrifttegn i boblens egen farve og ikke som farvede emoji.
const ACTION_BUTTON_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-full text-sm hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-50'

export function MessageBubble({
  message,
  isOwn,
  canDelete,
  isDeleting = false,
  isHighlighted = false,
  isMentioned = false,
  members = [],
  onReply,
  onToggleReaction,
  onDelete,
  onVotePoll,
  onClosePoll,
  isPollBusy = false,
}: {
  message: MessageView
  isOwn: boolean
  canDelete?: boolean
  isDeleting?: boolean
  isHighlighted?: boolean
  /** Er læseren selv nævnt i beskeden? */
  isMentioned?: boolean
  /** Medlemmer, mentions kan slås op i -- navnet følger et navneskift. */
  members?: readonly MentionMember[]
  onReply: (message: MessageView) => void
  onToggleReaction: (message: MessageView, emoji: string) => void
  onDelete?: (message: MessageView) => void
  onVotePoll?: (poll: PollSummary, optionId: string) => void
  onClosePoll?: (poll: PollSummary) => void
  isPollBusy?: boolean
}) {
  const [, forceUpdate] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Den relative tid ("5 min") skal opdateres, selv når der ikke kommer nye
  // beskeder -- ellers ville en besked fra kl. ni stå som "nu" hele dagen.
  useEffect(() => {
    const id = setInterval(() => forceUpdate((tick) => tick + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const isFormerMember = message.authorId === null
  const name = isFormerMember ? 'Tidligere medlem' : (message.authorName ?? 'Medlem')
  const color = message.chatColor
  const isAction = message.messageType === 'action'
  // En besked, der har ligget i offline-køen, viser det tidspunkt, den blev
  // skrevet; rækkefølgen i listen er stadig serverens. Er de to forskellige,
  // står begge i tooltip'en.
  const displayTimestamp = message.writtenAt ?? message.createdAt
  const fullTimestamp =
    message.writtenAt !== null && message.writtenAt !== message.createdAt
      ? `Skrevet ${new Date(message.writtenAt).toLocaleString('da-DK')} · modtaget ${new Date(message.createdAt).toLocaleString('da-DK')}`
      : new Date(displayTimestamp).toLocaleString('da-DK')
  const replyExcerpt = message.replyTo?.content.trim().replace(/\s+/g, ' ')
  const textColor = isOwn ? readableTextColor(color) : 'var(--color-ink)'
  const isDeleted = message.deletedAt !== null
  const poll = message.poll

  return (
    <li
      data-message-id={message.messageId}
      className={`flex rounded-lg ${
        isAction
          ? 'justify-center'
          : `items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`
      } ${isHighlighted ? 'outline-4 outline-warn-ring' : ''} ${
        isMentioned && !isDeleted ? 'ring-2 ring-warn-ring' : ''
      }`}
    >
      {!isAction && (
        <MemberAvatar
          name={name}
          color={color}
          avatarUrl={message.avatarUrl}
          decorative
        />
      )}
      <div
        className={
          isAction
            ? 'max-w-[85%] rounded-full px-4 py-1.5'
            : 'max-w-[75%] rounded-2xl px-3 py-1.5'
        }
        style={
          isAction
            ? undefined
            : {
                backgroundColor: isOwn ? color : `${color}22`,
                color: textColor,
              }
        }
      >
        <div
          className={`mb-0.5 flex flex-wrap items-center gap-x-1.5 text-xs ${
            isAction
              ? 'justify-center'
              : isOwn
                ? 'flex-row-reverse text-right'
                : ''
          }`}
        >
          {!isAction && <span className="font-medium">{name}</span>}
          {/* Kort form på skærmen, præcist tidspunkt til den, der peger på
              det -- og til skærmlæseren, som ellers ville læse "6 d" op. */}
          <time
            dateTime={new Date(displayTimestamp).toISOString()}
            title={fullTimestamp}
            aria-label={fullTimestamp}
            className="opacity-70"
          >
            {formatRelativeTime(displayTimestamp)}
          </time>
          {isMentioned && !isDeleted && (
            <span
              className={`font-semibold ${isAction ? 'text-ink-muted' : ''}`}
            >
              Du er nævnt
            </span>
          )}
          {!isDeleted && (
            <span className="flex items-center">
              <button
                type="button"
                onClick={() => onReply(message)}
                aria-label={`Svar på besked fra ${name}`}
                title="Svar"
                className={ACTION_BUTTON_CLASS}
              >
                <span aria-hidden="true">↩︎</span>
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen((open) => !open)}
                aria-expanded={pickerOpen}
                aria-label={`Reagér på besked fra ${name}`}
                title="Reagér"
                className={ACTION_BUTTON_CLASS}
              >
                <span aria-hidden="true">☺︎</span>
              </button>
              {canDelete && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(message)}
                  disabled={isDeleting}
                  aria-label={`Slet besked fra ${name}`}
                  title={isDeleting ? 'Sletter…' : 'Slet'}
                  className={ACTION_BUTTON_CLASS}
                >
                  <span aria-hidden="true">{isDeleting ? '…' : '×'}</span>
                </button>
              )}
            </span>
          )}
        </div>
        {!isAction && message.replyTo && (
          <blockquote
            className={`mb-2 rounded-lg border-l-4 px-3 py-2 text-sm ${
              isOwn
                ? 'border-quote-own-line bg-quote-own'
                : 'border-quote-line bg-quote'
            }`}
          >
            <p className="text-xs font-semibold">
              {message.replyTo.authorName ?? 'Tidligere medlem'}
            </p>
            <p className="line-clamp-2 opacity-80">
              {message.replyTo.deleted
                ? 'Beskeden er slettet.'
                : replyExcerpt || 'Den oprindelige besked er ikke tilgængelig.'}
            </p>
          </blockquote>
        )}
        {isDeleted ? (
          <div className="py-1 text-sm italic opacity-75">
            <p>Beskeden er slettet.</p>
            {message.deletedByAdmin && <p>Slettet af en administrator.</p>}
          </div>
        ) : isAction ? (
          <p className="text-center text-sm italic text-ink-muted">
            <span aria-hidden="true">* </span>
            <span className="font-medium">{name}</span>{' '}
            <MessageText
              content={message.content}
              mentions={message.mentions}
              members={members}
            />
          </p>
        ) : (
          <p className="whitespace-pre-wrap break-words">
            <MessageText
              content={message.content}
              mentions={message.mentions}
              members={members}
            />
          </p>
        )}
        {!isDeleted && poll && (
          <PollCard
            poll={poll}
            isBusy={isPollBusy}
            onVote={(optionId) => onVotePoll?.(poll, optionId)}
            onClose={() => onClosePoll?.(poll)}
          />
        )}
        {!isDeleted && (
          <>
            {pickerOpen && (
              <ReactionPicker
                summaries={message.reactions}
                onToggle={(emoji) => {
                  onToggleReaction(message, emoji)
                  setPickerOpen(false)
                }}
              />
            )}
            <MessageReactions
              summaries={message.reactions}
              isOwn={isOwn}
              onToggle={(emoji) => onToggleReaction(message, emoji)}
            />
          </>
        )}
      </div>
    </li>
  )
}
