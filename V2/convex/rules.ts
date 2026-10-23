import type { TournamentFormat } from './types'

/** De fleste kampe går over tre spil. */
export const BEST_OF_DEFAULT = 3

/** Finalen går over fem. */
export const BEST_OF_FINAL = 5

/**
 * Hvor mange spil skal man vinde for at tage kampen? Bedst af tre afgøres
 * ved 2, bedst af fem ved 3. Samme udregning som i
 * record_tournament_match_result, så klienten og databasen er enige om, hvornår
 * en kamp er slut.
 */
export function gamesToWin(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1
}

/**
 * Reglerne i to-tre sætninger, som de står øverst på turneringen. De står
 * her sammen med tallene ovenfor, så teksten ikke kan komme til at love
 * noget andet, end kampene rent faktisk måles efter.
 */
export function rulesSummary(format: TournamentFormat): string {
  const match =
    `Hver kamp er bedst af ${BEST_OF_DEFAULT} spil ` +
    `-- først til ${gamesToWin(BEST_OF_DEFAULT)} vundne spil tager kampen.`

  if (format === 'round_robin') {
    return (
      `Alle møder alle én gang. ${match} ` +
      'Flest vundne kampe vinder turneringen; står to lige, tæller det ' +
      'indbyrdes opgør.'
    )
  }

  return (
    `Taber du en kamp, er du ude. ${match} ` +
    `Finalen er bedst af ${BEST_OF_FINAL} -- først til ` +
    `${gamesToWin(BEST_OF_FINAL)}. Er I et ulige antal, sidder én over i en ` +
    'runde og går direkte videre.'
  )
}
