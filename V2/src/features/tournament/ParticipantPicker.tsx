import { Avatar } from '../../components/Avatar'

/** Samme felter, vælgeren tegner. Profil-id'et er det, mutationen får med. */
export interface ParticipantOption {
  id: string
  fullName: string | null
  avatarUrl?: string | null
  chatColor?: string | null
}

interface ParticipantPickerProps {
  members: ParticipantOption[]
  selectedIds: string[]
  onToggle: (memberId: string) => void
  maxParticipants: number
}

/**
 * Deltager-vælgeren fra den nuværende app: avatar, navn og et loft, så man
 * ikke kan krydse flere af, end turneringen kan rumme.
 */
export function ParticipantPicker({
  members,
  selectedIds,
  onToggle,
  maxParticipants,
}: ParticipantPickerProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink-body">
        Deltagere ({selectedIds.length}/{maxParticipants})
      </legend>
      <ul className="flex flex-col gap-1">
        {members.map((member) => {
          const name = member.fullName?.trim() || 'Unavngivet medlem'
          const checked = selectedIds.includes(member.id)
          const disabled = !checked && selectedIds.length >= maxParticipants

          return (
            <li key={member.id}>
              <label
                className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 ${
                  checked
                    ? 'border-accent-soft bg-surface-sunken'
                    : 'border-line-soft bg-surface'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(member.id)}
                  className="h-5 w-5 shrink-0"
                />
                <Avatar
                  name={name}
                  avatarUrl={member.avatarUrl ?? null}
                  color={member.chatColor ?? '#16a34a'}
                  decorative
                />
                <span className="min-w-0 truncate text-ink">{name}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
