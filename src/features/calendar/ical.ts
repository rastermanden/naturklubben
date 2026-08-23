import { generateIcal } from '../../../supabase/functions/_shared/ical.ts'
import type { CalendarEvent } from './useEvents'

export { generateIcal } from '../../../supabase/functions/_shared/ical.ts'

/** Trigger a browser download of a .ics file */
export function downloadIcal(
  events: CalendarEvent[],
  filename = 'naturklubben.ics',
): void {
  const content = generateIcal(events)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
