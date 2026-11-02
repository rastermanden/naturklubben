import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * Klubbens aktiviteter. Query'en er offentlig i backend, fordi listen også vises
 * på den offentlige aktivitetsside -- den virker derfor både med og uden login.
 *
 * `limit` bruges af forsiden, der kun viser de tre øverste; rækkefølgen er
 * `sortOrder`, som admin kan ændre.
 */
export function useActivities(limit?: number) {
  return useQuery(api.calendar.activities, limit === undefined ? {} : { limit })
}
