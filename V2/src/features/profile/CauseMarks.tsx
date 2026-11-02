import { selectedCauses } from './causes'

/**
 * Mærkerne ved et navn. Ét element med ét navn til skærmlæseren, så "Bo
 * 🇺🇦 🏳️‍🌈" læses som "Bo, Støtter Ukraine, Regnbueflag" og ikke som tre
 * løsrevne tegn.
 */
export function CauseMarks({
  causes,
  className,
}: {
  causes: readonly string[] | null | undefined
  className?: string
}) {
  const chosen = selectedCauses(causes)
  if (chosen.length === 0) return null
  const label = chosen.map((cause) => cause.label).join(', ')
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={className ?? 'shrink-0 text-sm'}
    >
      {chosen.map((cause) => cause.emoji).join(' ')}
    </span>
  )
}
