import { useEffect, useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { MessageReactions, ReactionPicker } from './MessageReactions'
import { readableTextColor } from '../../lib/colorContrast'
import { formatRelativeTime } from './formatRelativeTime'
import type { ReactionSummary } from './reactions'
import type { Message } from './useMessages'
import type { ProfileSummary } from './useProfilesMap'

export function MessageBubble({
  message,
  author,
  replyAuthor,
  isOwn,
  onReply,
  reactions,
  onToggleReaction,
}: {
  message: Message
  author: ProfileSummary | undefined
  replyAuthor: ProfileSummary | undefined
  isOwn: boolean
  onReply: (message: Message) => void
  reactions: ReactionSummary[]
  onToggleReaction: (message: Message, emoji: string) => void
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
  const fullTimestamp = new Date(message.created_at).toLocaleString('da-DK')
  const replyName =
    message.reply_to?.user_id === null
      ? 'Tidligere medlem'
      : (replyAuthor?.full_name ?? 'Medlem')
  const replyExcerpt = message.reply_to?.content.trim().replace(/\s+/g, ' ')
  const textColor = isOwn ? readableTextColor(color) : '#052e16'

  return (
    <li className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <Avatar
        name={name}
        avatarUrl={author?.avatar_url ?? null}
        color={color}
        size="md"
        decorative
      />
      <div
        className="max-w-[75%] rounded-2xl px-4 py-2"
        style={{
          backgroundColor: isOwn ? color : color + '22',
          color: textColor,
        }}
      >
        {message.reply_to_message_id && (
          <blockquote
            className={`mb-2 rounded-lg border-l-4 px-3 py-2 text-sm ${
              isOwn
                ? 'border-white/60 bg-black/10'
                : 'border-green-500/50 bg-white/70'
            }`}
          >
            <p className="text-xs font-semibold">{replyName}</p>
            <p className="line-clamp-2 opacity-80">
              {replyExcerpt || 'Den oprindelige besked er ikke tilgængelig.'}
            </p>
          </blockquote>
        )}
        <p
          className={`mb-0.5 text-xs font-medium ${isOwn ? 'text-right' : ''}`}
        >
          {name}
        </p>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className="mt-1 text-right text-xs" title={fullTimestamp}>
          {formatRelativeTime(message.created_at)}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onReply(message)}
            aria-label={`Svar på besked fra ${name}`}
            className="mt-1 min-h-11 rounded px-2 text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Svar
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            aria-expanded={pickerOpen}
            aria-label={`Reagér på besked fra ${name}`}
            className="mt-1 min-h-11 rounded px-2 text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Reagér
          </button>
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
      </div>
    </li>
  )
}
