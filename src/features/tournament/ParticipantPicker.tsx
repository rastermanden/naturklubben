import { Avatar } from '../../components/Avatar'
import type { Member } from '../members/useMembers'

interface ParticipantPickerProps {
  members: Member[]
  selectedIds: string[]
  onToggle: (memberId: string) => void
  maxParticipants: number
}

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
          const name = member.full_name?.trim() || 'Unavngivet medlem'
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
                  avatarUrl={member.avatar_url}
                  color={member.chat_color ?? '#16a34a'}
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
