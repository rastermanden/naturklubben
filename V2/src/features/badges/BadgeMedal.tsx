import { badgeArtworkStyle } from './badgeCrop'
import type { BadgeArtwork } from './types'

const sizeClasses = {
  xs: 'h-8 w-8',
  sm: 'h-12 w-12',
  md: 'h-16 w-16',
  lg: 'h-24 w-24',
  xl: 'h-40 w-40',
} as const

interface BadgeMedalProps {
  badge: BadgeArtwork
  size?: keyof typeof sizeClasses
  /** Sat, når navnet allerede står ved siden af -- så skærmlæseren ikke siger det to gange. */
  decorative?: boolean
  /** Bruges af beskæringsvælgeren, hvor billedet endnu ikke er uploadet. */
  previewUrl?: string
  className?: string
}

/**
 * Den runde badge. Cirklen er `border-radius: 50%`, og udsnittet er de samme
 * crop-værdier, trykfilen bruger.
 */
export function BadgeMedal({
  badge,
  size = 'md',
  decorative = false,
  previewUrl,
  className = '',
}: BadgeMedalProps) {
  const src = previewUrl ?? badge.imageUrl
  const style = badgeArtworkStyle(
    { imageWidth: badge.imageWidth, imageHeight: badge.imageHeight },
    { cropX: badge.cropX, cropY: badge.cropY, cropSize: badge.cropSize },
  )

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised font-semibold text-ink-muted ring-2 ring-accent/20 ${sizeClasses[size]} ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={decorative ? '' : badge.name}
          aria-hidden={decorative || undefined}
          style={style}
        />
      ) : (
        <span aria-hidden={decorative || undefined}>
          {badge.name.trim().slice(0, 2).toUpperCase() || '?'}
        </span>
      )}
    </span>
  )
}
