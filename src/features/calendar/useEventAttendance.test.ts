import { describe, expect, it, vi } from 'vitest'
import {
  applyOptimisticResponse,
  type EventAttendance,
} from './useEventAttendance'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

function entry(
  user_id: string,
  status: EventAttendance['status'],
): EventAttendance {
  return { event_id: 'event-1', user_id, status, created_at: '2026-09-01' }
}

const full = [entry('alice', 'attending'), entry('bob', 'attending')]

describe('applyOptimisticResponse', () => {
  it('sætter en tilmelding på ventelisten, når der er fyldt op', () => {
    const next = applyOptimisticResponse(
      full,
      'event-1',
      'carol',
      'attending',
      2,
    )
    expect(next.find((item) => item.user_id === 'carol')?.status).toBe(
      'waitlisted',
    )
  })

  it('giver en plads, når der er en ledig og ingen i kø', () => {
    const next = applyOptimisticResponse(
      full,
      'event-1',
      'carol',
      'attending',
      3,
    )
    expect(next.find((item) => item.user_id === 'carol')?.status).toBe(
      'attending',
    )
  })

  it('rører ikke en tilmelding, der allerede har en plads eller står i kø', () => {
    const queued = [...full, entry('carol', 'waitlisted')]
    expect(
      applyOptimisticResponse(queued, 'event-1', 'carol', 'attending', 2),
    ).toEqual(queued)
    expect(
      applyOptimisticResponse(full, 'event-1', 'alice', 'attending', 2),
    ).toEqual(full)
  })

  it('fjerner svaret ved none og erstatter det ved afbud', () => {
    expect(
      applyOptimisticResponse(full, 'event-1', 'alice', 'none', 2).map(
        (item) => item.user_id,
      ),
    ).toEqual(['bob'])
    const declined = applyOptimisticResponse(
      full,
      'event-1',
      'alice',
      'declined',
      2,
    )
    expect(declined.map((item) => [item.user_id, item.status])).toEqual([
      ['bob', 'attending'],
      ['alice', 'declined'],
    ])
  })
})
