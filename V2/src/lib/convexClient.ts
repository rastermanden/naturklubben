import { ConvexReactClient } from 'convex/react'
import { failedCodeRedemptionResult } from '../features/auth/authCodeRedeem'

const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!convexUrl) {
  throw new Error(
    'Mangler VITE_CONVEX_URL. Se V2/.env.example og V2/README.md.',
  )
}

/**
 * Én klient for hele appen. Convex-klienten holder selv WebSocket-forbindelsen
 * og genopretter den, så der er ingen separat realtime-kanal at abonnere på:
 * et `useQuery` er abonnementet.
 */
export const convex = new ConvexReactClient(convexUrl)

const callAction = convex.action.bind(convex)
convex.action = (async (reference: unknown, ...args: unknown[]) => {
  try {
    return await callAction(reference as never, ...(args as []))
  } catch (error) {
    const failed = failedCodeRedemptionResult(reference, args[0])
    if (failed === null) throw error
    // Koden logges ikke. Prod skjuler alligevel serverens tekst.
    console.error('Nulstillingskoden kunne ikke indløses')
    return failed
  }
}) as typeof convex.action
