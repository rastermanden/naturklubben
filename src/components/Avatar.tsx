const SIZES = {
  sm: { box: 'h-7 w-7 text-xs', outline: '2px' },
  lg: { box: 'h-16 w-16 text-xl', outline: '3px' },
}

export function Avatar({
  name,
  avatarUrl,
  color,
  size = 'sm',
}: {
  name: string
  avatarUrl: string | null
  color: string
  size?: 'sm' | 'lg'
}) {
  const { box, outline } = SIZES[size]

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={name}
        className={`${box} rounded-full object-cover`}
        style={{ outline: `${outline} solid ${color}` }}
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
      title={name}
      className={`flex ${box} shrink-0 items-center justify-center rounded-full font-medium text-white`}
      style={{ backgroundColor: color }}
    >
      {initials || '?'}
    </span>
  )
}
