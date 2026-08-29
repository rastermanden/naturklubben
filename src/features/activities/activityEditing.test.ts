import { describe, expect, it } from 'vitest'
import { toFriendlyActivityError } from './activityErrors'
import { reorderActivities } from './activityOrder'
import type { Activity } from './types'

function activity(id: string, sortOrder: number): Activity {
  return {
    id,
    title: id,
    description: 'beskrivelse',
    icon: null,
    sort_order: sortOrder,
    link_url: null,
    link_label: null,
  }
}

describe('reorderActivities', () => {
  const list = [activity('a', 1), activity('b', 2), activity('c', 3)]

  it('swaps an activity with the one above it', () => {
    expect(reorderActivities(list, 'b', 'up')).toEqual([
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 2 },
    ])
  })

  it('swaps an activity with the one below it', () => {
    expect(reorderActivities(list, 'b', 'down')).toEqual([
      { id: 'c', sort_order: 2 },
      { id: 'b', sort_order: 3 },
    ])
  })

  it('writes nothing at the ends of the list', () => {
    expect(reorderActivities(list, 'a', 'up')).toEqual([])
    expect(reorderActivities(list, 'c', 'down')).toEqual([])
  })

  it('ignores an activity that is no longer in the list', () => {
    expect(reorderActivities(list, 'findes-ikke', 'up')).toEqual([])
  })

  // Seedet gav flere aktiviteter samme -- eller slet intet -- nummer, og så
  // afgør databasen selv rækkefølgen. Et træk skal rette hele listen op, ikke
  // bare bytte to tal, der i forvejen er ens.
  it('renumbers a list whose sort orders collide', () => {
    const colliding = [activity('a', 0), activity('b', 0), activity('c', 0)]
    expect(reorderActivities(colliding, 'c', 'up')).toEqual([
      { id: 'a', sort_order: 1 },
      { id: 'c', sort_order: 2 },
      { id: 'b', sort_order: 3 },
    ])
  })
})

describe('toFriendlyActivityError', () => {
  it('explains a rejected write as a missing permission', () => {
    expect(toFriendlyActivityError({ code: '42501' })).toContain(
      'ikke rettigheder',
    )
  })

  it('names the half-filled link, so admin knows which field to fix', () => {
    expect(
      toFriendlyActivityError({
        code: '23514',
        message:
          'new row for relation "activities" violates check constraint "activities_link_complete"',
      }),
    ).toContain('linktekst')
  })

  it('falls back to a generic message for an unknown failure', () => {
    expect(toFriendlyActivityError({ code: 'XX000' })).toBe(
      'Handlingen kunne ikke gennemføres. Prøv igen om lidt.',
    )
  })
})
