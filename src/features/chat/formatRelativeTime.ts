const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/**
 * Alderen på en besked, skrevet så kort som muligt: "nu", "5 min", "3 t",
 * "6 d", "2 u", "4 md", "1 år".
 *
 * Den lange form ("for 6 dage siden") fyldte en hel linje i beskedboblen ved
 * siden af navn og handlingsknapper og tvang dem ned på hver sin række på en
 * telefon. Det præcise tidspunkt er der stadig -- boblen sætter det som
 * `title` og som skærmlæserens navn på tidsangivelsen, så ingen mister det.
 *
 * En besked fra fremtiden (uenige ure) er "nu" frem for en negativ alder.
 */
export function formatRelativeTime(isoDate: string): string {
  const ageSeconds = (Date.now() - new Date(isoDate).getTime()) / 1000

  if (ageSeconds < MINUTE) return 'nu'
  if (ageSeconds < HOUR) return `${Math.floor(ageSeconds / MINUTE)} min`
  if (ageSeconds < DAY) return `${Math.floor(ageSeconds / HOUR)} t`
  if (ageSeconds < WEEK) return `${Math.floor(ageSeconds / DAY)} d`
  if (ageSeconds < MONTH) return `${Math.floor(ageSeconds / WEEK)} u`
  if (ageSeconds < YEAR) return `${Math.floor(ageSeconds / MONTH)} md`
  return `${Math.floor(ageSeconds / YEAR)} år`
}
