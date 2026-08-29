import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import type { Activity, ActivityInput } from './types'

export type { Activity, ActivityInput } from './types'

const ACTIVITY_COLUMNS =
  'id, title, description, icon, sort_order, link_url, link_label'

export const activitiesQueryKey = ['activities'] as const

async function fetchActivities(limit?: number): Promise<Activity[]> {
  let query = supabase
    .from('activities')
    .select(ACTIVITY_COLUMNS)
    .order('sort_order', { ascending: true })

  if (limit) {
    query = query.limit(limit)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export function useActivities(limit?: number) {
  return useQuery({
    queryKey: [...activitiesQueryKey, limit ?? 'all'],
    queryFn: () => fetchActivities(limit),
  })
}

/**
 * Alle varianter af aktivitetslisten -- forsidens tre og aktivitetssidens hele
 * liste -- hentes igen efter en ændring. Ellers ville admin gemme en rettelse
 * og stadig se den gamle tekst på forsiden.
 */
function useInvalidateActivities() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: activitiesQueryKey })
}

export function useSaveActivity() {
  const invalidate = useInvalidateActivities()

  return useMutation({
    mutationFn: async ({
      activityId,
      values,
      nextSortOrder,
    }: {
      activityId?: string
      values: ActivityInput
      /** Kun brugt ved oprettelse: den nye lægges nederst. */
      nextSortOrder?: number
    }) => {
      if (activityId) {
        const { error } = await supabase
          .from('activities')
          .update(values)
          .eq('id', activityId)
        if (error) throw error
        return
      }

      const { error } = await supabase
        .from('activities')
        .insert({ ...values, sort_order: nextSortOrder ?? 0 })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useDeleteActivity() {
  const invalidate = useInvalidateActivities()

  return useMutation({
    mutationFn: async (activityId: string) => {
      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', activityId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useReorderActivities() {
  const invalidate = useInvalidateActivities()

  return useMutation({
    mutationFn: async (rows: { id: string; sort_order: number }[]) => {
      // Én update pr. række frem for en upsert: en upsert skulle sende titel og
      // beskrivelse med igen og kunne dermed overskrive en rettelse, en anden
      // admin lige har gemt, med den tekst denne browser sad med.
      for (const row of rows) {
        const { error } = await supabase
          .from('activities')
          .update({ sort_order: row.sort_order })
          .eq('id', row.id)
        if (error) throw error
      }
    },
    onSuccess: invalidate,
  })
}
