import { useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { readByLabel } from './readReceipts'

export interface Reader {
  id: string
  name: string
  avatarUrl: string | null
  color: string
}

const MAX_SHOWN = 5

/**
 * Små avatarer under en besked for dem, der senest har læst netop den
 * (#294). Et tryk viser navnene.
 */
export function ReadByAvatars({
  readers,
  isOwn,
}: {
  readers: readonly Reader[]
  isOwn: boolean
}) {
  const [showNames, setShowNames] = useState(false)
  if (readers.length === 0) return null

  const label = readByLabel(readers.map((reader) => reader.name))
  const shown = readers.slice(0, MAX_SHOWN)
  const hidden = readers.length - shown.length

  return (
    <div
      className={`mt-1 flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}
    >
      <button
        type="button"
        onClick={() => setShowNames((value) => !value)}
        aria-label={label}
        aria-expanded={showNames}
        className="flex min-h-6 items-center -space-x-1 rounded-full px-1"
      >
        {shown.map((reader) => (
          <Avatar
            key={reader.id}
            name={reader.name}
            avatarUrl={reader.avatarUrl}
            color={reader.color}
            size="xs"
            decorative
          />
        ))}
        {hidden > 0 && (
          <span className="pl-2 text-[0.65rem] text-ink-subtle">+{hidden}</span>
        )}
      </button>
      {showNames && <p className="text-xs text-ink-subtle">{label}</p>}
    </div>
  )
}
