import { useState } from 'react'
import { useProfilesMap, type ProfileSummary } from '../chat/useProfilesMap'
import { readableTextColor } from '../../lib/colorContrast'
import { announceReminder } from './announceWaitlist'
import type { CalendarEvent } from './useEvents'
import {
  useEventAttendance,
  useMembersWithoutResponse,
  type EventAttendance,
} from './useEventAttendance'
import { useEventGuestCount } from './useEventGuests'
import {
  attendingEntries,
  declinedEntries,
  hasFreeSeat,
  seatsLabel,
  waitlistEntries,
  waitlistPosition,
} from './waitlist'

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

function displayName(
  profile: ProfileSummary | undefined,
  isCurrentUser: boolean,
) {
  const name = profile?.full_name ?? 'Medlem'
  if (!isCurrentUser) return name
  return profile?.full_name ? `${name} (dig)` : 'Dig'
}

function MemberList({
  entries,
  userId,
  profiles,
  numbered = false,
  label,
}: {
  entries: readonly EventAttendance[]
  userId: string
  profiles: Record<string, ProfileSummary> | undefined
  numbered?: boolean
  label: string
}) {
  return (
    <ul
      aria-label={label}
      className="mt-3 grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2"
    >
      {entries.map((entry, index) => {
        const profile = profiles?.[entry.user_id]
        const name = displayName(profile, entry.user_id === userId)

        return (
          <li
            key={entry.user_id}
            className="flex min-w-0 items-center gap-3 rounded bg-surface-sunken p-2"
          >
            {numbered && (
              <span className="w-5 shrink-0 text-right text-sm text-ink-subtle">
                {index + 1}.
              </span>
            )}
            <ParticipantAvatar
              name={name}
              avatarUrl={profile?.avatar_url ?? null}
              color={profile?.chat_color ?? '#16a34a'}
            />
            <span className="truncate text-sm text-ink">{name}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Arrangørens (og admins') overblik over svarene: dem, der har meldt afbud,
 * og dem, der ikke har svaret, med en knap, der minder de sidste om det i
 * chatten. Databasen giver kun arrangøren og admins afbuddene og listen over
 * manglende svar, så listen hentes først, når den foldes ud.
 */
function MissingResponses({
  event,
  userId,
  declined,
  profiles,
}: {
  event: CalendarEvent
  userId: string
  declined: readonly EventAttendance[]
  profiles: Record<string, ProfileSummary> | undefined
}) {
  const [open, setOpen] = useState(false)
  const [reminderState, setReminderState] = useState<
    'idle' | 'sending' | 'sent' | 'failed'
  >('idle')
  const missingQuery = useMembersWithoutResponse(event.id, open)
  const missing = missingQuery.data ?? []

  async function sendReminder() {
    setReminderState('sending')
    const sent = await announceReminder(userId, event, missing, profiles)
    setReminderState(sent ? 'sent' : 'failed')
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-sm font-medium text-ink-muted underline"
      >
        Hvem mangler at svare?
      </button>

      {open && missingQuery.isLoading && (
        <p role="status" className="mt-2 text-sm text-ink-subtle">
          Henter…
        </p>
      )}

      {open && missingQuery.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          Listen kunne ikke hentes.
        </p>
      )}

      {open && missingQuery.data && (
        <>
          {missing.length === 0 ? (
            <p className="mt-2 text-sm text-ink-subtle">Alle har svaret.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-subtle">
                {missing.length} har ikke svaret endnu.
              </p>
              <ul
                aria-label="Mangler at svare"
                className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto"
              >
                {missing.map((memberId) => (
                  <li
                    key={memberId}
                    className="rounded bg-surface-sunken px-2 py-1 text-sm text-ink"
                  >
                    {profiles?.[memberId]?.full_name ?? 'Medlem'}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void sendReminder()}
                disabled={
                  reminderState === 'sending' || reminderState === 'sent'
                }
                className="mt-3 min-h-11 rounded border border-accent-soft px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-sunken disabled:opacity-60"
              >
                {reminderState === 'sending'
                  ? 'Sender…'
                  : reminderState === 'sent'
                    ? 'Påmindelsen er sendt i chatten'
                    : 'Send påmindelse i chatten'}
              </button>
              {reminderState === 'failed' && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  Påmindelsen kunne ikke sendes i chatten. Prøv igen.
                </p>
              )}
            </>
          )}

          {declined.length > 0 && (
            <>
              <h4 className="mt-4 text-sm font-semibold text-ink-body">
                Har meldt afbud
                <span className="ml-2 font-normal text-ink-subtle">
                  ({declined.length})
                </span>
              </h4>
              <MemberList
                entries={declined}
                userId={userId}
                profiles={profiles}
                label="Har meldt afbud"
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

export function AttendanceSection({
  event,
  userId,
  canManage,
}: {
  event: CalendarEvent
  userId: string
  /** Arrangøren og admins: må se afbud og hvem der mangler at svare. */
  canManage: boolean
}) {
  const profilesQuery = useProfilesMap()
  const { attendanceQuery, respond } = useEventAttendance(
    event,
    userId,
    profilesQuery.data,
  )
  // Godkendte gæster fra den offentlige kalender (#224) tæller med som
  // deltagere, men vises kun som et tal -- hvem de er, ser kun arrangøren.
  const guestCount = useEventGuestCount(event.id).data ?? 0
  const attendance = attendanceQuery.data ?? []
  const attending = attendingEntries(attendance)
  const waitlist = waitlistEntries(attendance)
  // Afbud får kun den, der meldte det, arrangøren og admins fra databasen.
  const declined = declinedEntries(attendance)
  const ownStatus =
    attendance.find((entry) => entry.user_id === userId)?.status ?? null
  const ownPosition = waitlistPosition(attendance, userId)
  const isFull = !hasFreeSeat(attendance, event.max_participants)

  const primaryLabel = respond.isPending
    ? 'Gemmer…'
    : ownStatus === 'attending'
      ? 'Frameld'
      : ownStatus === 'waitlisted'
        ? 'Forlad ventelisten'
        : isFull || waitlist.length > 0
          ? 'Skriv mig på ventelisten'
          : 'Jeg deltager'

  return (
    <section className="mt-6 border-t border-line pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-ink-body">
          Deltagere
          {!attendanceQuery.isLoading && (
            <span className="ml-2 font-normal text-ink-subtle">
              ({seatsLabel(attendance, event.max_participants)}
              {guestCount > 0 && ` + gæster: ${guestCount}`})
            </span>
          )}
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              respond.mutate(ownStatus === 'declined' ? 'none' : 'declined')
            }
            disabled={attendanceQuery.isLoading || respond.isPending}
            className="min-h-11 rounded border border-accent-soft px-4 py-2 font-medium text-ink-muted hover:bg-surface-sunken disabled:opacity-60"
          >
            {ownStatus === 'declined' ? 'Fortryd afbud' : 'Kan ikke'}
          </button>
          <button
            type="button"
            onClick={() =>
              respond.mutate(
                ownStatus === 'attending' || ownStatus === 'waitlisted'
                  ? 'none'
                  : 'attending',
              )
            }
            disabled={attendanceQuery.isLoading || respond.isPending}
            className={`min-h-11 rounded px-4 py-2 font-medium disabled:opacity-60 ${
              ownStatus === 'attending' || ownStatus === 'waitlisted'
                ? 'border border-accent-soft text-ink-muted hover:bg-surface-sunken'
                : 'bg-accent text-white hover:bg-accent-hover'
            }`}
          >
            {primaryLabel}
          </button>
        </div>
      </div>

      {ownStatus === 'waitlisted' && ownPosition !== null && (
        <p role="status" className="mt-3 text-sm text-ink-body">
          Du står som nr. {ownPosition} på ventelisten. Du rykker automatisk op
          og får besked i chatten, når der bliver en plads.
        </p>
      )}

      {ownStatus === 'declined' && (
        <p className="mt-3 text-sm text-ink-subtle">Du har meldt afbud.</p>
      )}

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

      {respond.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          Tilmeldingen kunne ikke ændres. Prøv igen.
        </p>
      )}

      {attendanceQuery.data && attending.length === 0 && (
        <p className="mt-3 text-sm text-ink-subtle">
          Ingen har tilmeldt sig endnu.
        </p>
      )}

      {attendance.length > 0 && profilesQuery.isLoading && (
        <p role="status" className="mt-3 text-sm text-ink-subtle">
          Henter deltagerprofiler…
        </p>
      )}
      {attendance.length > 0 && profilesQuery.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          Deltagernes profiloplysninger kunne ikke hentes.
        </p>
      )}

      {attending.length > 0 && (
        <MemberList
          entries={attending}
          userId={userId}
          profiles={profilesQuery.data}
          label="Deltagere"
        />
      )}

      {waitlist.length > 0 && (
        <>
          <h4 className="mt-4 text-sm font-semibold text-ink-body">
            Venteliste
            <span className="ml-2 font-normal text-ink-subtle">
              ({waitlist.length})
            </span>
          </h4>
          <MemberList
            entries={waitlist}
            userId={userId}
            profiles={profilesQuery.data}
            numbered
            label="Venteliste"
          />
        </>
      )}

      {canManage && (
        <MissingResponses
          event={event}
          userId={userId}
          declined={declined}
          profiles={profilesQuery.data}
        />
      )}
    </section>
  )
}
