import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'

/**
 * Typerne, siderne bruger, udledt af backend-funktionerne i
 * `convex/calendar.ts`. De skrives ikke i hånden: ændrer en query sit svar,
 * følger typen med, og den genereres af `npx convex dev` som resten af
 * `convex/_generated`.
 */

/** Begivenheden som listerne viser den (`calendar.upcomingEvents`). */
export type CalendarEvent = FunctionReturnType<
  typeof api.calendar.upcomingEvents
>[number]

/**
 * Begivenheden med medlemmets eget svar og dets rettigheder. Query'en svarer
 * `null`, når begivenheden er slettet -- de sider, der viser den, har den
 * allerede slået op, så typen her er den ikke-null variant.
 */
export type EventWithResponse = NonNullable<
  FunctionReturnType<typeof api.calendar.event>
>

/** En række i deltagerlisten (`calendar.attendance`). */
export type AttendanceRow = FunctionReturnType<
  typeof api.calendar.attendance
>['entries'][number]

/** En gæsteansøgning (`calendar.guestRequests`). */
export type GuestRequest = FunctionReturnType<
  typeof api.calendar.guestRequests
>[number]

/** En opgave på en begivenhed (`calendar.tasks`). */
export type EventTask = FunctionReturnType<typeof api.calendar.tasks>[number]

/** En offentlig begivenhed (`calendar.publicEvents`). */
export type PublicEvent = FunctionReturnType<
  typeof api.calendar.publicEvents
>[number]

/** Det, medlemmet kan svare på en begivenhed. */
export type AttendanceResponse = 'attending' | 'declined' | 'none'

/**
 * Formularens felter. `null` betyder "ryd feltet" -- derfor ikke `undefined`,
 * som i Convex betyder "rør ikke feltet".
 */
export interface EventInput {
  title: string
  description: string | null
  location: string | null
  startAt: number
  endAt: number | null
  isPublic: boolean
  maxParticipants: number | null
}
