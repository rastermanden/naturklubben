/**
 * Convex Auth indløser `?code=` i en useEffect uden catch. Fejler kaldet,
 * bliver `isLoading` sand for evigt, og nulstillingssiden bliver stående
 * på "Et øjeblik…".
 *
 * Kun selve kode-indløsningen (ingen provider, kun `params.code`) må derfor
 * blive til "ingen session" i stedet for en ufanget fejl. Login med
 * adgangskode bruger provider `password` og skal stadig kaste.
 */
export function failedCodeRedemptionResult(
  reference: unknown,
  args: unknown,
): { tokens: null } | null {
  if (reference !== 'auth:signIn') return null
  if (typeof args !== 'object' || args === null) return null
  const { provider, params } = args as {
    provider?: unknown
    params?: { code?: unknown }
  }
  if (provider !== undefined) return null
  if (typeof params?.code !== 'string' || params.code.length === 0) return null
  return { tokens: null }
}
