import { DEFAULT_CHAT_COLOR } from './constants'

/**
 * Et lille rundt medlemsmærke med initialer.
 *
 * V2 har endnu ingen delt `Avatar`-komponent (den hører til medlemsdomænet), og
 * chatten skal ikke vente på den: et mærke i medlemmets chatfarve med
 * forbogstaverne er nok til at se, hvem der skrev. Er der et profilbillede,
 * vises det i stedet.
 */
export function MemberAvatar({
  name,
  color,
  avatarUrl,
  size = 'md',
  decorative = false,
}: {
  name: string
  color?: string | null
  avatarUrl?: string | null
  size?: 'sm' | 'md'
  /** Sand, når navnet står ved siden af mærket, så skærmlæseren ikke gentager det. */
  decorative?: boolean
}) {
  const dimension = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('da-DK') ?? '')
    .join('')

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={decorative ? '' : name}
        className={`${dimension} shrink-0 rounded-full object-cover`}
      />
    )
  }

  return (
    <span
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : name}
      className={`${dimension} flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: color ?? DEFAULT_CHAT_COLOR }}
    >
      {initials || '?'}
    </span>
  )
}
