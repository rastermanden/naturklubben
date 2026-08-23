import { Avatar } from '../../components/Avatar'
import type { ProfileSummary } from './useProfilesMap'

export function OnlineMembers({
  onlineUserIds,
  profiles,
  currentUserId,
}: {
  onlineUserIds: string[]
  profiles: Record<string, ProfileSummary> | undefined
  currentUserId: string
}) {
  if (onlineUserIds.length === 0) return null

  // Vis den aktuelle bruger sidst
  const sorted = [...onlineUserIds].sort((a, b) => {
    if (a === currentUserId) return 1
    if (b === currentUserId) return -1
    return 0
  })

  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-2 w-2 shrink-0 rounded-full bg-green-500"
        aria-hidden="true"
      />
      <span className="text-sm text-green-700">
        {`${onlineUserIds.length} online`}
      </span>
      <div className="flex -space-x-1.5" aria-label="Online medlemmer">
        {sorted.map((id) => {
          const profile = profiles?.[id]
          const name =
            id === currentUserId
              ? (profile?.full_name ?? 'Dig')
              : (profile?.full_name ?? 'Medlem')
          const color = profile?.chat_color ?? '#16a34a'
          return (
            <Avatar
              key={id}
              name={id === currentUserId ? `${name} (dig)` : name}
              avatarUrl={profile?.avatar_url ?? null}
              color={color}
            />
          )
        })}
      </div>
    </div>
  )
}
