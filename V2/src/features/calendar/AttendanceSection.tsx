import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { toFriendlyCalendarError } from './guestRequestErrors'
import type { AttendanceRow, EventWithResponse } from './types'
import {
  useAttendance,
  useMembersWithoutResponse,
} from './useEventAttendance'
import {
  attendingEntries,
  declinedEntries,
  hasFreeSeat,
  seatsLabel,
  waitlistEntries,
} from './waitlist'

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

/** En deltager som cirkel med initialer -- billedet hentes ikke her. */
function ParticipantAvatar({ row }: { row: AttendanceRow }) {
  if (row.avatarUrl) {
    return (
      <img
        src={row.avatarUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover"
        style={{ outline: `2px solid ${row.chatColor}` }}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: row.chatColor }}
    >
      {initials(row.name) || '?'}
    </span>
  )
}

function MemberList({
  entries,
  numbered = false,
  label,
}: {
  entries: readonly AttendanceRow[]
  numbered?: boolean
  label: string
}) {
  return (
    <ul
      aria-label={label}
      className="mt-3 grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2"
    >
      {entries.map((row, index) => (
        <li
          key={row.profileId}
          className="flex min-w-0 items-center gap-3 rounded bg-surface-sunken p-2"
        >
          {numbered && (
            <span className="w-5 shrink-0 text-right text-sm text-ink-subtle">
              {index + 1}.
            </span>
          )}
          <ParticipantAvatar row={row} />
          <span className="truncate text-sm text-ink">
            {row.name}
            {row.isMe && ' (dig)'}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Arrangørens og adminens overblik over svarene: hvem der har meldt afbud, og
 * hvem der ikke har svaret. Backend giver kun dem de to lister, så listen over
 * manglende svar hentes først, når den foldes ud.
 *
 * Den gamle app sendte en påmindelse i chatten herfra. Chat er ikke portet i
 * denne slice, så knappen findes ikke -- se rapporten.
 */
function MissingResponses({
  event,
  declined,
}: {
  event: EventWithResponse
  declined: readonly AttendanceRow[]
}) {
  const [open, setOpen] = useState(false)
  const missingQuery = useMembersWithoutResponse(event.id, open)
  const missing = missingQuery ?? []

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

      {open && missing.length === 0 && (
        <p className="mt-2 text-sm text-ink-subtle">Alle har svaret.</p>
      )}

      {open && missing.length > 0 && (
        <>
          <p className="mt-2 text-sm text-ink-subtle">
            {missing.length} har ikke svaret endnu.
          </p>
          <ul
            aria-label="Mangler at svare"
            className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto"
          >
            {missing.map((member) => (
              <li
                key={member.profileId}
                className="rounded bg-surface-sunken px-2 py-1 text-sm text-ink"
              >
                {member.name}
              </li>
            ))}
          </ul>
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
          <MemberList entries={declined} label="Har meldt afbud" />
        </>
      )}
    </div>
  )
}

/**
 * Deltagerlisten, ventelisten og medlemmets eget svar.
 *
 * Der er ingen optimistisk opdatering: svaret afgøres i backend, og Convex
 * sender den nye liste tilbage til alle, der ser begivenheden. `readOnly` bruges
 * på en afholdt begivenhed, hvor der ikke længere er noget at svare på.
 */
export function AttendanceSection({
  event,
  readOnly = false,
}: {
  event: EventWithResponse
  readOnly?: boolean
}) {
  const attendanceQuery = useAttendance(event.id)
  const respond = useMutation(api.calendar.respondToEvent)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const entries = attendanceQuery?.entries ?? []
  const attending = attendingEntries(entries)
  const waitlist = waitlistEntries(entries)
  const declined = declinedEntries(entries)
  const mine = entries.find((row) => row.isMe) ?? null
  const ownStatus = mine?.status ?? event.myStatus
  const ownPosition = mine?.waitlistPosition ?? event.myWaitlistPosition
  const isFull = !hasFreeSeat(entries, event.maxParticipants)

  async function answer(response: 'attending' | 'declined' | 'none') {
    setError(null)
    setBusy(true)
    try {
      await respond({ eventId: event.id, response })
    } catch (cause) {
      setError(toFriendlyCalendarError(cause))
    } finally {
      setBusy(false)
    }
  }

  const primaryLabel = busy
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
          {attendanceQuery !== undefined && (
            <span className="ml-2 font-normal text-ink-subtle">
              ({seatsLabel(entries, event.maxParticipants)}
              {event.approvedGuestCount > 0 &&
                ` + gæster: ${event.approvedGuestCount}`}
              )
            </span>
          )}
        </h3>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void answer(ownStatus === 'declined' ? 'none' : 'declined')
              }
              disabled={busy || attendanceQuery === undefined}
              className="min-h-11 rounded border border-accent-soft px-4 py-2 font-medium text-ink-muted hover:bg-surface-sunken disabled:opacity-60"
            >
              {ownStatus === 'declined' ? 'Fortryd afbud' : 'Kan ikke'}
            </button>
            <button
              type="button"
              onClick={() =>
                void answer(
                  ownStatus === 'attending' || ownStatus === 'waitlisted'
                    ? 'none'
                    : 'attending',
                )
              }
              disabled={busy || attendanceQuery === undefined}
              className={`min-h-11 rounded px-4 py-2 font-medium disabled:opacity-60 ${
                ownStatus === 'attending' || ownStatus === 'waitlisted'
                  ? 'border border-accent-soft text-ink-muted hover:bg-surface-sunken'
                  : 'bg-accent text-white hover:bg-accent-hover'
              }`}
            >
              {primaryLabel}
            </button>
          </div>
        )}
      </div>

      {!readOnly && ownStatus === 'waitlisted' && ownPosition !== null && (
        <p role="status" className="mt-3 text-sm text-ink-body">
          Du står som nr. {ownPosition} på ventelisten. Du rykker automatisk op,
          når der bliver en plads.
        </p>
      )}

      {ownStatus === 'declined' && (
        <p className="mt-3 text-sm text-ink-subtle">Du har meldt afbud.</p>
      )}

      {attendanceQuery === undefined && (
        <p role="status" className="mt-3 text-sm text-ink-subtle">
          Henter deltagere…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {attendanceQuery !== undefined && attending.length === 0 && (
        <p className="mt-3 text-sm text-ink-subtle">
          {readOnly ? 'Ingen var tilmeldt.' : 'Ingen har tilmeldt sig endnu.'}
        </p>
      )}

      {attending.length > 0 && (
        <MemberList entries={attending} label="Deltagere" />
      )}

      {waitlist.length > 0 && (
        <>
          <h4 className="mt-4 text-sm font-semibold text-ink-body">
            Venteliste
            <span className="ml-2 font-normal text-ink-subtle">
              ({waitlist.length})
            </span>
          </h4>
          <MemberList entries={waitlist} numbered label="Venteliste" />
        </>
      )}

      {event.canEdit && !readOnly && (
        <MissingResponses event={event} declined={declined} />
      )}
    </section>
  )
}
