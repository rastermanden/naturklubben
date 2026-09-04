import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { MessageReactions, ReactionPicker } from './MessageReactions'
import { readableTextColor } from '../../lib/colorContrast'
import { formatRelativeTime } from './formatRelativeTime'
import { splitLinks } from './linkify'
import { splitMentions } from './mentions'
import type { MentionMember } from './mentions'
import type { ReactionSummary } from './reactions'
import type { Message } from './useMessages'
import type { ProfileSummary } from './useProfilesMap'

/**
 * Beskedteksten med de nævnte medlemmer fremhævet. Navnet, der fremhæves, er
 * det, afsenderen skrev -- id'et bag mention'en afgør bare, om der skal
 * fremhæves. Har den nævnte skiftet navn siden, står den gamle stavemåde
 * tilbage som almindelig tekst; selve mention'en er der stadig, og beskeden er
 * fortsat markeret for den, den gælder.
 */
function MessageText({
  content,
  mentions,
  members,
}: {
  content: string
  mentions: string[]
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

export function MessageBubble({
  message,
  author,
  replyAuthor,
  isOwn,
  canDelete,
  isDeleting = false,
  onReply,
  reactions,
  onToggleReaction,
  onDelete,
  isHighlighted = false,
  isMentioned = false,
  members = [],
}: {
  message: Message
  author: ProfileSummary | undefined
  replyAuthor: ProfileSummary | undefined
  isOwn: boolean
  canDelete?: boolean
  isDeleting?: boolean
  onReply: (message: Message) => void
  reactions: ReactionSummary[]
  onToggleReaction: (message: Message, emoji: string) => void
  onDelete?: (message: Message) => void
  isHighlighted?: boolean
  /** Er læseren selv nævnt i beskeden? */
  isMentioned?: boolean
  /** Medlemmer, mentions kan slås op i -- navnet følger et navneskift. */
  members?: readonly MentionMember[]
}) {
  const [, forceUpdate] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => {
    const id = setInterval(() => forceUpdate((tick) => tick + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const isFormerMember = message.user_id === null
  const name = isFormerMember
    ? 'Tidligere medlem'
    : (author?.full_name ?? 'Medlem')
  const color = isFormerMember ? '#64748b' : (author?.chat_color ?? '#16a34a')
  const isAction = message.message_type === 'action'
  const fullTimestamp = new Date(message.created_at).toLocaleString('da-DK')
  const replyName =
    message.reply_to?.user_id === null
      ? 'Tidligere medlem'
      : (replyAuthor?.full_name ?? 'Medlem')
  const replyExcerpt = message.reply_to?.content.trim().replace(/\s+/g, ' ')
  const textColor = isOwn ? readableTextColor(color) : 'var(--color-ink)'
  const isDeleted = message.deleted_at !== null
  const wasDeletedByAdmin =
    isDeleted &&
    message.deleted_by !== null &&
    message.deleted_by !== message.user_id
  const replyWasDeleted = Boolean(message.reply_to?.deleted_at)

  return (
    <li
      data-message-id={message.id}
      className={`flex rounded-lg ${
        isAction
          ? 'justify-center'
          : `items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`
      } ${isHighlighted ? 'outline-4 outline-warn-ring' : ''} ${
        isMentioned && !isDeleted ? 'ring-2 ring-warn-ring' : ''
      }`}
    >
      {!isAction && (
        <Avatar
          name={name}
          avatarUrl={author?.avatar_url ?? null}
          color={color}
          size="md"
          decorative
        />
      )}
      <div
        className={
          isAction
            ? 'max-w-[85%] rounded-full px-4 py-1.5'
            : 'max-w-[75%] rounded-2xl px-4 py-2'
        }
        style={
          isAction
            ? undefined
            : {
                backgroundColor: isOwn ? color : color + '22',
                color: textColor,
              }
        }
      >
        {!isAction && message.reply_to_message_id && (
          <blockquote
            className={`mb-2 rounded-lg border-l-4 px-3 py-2 text-sm ${
              isOwn
                ? 'border-quote-own-line bg-quote-own'
                : 'border-quote-line bg-quote'
            }`}
          >
            <p className="text-xs font-semibold">{replyName}</p>
            <p className="line-clamp-2 opacity-80">
              {replyWasDeleted
                ? 'Beskeden er slettet.'
                : replyExcerpt || 'Den oprindelige besked er ikke tilgængelig.'}
            </p>
          </blockquote>
        )}
        {!isAction && (
          <p
            className={`mb-0.5 text-xs font-medium ${
              isOwn ? 'text-right' : ''
            }`}
          >
            {name}
          </p>
        )}
        {isMentioned && !isDeleted && (
          <p
            className={`mb-1 text-xs font-semibold ${
              isAction ? 'text-center text-ink-muted' : ''
            }`}
          >
            Du er nævnt
          </p>
        )}
        {isDeleted ? (
          <div className="py-1 text-sm italic opacity-75">
            <p>Beskeden er slettet.</p>
            {wasDeletedByAdmin && <p>Slettet af en administrator.</p>}
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
        <p
          className={`mt-1 text-xs ${
            isAction ? 'text-center opacity-70' : 'text-right'
          }`}
          title={fullTimestamp}
        >
          {formatRelativeTime(message.created_at)}
        </p>
        {!isDeleted && (
          <>
            <div
              className={`mt-1 flex flex-wrap items-center gap-1 ${
                isAction ? 'justify-center' : 'justify-end'
              }`}
            >
              <button
                type="button"
                onClick={() => onReply(message)}
                aria-label={`Svar på besked fra ${name}`}
                className="min-h-11 rounded px-2 text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-50"
              >
                Svar
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen((open) => !open)}
                aria-expanded={pickerOpen}
                aria-label={`Reagér på besked fra ${name}`}
                className="min-h-11 rounded px-2 text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                Reagér
              </button>
              {canDelete && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(message)}
                  disabled={isDeleting}
                  aria-label={`Slet besked fra ${name}`}
                  className="min-h-11 rounded px-2 text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-50"
                >
                  {isDeleting ? 'Sletter…' : 'Slet'}
                </button>
              )}
            </div>

            {pickerOpen && (
              <ReactionPicker
                summaries={reactions}
                onToggle={(emoji) => {
                  onToggleReaction(message, emoji)
                  setPickerOpen(false)
                }}
              />
            )}

            <MessageReactions
              summaries={reactions}
              isOwn={isOwn}
              onToggle={(emoji) => onToggleReaction(message, emoji)}
            />
          </>
        )}
      </div>
    </li>
  )
}
