import { useProfilesMap } from '../chat/useProfilesMap'
import { readableTextColor } from '../../lib/colorContrast'
import { useEventAttendance } from './useEventAttendance'

function ParticipantAvatar({
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
        className="h-9 w-9 shrink-0 rounded-full object-cover"
        style={{ outline: `2px solid ${color}` }}
      />
    )
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium"
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {initials || '?'}
    </span>
  )
}

export function AttendanceSection({
  eventId,
  userId,
}: {
  eventId: string
  userId: string
}) {
  const { attendanceQuery, joinAttendance, leaveAttendance } =
    useEventAttendance(eventId, userId)
  const profilesQuery = useProfilesMap()
  const attendance = attendanceQuery.data ?? []
  const isAttending = attendance.some((entry) => entry.user_id === userId)
  const attendancePending =
    joinAttendance.isPending || leaveAttendance.isPending
  const mutationError = joinAttendance.error ?? leaveAttendance.error

  function toggleAttendance() {
    if (isAttending) {
      leaveAttendance.mutate()
    } else {
      joinAttendance.mutate()
    }
  }

  return (
    <section className="mt-6 border-t border-line pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-ink-body">
          Deltagere
          {!attendanceQuery.isLoading && (
            <span className="ml-2 font-normal text-ink-subtle">
              ({attendance.length})
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={toggleAttendance}
          disabled={attendanceQuery.isLoading || attendancePending}
          className={`min-h-11 rounded px-4 py-2 font-medium disabled:opacity-60 ${
            isAttending
              ? 'border border-accent-soft text-ink-muted hover:bg-surface-sunken'
              : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          {attendancePending
            ? isAttending
              ? 'Tilmelder…'
              : 'Framelder…'
            : isAttending
              ? 'Frameld'
              : 'Jeg deltager'}
        </button>
      </div>

      {attendanceQuery.isLoading && (
        <p role="status" className="mt-3 text-sm text-ink-subtle">
          Henter deltagere…
        </p>
      )}

      {attendanceQuery.isError && (
        <div
          role="alert"
          className="mt-3 rounded border border-danger-line bg-danger-surface p-3 text-sm text-danger-strong"
        >
          Deltagerne kunne ikke hentes.
          <button
            type="button"
            onClick={() => attendanceQuery.refetch()}
            className="ml-2 underline"
          >
            Prøv igen
          </button>
        </div>
      )}

      {mutationError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          Tilmeldingen kunne ikke ændres. Prøv igen.
        </p>
      )}

      {attendanceQuery.data && attendance.length === 0 && (
        <p className="mt-3 text-sm text-ink-subtle">
          Ingen har tilmeldt sig endnu.
        </p>
      )}

      {attendance.length > 0 && (
        <>
          {profilesQuery.isLoading && (
            <p role="status" className="mt-3 text-sm text-ink-subtle">
              Henter deltagerprofiler…
            </p>
          )}
          {profilesQuery.isError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              Deltagernes profiloplysninger kunne ikke hentes.
            </p>
          )}
          <ul className="mt-3 grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
            {attendance.map((entry) => {
              const profile = profilesQuery.data?.[entry.user_id]
              const isCurrentUser = entry.user_id === userId
              const name = profile?.full_name ?? 'Medlem'
              const displayName = isCurrentUser
                ? profile?.full_name
                  ? `${name} (dig)`
                  : 'Dig'
                : name

              return (
                <li
                  key={entry.user_id}
                  className="flex min-w-0 items-center gap-3 rounded bg-surface-sunken p-2"
                >
                  <ParticipantAvatar
                    name={displayName}
                    avatarUrl={profile?.avatar_url ?? null}
                    color={profile?.chat_color ?? '#16a34a'}
                  />
                  <span className="truncate text-sm text-ink">
                    {displayName}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
