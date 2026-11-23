const PENDING_SIGNUP_FULL_NAME_KEY = 'naturklubben.pendingSignupFullName'

/**
 * Gemmer navnet fra tilmeldingen midlertidigt i browseren, så `/velkommen`
 * kan sende det med til `claimProfile`, når bekræftelseslinket åbnes.
 */
export function savePendingSignupFullName(fullName: string): void {
  const cleaned = fullName.trim()
  if (typeof window === 'undefined') return
  try {
    if (cleaned.length > 0) {
      window.localStorage.setItem(PENDING_SIGNUP_FULL_NAME_KEY, cleaned)
    } else {
      window.localStorage.removeItem(PENDING_SIGNUP_FULL_NAME_KEY)
    }
  } catch {
    // Ignorer evt. blokeret localStorage; navnet kan udfyldes senere i profilen.
  }
}

export function takePendingSignupFullName(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const stored = window.localStorage.getItem(PENDING_SIGNUP_FULL_NAME_KEY)
    window.localStorage.removeItem(PENDING_SIGNUP_FULL_NAME_KEY)
    const cleaned = stored?.trim()
    return cleaned && cleaned.length > 0 ? cleaned : undefined
  } catch {
    return undefined
  }
}
