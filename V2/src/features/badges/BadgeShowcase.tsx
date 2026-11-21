import { useRef, useState } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { BadgeMedal } from './BadgeMedal'
import { useMyBadges } from './useBadges'
import type { AwardedMemberBadge, BadgeArtwork } from './types'

const awardedFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function artworkOf(memberBadge: AwardedMemberBadge): BadgeArtwork {
  return {
    name: memberBadge.badgeName,
    imageUrl: memberBadge.imageUrl,
    imageWidth: memberBadge.imageWidth,
    imageHeight: memberBadge.imageHeight,
    cropX: memberBadge.cropX,
    cropY: memberBadge.cropY,
    cropSize: memberBadge.cropSize,
  }
}

function BadgeDetailsDialog({
  memberBadge,
  onClose,
}: {
  memberBadge: AwardedMemberBadge
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
      aria-label={memberBadge.badgeName}
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-surface p-6 text-center">
        <BadgeMedal badge={artworkOf(memberBadge)} size="xl" decorative />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-ink">
            {memberBadge.badgeName}
          </h2>
          {memberBadge.badgeDescription && (
            <p className="text-sm text-ink-muted">
              {memberBadge.badgeDescription}
            </p>
          )}
          <p className="text-sm text-ink-subtle">
            Tildelt {awardedFormatter.format(new Date(memberBadge.awardedAt))}
          </p>
          {memberBadge.nominatedByName && (
            <p className="text-sm text-ink-subtle">
              Indstillet af {memberBadge.nominatedByName}
            </p>
          )}
        </div>
        {memberBadge.reason && (
          <p className="w-full whitespace-pre-wrap rounded-lg bg-surface-sunken p-3 text-left text-sm text-ink-body">
            {memberBadge.reason}
          </p>
        )}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg bg-accent px-6 py-2 text-white"
        >
          Luk
        </button>
      </div>
    </div>
  )
}

interface BadgeShowcaseProps {
  badges: AwardedMemberBadge[]
  size?: 'sm' | 'md' | 'lg'
  emptyText?: string | null
}

/** Vitrinen med et medlems tildelte badges. Klik giver detaljerne. */
export function BadgeShowcase({
  badges,
  size = 'md',
  emptyText = null,
}: BadgeShowcaseProps) {
  const [active, setActive] = useState<AwardedMemberBadge | null>(null)

  if (badges.length === 0) {
    return emptyText ? (
      <p className="text-sm text-ink-subtle">{emptyText}</p>
    ) : null
  }

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {badges.map((memberBadge) => (
          <li key={memberBadge._id}>
            <button
              type="button"
              onClick={() => setActive(memberBadge)}
              title={memberBadge.badgeName}
              aria-label={`Se detaljer om ${memberBadge.badgeName}`}
              className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
            >
              <BadgeMedal
                badge={artworkOf(memberBadge)}
                size={size}
                decorative
              />
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <BadgeDetailsDialog
          memberBadge={active}
          onClose={() => setActive(null)}
        />
      )}
    </>
  )
}

/** Den indloggedes egne badges -- brugt på profilsiden. */
export function MyBadgeShowcase({ emptyText }: { emptyText?: string }) {
  const badges = useMyBadges()

  if (badges === undefined) return null

  return <BadgeShowcase badges={badges} emptyText={emptyText ?? null} />
}
