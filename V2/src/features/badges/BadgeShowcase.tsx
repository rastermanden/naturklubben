import type { Id } from '../../../convex/_generated/dataModel'
import { useBadgesFor, useMyBadges } from './useBadges'

/**
 * Badgevitrinen: en rund række af de badges et medlem har fået, nyeste først.
 *
 * Udsnittet (`cropX`/`cropY`/`cropSize`) er de samme tal, trykfilen bruger.
 * Her vises det med `object-cover` i en rund ramme -- præcis nok til skærmen,
 * mens trykfilen regner det efter.
 */

interface BadgeRowProps {
  imageUrl: string | null
  badgeName: string
  badgeSlug: string
}

function BadgeRow({ imageUrl, badgeName, badgeSlug }: BadgeRowProps) {
  return (
    <li className="flex w-20 shrink-0 flex-col items-center gap-1 text-center">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`Badgen ${badgeName}`}
          className="h-16 w-16 rounded-full border border-line object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface-raised font-semibold text-ink-muted"
        >
          {badgeSlug.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="text-xs text-ink-subtle">{badgeName}</span>
    </li>
  )
}

/** Den indloggedes egne badges. */
export function MyBadgeShowcase() {
  const badges = useMyBadges()

  if (badges === undefined || badges.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-ink-body">Mine badges</h2>
      <ul className="flex flex-wrap gap-3">
        {badges.map((badge) => (
          <BadgeRow
            key={badge._id}
            imageUrl={badge.imageUrl}
            badgeName={badge.badgeName}
            badgeSlug={badge.badgeSlug}
          />
        ))}
      </ul>
    </section>
  )
}

/** En andens badges -- til profil- og medlemslisten. */
export function BadgeShowcase({ profileId }: { profileId: Id<'profiles'> }) {
  const badges = useBadgesFor(profileId)

  if (badges === undefined || badges.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-3">
      {badges.map((badge) => (
        <BadgeRow
          key={badge._id}
          imageUrl={badge.imageUrl}
          badgeName={badge.badgeName}
          badgeSlug={badge.badgeSlug}
        />
      ))}
    </ul>
  )
}
