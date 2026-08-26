import { useRef, useState } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { BadgeMedal } from './BadgeMedal'
import type { MemberBadge } from './types'

const awardedFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function BadgeDetailsDialog({
  memberBadge,
  nominatorName,
  onClose,
}: {
  memberBadge: MemberBadge
  nominatorName: string | null
  onClose: () => void
}) {
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
      aria-label={memberBadge.badges.name}
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center">
        <BadgeMedal badge={memberBadge.badges} size="xl" decorative />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-green-950">
            {memberBadge.badges.name}
          </h2>
          {memberBadge.badges.description && (
            <p className="text-sm text-green-800">
              {memberBadge.badges.description}
            </p>
          )}
          <p className="text-sm text-green-700">
            Tildelt {awardedFormatter.format(new Date(memberBadge.awarded_at))}
          </p>
          {nominatorName && (
            <p className="text-sm text-green-700">
              Indstillet af {nominatorName}
            </p>
          )}
        </div>
        {memberBadge.reason && (
          <p className="w-full whitespace-pre-wrap rounded-lg bg-green-50 p-3 text-left text-sm text-green-900">
            {memberBadge.reason}
          </p>
        )}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg bg-green-800 px-6 py-2 text-white"
        >
          Luk
        </button>
      </div>
    </div>
  )
}

interface BadgeShowcaseProps {
  badges: MemberBadge[]
  /** Slår id op på indstilleren, så vitrinen kan vise navnet frem for en uuid. */
  nameFor?: (profileId: string) => string | null
  size?: 'sm' | 'md' | 'lg'
  emptyText?: string | null
}

/** Vitrinen med et medlems tildelte badges. Klik giver detaljerne. */
export function BadgeShowcase({
  badges,
  nameFor,
  size = 'md',
  emptyText = null,
}: BadgeShowcaseProps) {
  const [active, setActive] = useState<MemberBadge | null>(null)

  if (badges.length === 0) {
    return emptyText ? (
      <p className="text-sm text-green-700">{emptyText}</p>
    ) : null
  }

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {badges.map((memberBadge) => (
          <li key={memberBadge.id}>
            <button
              type="button"
              onClick={() => setActive(memberBadge)}
              title={memberBadge.badges.name}
              aria-label={`Se detaljer om ${memberBadge.badges.name}`}
              className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            >
              <BadgeMedal badge={memberBadge.badges} size={size} decorative />
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <BadgeDetailsDialog
          memberBadge={active}
          nominatorName={
            active.nominated_by
              ? (nameFor?.(active.nominated_by) ?? null)
              : null
          }
          onClose={() => setActive(null)}
        />
      )}
    </>
  )
}
