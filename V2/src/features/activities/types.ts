import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'

/**
 * Aktiviteten, som `calendar.activities` giver den. Typen udledes af
 * backend-funktionen, så et nyt felt ikke skal skrives to steder.
 */
export type Activity = FunctionReturnType<
  typeof api.calendar.activities
>[number]

/** Det, admin-formularen skriver. `null` rydder feltet. */
export interface ActivityInput {
  title: string
  description: string
  icon: string | null
  linkUrl: string | null
  linkLabel: string | null
}
