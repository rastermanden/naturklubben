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
}: {
  name: string
  avatarUrl: string | null
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-200 text-xs font-medium text-green-900"
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
  const fullTimestamp = new Date(message.created_at).toLocaleString('da-DK')

  return (
    <li className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && <Avatar name={name} avatarUrl={author?.avatar_url ?? null} />}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
          isOwn ? 'bg-green-800 text-white' : 'bg-green-50 text-green-950'
        }`}
      >
        {!isOwn && (
          <p className="mb-0.5 text-xs font-medium text-green-700">{name}</p>
        )}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p
          className={`mt-1 text-right text-xs ${
            isOwn ? 'text-green-100' : 'text-green-600'
          }`}
          title={fullTimestamp}
        >
          {formatRelativeTime(message.created_at)}
        </p>
      </div>
    </li>
  )
}
