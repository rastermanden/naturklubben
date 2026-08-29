import type { Activity } from './types'

/**
 * Rækkefølgen gemmes som et helt tal pr. aktivitet, og seedet har hverken
 * unikke eller sammenhængende værdier. Derfor bytter et træk ikke bare to tal:
 * hele listen nummereres 1..n i den ønskede rækkefølge, og kun de rækker, hvis
 * nummer faktisk ændrer sig, skrives. To aktiviteter med samme `sort_order` --
 * som ellers ville kunne skifte plads vilkårligt mellem to indlæsninger --
 * bliver dermed rettet op, første gang nogen flytter noget.
 */
export function reorderActivities(
  activities: Activity[],
  activityId: string,
  direction: 'up' | 'down',
): { id: string; sort_order: number }[] {
  const index = activities.findIndex((activity) => activity.id === activityId)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index === -1 || target < 0 || target >= activities.length) return []

  const next = [...activities]
  ;[next[index], next[target]] = [next[target], next[index]]

  return next
    .map((activity, position) => ({
      id: activity.id,
      sort_order: position + 1,
    }))
    .filter((row, position) => row.sort_order !== next[position].sort_order)
}
