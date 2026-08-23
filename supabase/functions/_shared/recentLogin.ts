// Ren, testbar regel: er et login "friskt nok" til at bekræfte en
// sikkerhedsfølsom handling (kontosletning)? Udskilt fra selve
// delete-account/index.ts, så logikken kan enhedstestes uden en rigtig
// Supabase-klient (se recentLogin.test.ts).

/**
 * @param lastSignInAtIso `user.last_sign_in_at` fra Supabase Auth, eller null/
 *   undefined hvis brugeren aldrig har logget ind (bør ikke forekomme for et
 *   gyldigt access-token, men håndteres defensivt som "ikke friskt").
 * @param nowMs Nuværende tidspunkt i ms siden epoch -- injiceret i stedet for
 *   Date.now(), så testene er deterministiske.
 * @param maxAgeMs Hvor gammelt et login højst må være.
 */
export function isRecentLogin(
  lastSignInAtIso: string | null | undefined,
  nowMs: number,
  maxAgeMs: number,
): boolean {
  if (!lastSignInAtIso) return false

  const lastSignInAtMs = new Date(lastSignInAtIso).getTime()
  if (!Number.isFinite(lastSignInAtMs)) return false

  const ageMs = nowMs - lastSignInAtMs
  return ageMs >= 0 && ageMs <= maxAgeMs
}
