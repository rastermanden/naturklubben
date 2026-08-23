import { useState } from 'react'
import { readableTextColor } from '../lib/colorContrast'

const sizeClasses = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-8 w-8 text-xs',
  lg: 'h-16 w-16 text-xl',
} as const

interface AvatarProps {
  name: string
  avatarUrl: string | null
  color: string
  size?: keyof typeof sizeClasses
  decorative?: boolean
}

export function Avatar({
  name,
  avatarUrl,
  color,
  size = 'sm',
  decorative = false,
}: AvatarProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const sizeClass = sizeClasses[size]
  const imageFailed = avatarUrl === failedImageUrl

  if (avatarUrl && !imageFailed) {
    return (
      <img
        src={avatarUrl}
        alt={decorative ? '' : name}
        title={decorative ? undefined : name}
        onError={() => setFailedImageUrl(avatarUrl)}
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
        style={{ outline: `2px solid ${color}` }}
      />
    )
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : name}
      role={decorative ? undefined : 'img'}
      title={decorative ? undefined : name}
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full font-medium`}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {initials || '?'}
    </span>
  )
}
