import { useState, type FormEvent } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { ParticipantPicker, type ParticipantOption } from './ParticipantPicker'

const MIN_PARTICIPANTS = 2
const MAX_PARTICIPANTS = 8

export interface TournamentSetupInput {
  format: 'round_robin' | 'single_elimination'
  participantProfileIds: Id<'profiles'>[]
  byeProfileId?: Id<'profiles'>
}

interface TournamentSetupFormProps {
  members: ParticipantOption[]
  submitting: boolean
  error: string | null
  onSubmit: (input: TournamentSetupInput) => void
}

/**
 * Oprettelsen af en BTG-turnering, med de samme tekster og det samme loft
 * som i den nuværende app. Rækkefølgen, man krydser af i, er seed-rækkefølgen.
 */
export function TournamentSetupForm({
  members,
  submitting,
  error,
  onSubmit,
}: TournamentSetupFormProps) {
  const [format, setFormat] = useState<'round_robin' | 'single_elimination'>(
    'round_robin',
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [byeUserId, setByeUserId] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const needsByeChoice =
    format === 'single_elimination' && selectedIds.length % 2 === 1

  function toggleParticipant(memberId: string) {
    setSelectedIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    )
    setByeUserId(null)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setValidationError(null)

    if (selectedIds.length < MIN_PARTICIPANTS) {
      setValidationError(
        `Vælg mindst ${MIN_PARTICIPANTS} deltagere for at starte en turnering.`,
      )
      return
    }

    onSubmit({
      format,
      participantProfileIds: selectedIds as Id<'profiles'>[],
      byeProfileId:
        needsByeChoice && byeUserId ? (byeUserId as Id<'profiles'>) : undefined,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border border-line-soft bg-surface p-4 sm:p-6"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink-body">
          Turneringsform
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label
            className={`rounded-lg border px-3 py-2 ${format === 'round_robin' ? 'border-accent-soft bg-surface-sunken' : 'border-line-soft'}`}
          >
            <span className="flex min-h-11 items-center">
              <input
                type="radio"
                name="format"
                value="round_robin"
                checked={format === 'round_robin'}
                onChange={() => {
                  setFormat('round_robin')
                  setByeUserId(null)
                }}
                className="mr-2"
              />
              Alle-mod-alle
            </span>
            <p className="pl-5 text-sm text-ink-subtle">
              Alle møder alle én gang. Den med flest sejre vinder.
            </p>
          </label>
          <label
            className={`rounded-lg border px-3 py-2 ${format === 'single_elimination' ? 'border-accent-soft bg-surface-sunken' : 'border-line-soft'}`}
          >
            <span className="flex min-h-11 items-center">
              <input
                type="radio"
                name="format"
                value="single_elimination"
                checked={format === 'single_elimination'}
                onChange={() => {
                  setFormat('single_elimination')
                  setByeUserId(null)
                }}
                className="mr-2"
              />
              Udslagsrunder
            </span>
            <p className="pl-5 text-sm text-ink-subtle">
              Taber du en kamp, er du ude. Sidste mand tilbage vinder.
            </p>
          </label>
        </div>
      </fieldset>

      <ParticipantPicker
        members={members}
        selectedIds={selectedIds}
        onToggle={toggleParticipant}
        maxParticipants={MAX_PARTICIPANTS}
      />

      {needsByeChoice && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink-body">
            Hvem sidder over i runde 1?
          </span>
          <select
            value={byeUserId ?? ''}
            onChange={(event) => setByeUserId(event.target.value || null)}
            className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 py-2"
          >
            <option value="">Tilfældig</option>
            {selectedIds.map((id) => {
              const member = members.find((item) => item.id === id)
              return (
                <option key={id} value={id}>
                  {member?.fullName?.trim() || 'Unavngivet medlem'}
                </option>
              )
            })}
          </select>
          <span className="text-sm text-ink-subtle">
            Ulige antal deltagere -- én af dem går videre uden at spille i runde
            1.
          </span>
        </label>
      )}

      {(validationError || error) && (
        <p role="alert" className="text-sm text-danger">
          {validationError ?? error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 self-start rounded-lg bg-accent px-5 py-2 font-medium text-on-accent disabled:opacity-60"
      >
        {submitting ? 'Opretter…' : 'Start turnering'}
      </button>
    </form>
  )
}
