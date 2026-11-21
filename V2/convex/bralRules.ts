/**
 * Regler og konstanter for Bral smeltning.
 *
 * Samme fil bruges både af spillet i browseren og af `validateScore` på
 * serveren, så loftet over point og antal mønter ikke kan glide fra hinanden.
 */

export const BRAL_DURATION_SECONDS = 60
export const BRAL_CANS_PER_COIN = 4

export const BRAL_COIN_VALUES = {
  en: 1,
  fem: 5,
  ti: 10,
} as const

export const BRAL_MIN_COIN_VALUE = BRAL_COIN_VALUES.en
export const BRAL_MAX_COIN_VALUE = BRAL_COIN_VALUES.ti

export const BRAL_INITIAL_CANS = 2
export const BRAL_CAN_SPAWN_INTERVAL_S = 0.62
export const BRAL_MELT_CANS_PER_SEC = 1.6

/**
 * Maks antal mønter på 60 sekunder, beregnet ud fra spawn-takt og smeltetakt:
 * `Math.floor((2 + Math.floor(60 / 0.62)) / 4) = 24` og
 * `Math.floor((60 * 1.6) / 4) = 24`.
 */
export const BRAL_MAX_COINS_PER_GAME = 24

/** Om et Bral-resultat kan være spillet på et minut. */
export function bralScoreIsPlausible(
  score: number,
  lines: number,
  level: number,
): boolean {
  if (!Number.isInteger(score) || !Number.isInteger(lines) || level !== 1) {
    return false
  }
  if (lines < 0 || lines > BRAL_MAX_COINS_PER_GAME) return false

  const en = BRAL_COIN_VALUES.en
  const fem = BRAL_COIN_VALUES.fem
  const ti = BRAL_COIN_VALUES.ti
  const femStep = fem - en
  for (let tiCount = 0; tiCount <= lines; tiCount += 1) {
    const remainingCoins = lines - tiCount
    const remainingScore = score - tiCount * ti
    if (remainingScore < 0) break
    const diff = remainingScore - remainingCoins * en
    if (diff >= 0 && diff % femStep === 0 && diff / femStep <= remainingCoins) {
      return true
    }
  }
  return false
}
