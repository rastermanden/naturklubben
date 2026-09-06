import type { GameScore, LeaderboardEntry } from './types'

/**
 * Resultatlisten viser ét resultat pr. medlem -- deres bedste. Databasen
 * leverer alle resultater sorteret efter point, så listen bygges ved at tage
 * det første, hvert medlem optræder med, og tælle pladser derfra.
 *
 * At regne den ud her frem for i databasen holder også stik, når kun toppen af
 * listen er hentet: et medlems bedste resultat *er* deres højeste, så er det
 * ikke blandt de hentede point, er medlemmet heller ikke på listen.
 */
export function rankLeaderboard(
  scores: readonly GameScore[] | undefined,
): LeaderboardEntry[] {
  if (!scores) return []

  const seen = new Set<string>()
  const best: GameScore[] = []
  for (const score of scores) {
    if (seen.has(score.player_id)) continue
    seen.add(score.player_id)
    best.push(score)
  }

  const entries: LeaderboardEntry[] = []
  best.forEach((score, index) => {
    const previous = entries[index - 1]
    // Lige mange point deler plads: to på en delt andenplads efterfølges af en
    // fjerdeplads, som i enhver anden resultatliste.
    const rank =
      previous && previous.score.score === score.score
        ? previous.rank
        : index + 1
    entries.push({ rank, score })
  })
  return entries
}

/** "3 min 12 sek" -- varigheden skrevet, som man siger den. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sek`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) {
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} sek`
  }
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes === 0 ? `${hours} t` : `${hours} t ${restMinutes} min`
}

const scoreFormatter = new Intl.NumberFormat('da-DK')

export function formatScore(score: number): string {
  return scoreFormatter.format(score)
}

export function playerName(score: GameScore): string {
  return score.player?.full_name?.trim() || 'Ukendt medlem'
}
