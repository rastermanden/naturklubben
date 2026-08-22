import { useEffect, useState } from 'react'
import { formatRelativeTime } from './formatRelativeTime'
import type { Message } from './useMessages'
import type { ProfileSummary } from './useProfilesMap'

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

function Avatar({
  name,
  avatarUrl,
  color,
}: {
  name: string
  avatarUrl: string | null
  color: string
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full object-cover"
        style={{ outlineColor: color, outline: `2px solid ${color}` }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {initials(name) || '?'}
    </span>
  )
}

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

  return (
    <li className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && (
        <Avatar
          name={name}
          avatarUrl={author?.avatar_url ?? null}
          color={color}
        />
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 ${isOwn ? 'text-white' : 'text-green-950'}`}
        style={
          isOwn ? { backgroundColor: color } : { backgroundColor: color + '22' }
        }
      >
        <p
          className={`mb-0.5 text-xs font-medium ${isOwn ? 'text-right text-white/80' : ''}`}
          style={isOwn ? undefined : { color }}
        >
          {name}
        </p>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className="mt-1 text-right text-xs opacity-70" title={fullTimestamp}>
          {formatRelativeTime(message.created_at)}
        </p>
      </div>
    </li>
  )
}
