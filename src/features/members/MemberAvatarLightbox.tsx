import { useRef } from 'react'
import { Avatar } from '../../components/Avatar'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import type { Member } from './useMembers'

export function MemberAvatarLightbox({
  member,
  onClose,
}: {
  member: Member
  onClose: () => void
}) {
  const name = member.full_name?.trim() || 'Unavngivet medlem'
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: closeButtonRef,
  })

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={name}
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4"
    >
      {/* Lysbordet bruger med vilje ikke tema-variablerne. Det ligger på
          bg-black/90, fordi et billede skal ses mod noget neutralt -- og dermed
          er det allerede mørkt i lys tilstand. Hvide knapper og lys tekst her
          er derfor rigtige i begge temaer, ikke en glemt oversættelse. */}
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="Luk"
        className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded text-2xl text-white"
      >
        ×
      </button>

      <Avatar
        name={name}
        avatarUrl={member.avatar_url}
        color={member.chat_color ?? '#16a34a'}
        size="xl"
      />

      <p className="text-lg font-medium text-white">{name}</p>
    </div>
  )
}
