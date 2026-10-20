import { MemberAvatar } from './MemberAvatar'
import type { OnlineMember } from './types'

/**
 * "Online nu": et prik, et tal og medlemmernes mærker.
 *
 * Listens indhold kommer fra heartbeat-tabellen, ikke fra en Realtime-kanal --
 * se `chat.onlineMembers` i `convex/chat.ts` om, hvad forskellen er. Den, der
 * ser på, står sidst, så rækkefølgen ikke skifter, når man selv kommer til.
 */
export function OnlineMembers({ members }: { members: OnlineMember[] }) {
  if (members.length === 0) return null

  const sorted = [...members].sort((left, right) => {
    if (left.isCurrentUser) return 1
    if (right.isCurrentUser) return -1
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
          const label = [
            member.isCurrentUser
              ? `${member.fullName} (dig)`
              : member.fullName,
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
              key={member.profileId}
              className={member.isAway ? 'opacity-50 grayscale' : undefined}
            >
              <MemberAvatar
                name={label}
                color={member.chatColor}
                avatarUrl={member.avatarUrl}
                size="sm"
              />
            </span>
          )
        })}
      </div>
    </div>
  )
}
