/**
 * Om siden blev åbnet med `?code=` fra en mail.
 *
 * Convex Auth fjerner koden fra adressen, før indløsningen er færdig, og
 * `isLoading` kan nå at blive falsk i mellemtiden. Flaget huskes på tværs af
 * den render, så velkomstsiden bliver ved med at vente.
 */
let sawAuthCode = false

export function noteAuthCode(search: string): boolean {
  if (new URLSearchParams(search).has('code')) sawAuthCode = true
  return sawAuthCode
}

export function clearAuthCodeWait() {
  sawAuthCode = false
}
