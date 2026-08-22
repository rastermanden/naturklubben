/**
 * Parametrene, Supabase lægger i URL'en, når man klikker linket i en
 * bekræftelses- eller nulstillingsmail.
 *
 * Snapshottet tages ved modul-indlæsning, dvs. før Supabase-klientens egen
 * (asynkrone) behandling af URL'en når at rydde `#access_token=...` væk igen
 * ved succes. Uden det ville en side, der monteres bagefter, ikke kunne se
 * forskel på "kom hertil fra en mail" og "skrev adressen selv".
 *
 * Ved fejl rydder Supabase-klienten ikke URL'en -- så `#error=...` ville
 * ellers blive hængende og give den samme fejl igen ved et refresh.
 * `clearAuthCallbackParams()` fjerner dem, når siden har læst dem.
 */

export interface AuthCallbackParams {
  /** Mailen bar en session/kode med -- brugeren kom hertil fra et mail-link. */
  hasCredentials: boolean
  /** Fx `otp_expired`, når linket er udløbet eller allerede brugt. */
  errorCode: string | null
  errorDescription: string | null
}

function readParams(): AuthCallbackParams {
  // Supabase bruger fragmentet i implicit flow (`#access_token=...`) og
  // query-strengen i PKCE-flow (`?code=...`); fejl kan komme begge veje.
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const fromQuery = new URLSearchParams(window.location.search)
  const get = (name: string) => fromHash.get(name) ?? fromQuery.get(name)

  return {
    hasCredentials: Boolean(get('access_token') ?? get('code')),
    errorCode: get('error_code') ?? get('error'),
    errorDescription: get('error_description'),
  }
}

export const authCallbackParams: AuthCallbackParams = readParams()

/** Fjerner mail-linkets parametre fra adresselinjen uden at genindlæse siden. */
export function clearAuthCallbackParams(): void {
  const url = new URL(window.location.href)
  if (!url.hash && !url.search) return
  url.hash = ''
  url.search = ''
  window.history.replaceState(window.history.state, '', url.href)
}
