import { badgeArtworkStyle } from './badgeCrop'
import { badgeImageUrl } from './useBadges'
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
 * Den runde badge. Ingen Edge Function er involveret: cirklen er
 * `border-radius: 50%`, og udsnittet er de samme crop-værdier, trykfilen bruger.
 */
export function BadgeMedal({
  badge,
  size = 'md',
  decorative = false,
  previewUrl,
  className = '',
}: BadgeMedalProps) {
  const style = badgeArtworkStyle(
    { imageWidth: badge.image_width, imageHeight: badge.image_height },
    { cropX: badge.crop_x, cropY: badge.crop_y, cropSize: badge.crop_size },
  )

  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-full bg-surface-raised ring-2 ring-accent/20 ${sizeClasses[size]} ${className}`}
    >
      <img
        src={previewUrl ?? badgeImageUrl(badge.image_path)}
        alt={decorative ? '' : badge.name}
        aria-hidden={decorative || undefined}
        style={style}
      />
    </span>
  )
}
