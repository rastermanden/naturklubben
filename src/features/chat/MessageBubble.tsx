import { useEffect, useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { readableTextColor } from '../../lib/colorContrast'
import { formatRelativeTime } from './formatRelativeTime'
import type { Message } from './useMessages'
import type { ProfileSummary } from './useProfilesMap'

export function MessageBubble({
  message,
  author,
  isOwn,
}: {
  message: Message
  author: ProfileSummary | undefined
  isOwn: boolean
}) {
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceUpdate((tick) => tick + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const name = author?.full_name ?? 'Medlem'
  const color = author?.chat_color ?? '#16a34a'
  const fullTimestamp = new Date(message.created_at).toLocaleString('da-DK')
  const textColor = isOwn ? readableTextColor(color) : '#052e16'

  return (
    <li className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && (
        <Avatar
          name={name}
          avatarUrl={author?.avatar_url ?? null}
          color={color}
          size="md"
          decorative
        />
      )}
      <div
        className="max-w-[75%] rounded-2xl px-4 py-2"
        style={{
          backgroundColor: isOwn ? color : color + '22',
          color: textColor,
        }}
      >
        <p
          className={`mb-0.5 text-xs font-medium ${isOwn ? 'text-right' : ''}`}
        >
          {name}
        </p>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className="mt-1 text-right text-xs" title={fullTimestamp}>
          {formatRelativeTime(message.created_at)}
        </p>
      </div>
    </li>
  )
}
