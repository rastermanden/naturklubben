import type { Activity } from './types'

/** Samme omnummerering som i den nuværende app: 1..n, kun ændrede rækker. */
export function reorderActivities(
  activities: Activity[],
  activityId: string,
  direction: 'up' | 'down',
): { activityId: Activity['id']; sortOrder: number }[] {
  const index = activities.findIndex((activity) => activity.id === activityId)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index === -1 || target < 0 || target >= activities.length) return []

  const next = [...activities]
  ;[next[index], next[target]] = [next[target], next[index]]

  return next
    .map((activity, position) => ({
      activityId: activity.id,
      sortOrder: position + 1,
    }))
    .filter((row, position) => row.sortOrder !== next[position].sortOrder)
}
