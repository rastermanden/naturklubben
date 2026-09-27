import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { eventFields, type CalendarEvent } from './useEvents'
import { pastRangeOfMonth, startOfDay } from './pastEvents'

/** Så mange tidligere begivenheder hentes ad gangen i listen. */
export const PAST_EVENTS_PAGE_SIZE = 20

async function fetchPastEventsPage(page: number): Promise<CalendarEvent[]> {
  const from = page * PAST_EVENTS_PAGE_SIZE
  const { data, error } = await supabase
    .from('events')
    .select(eventFields)
    .lt('start_at', startOfDay(new Date()).toISOString())
    .order('start_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAST_EVENTS_PAGE_SIZE - 1)

  if (error) throw error
  return data
}

/**
 * Tidligere begivenheder, nyeste først, i bidder (#257). Hentes først, når
 * `enabled` er sat -- de fleste åbner kalenderen for at se, hvad der kommer.
 */
export function usePastEvents(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['events', 'past', 'list'],
    queryFn: ({ pageParam }) => fetchPastEventsPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAST_EVENTS_PAGE_SIZE ? allPages.length : undefined,
    enabled,
  })
}

/**
 * Begivenhederne i den del af `month`, der ligger før i dag -- til
 * månedsvisningen, når man bladrer tilbage. Tom (og intet kald) for en
 * måned, der ligger helt efter i dag.
 */
export function usePastMonthEvents(month: Date) {
  const range = pastRangeOfMonth(month)

  return useQuery({
    queryKey: [
      'events',
      'past',
      'month',
      range?.from.toISOString(),
      range?.to.toISOString(),
    ],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase
        .from('events')
        .select(eventFields)
        .gte('start_at', range!.from.toISOString())
        .lt('start_at', range!.to.toISOString())
        .order('start_at', { ascending: true })

      if (error) throw error
      return data
    },
    enabled: range !== null,
  })
}
