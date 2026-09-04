import { Avatar } from '../../components/Avatar'
import type { PresenceMember } from './useOnlinePresence'
import type { ProfileSummary } from './useProfilesMap'

export function OnlineMembers({
  members,
  profiles,
  currentUserId,
}: {
  members: PresenceMember[]
  profiles: Record<string, ProfileSummary> | undefined
  currentUserId: string
}) {
  if (members.length === 0) return null

  // Vis den aktuelle bruger sidst
  const sorted = [...members].sort((a, b) => {
    if (a.userId === currentUserId) return 1
    if (b.userId === currentUserId) return -1
    return 0
  })
  const awayCount = members.filter((member) => member.isAway).length

  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-2 w-2 shrink-0 rounded-full bg-online"
        aria-hidden="true"
      />
      <span className="text-sm text-ink-subtle">
        {awayCount > 0
          ? `${members.length} online · ${awayCount} væk`
          : `${members.length} online`}
      </span>
      <div className="flex -space-x-1.5" aria-label="Online medlemmer">
        {sorted.map((member) => {
          const profile = profiles?.[member.userId]
          const isCurrentUser = member.userId === currentUserId
          const name = isCurrentUser
            ? (profile?.full_name ?? 'Dig')
            : (profile?.full_name ?? 'Medlem')
          const color = profile?.chat_color ?? '#16a34a'
          const label = [
            isCurrentUser ? `${name} (dig)` : name,
            member.isAway
              ? member.awayMessage
                ? `(væk: ${member.awayMessage})`
                : '(væk)'
              : null,
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <span
              key={member.userId}
              className={member.isAway ? 'opacity-50 grayscale' : undefined}
            >
              <Avatar
                name={label}
                avatarUrl={profile?.avatar_url ?? null}
                color={color}
              />
            </span>
          )
        })}
      </div>
    </div>
  )
}
