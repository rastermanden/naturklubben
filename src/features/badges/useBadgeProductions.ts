import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { badgeProductionsQueryKey } from './useBadgeNominations'
import { compareProductions } from './productionCountdown'
import type { BadgeProduction } from './types'

const SELECT =
  'id, member_badge_id, due_at, claimed_by, claimed_at, status, completed_at, created_at, member_badges(id, profile_id, awarded_at, badges(id, slug, name, description, image_path, image_width, image_height, image_mime_type, crop_x, crop_y, crop_size, diameter_mm, bleed_mm, print_path, print_status, print_error, print_started_at, is_active, created_at, updated_at))'

async function fetchProductions(): Promise<BadgeProduction[]> {
  const { data, error } = await supabase
    .from('badge_productions')
    .select(SELECT)
    .order('due_at', { ascending: true })

  if (error) throw error
  return ((data ?? []) as unknown as BadgeProduction[]).sort(compareProductions)
}

/** Produktionslisten. RLS gør den tom for alle andre end admins. */
export function useBadgeProductions() {
  return useQuery({
    queryKey: badgeProductionsQueryKey,
    queryFn: fetchProductions,
    // Uret på de 24 timer skal ikke stå stille, mens fanen er åben.
    refetchInterval: 60 * 1000,
  })
}

export function useClaimProduction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (productionId: string) => {
      const { error } = await supabase.rpc('claim_badge_production', {
        p_production_id: productionId,
      })
      if (error) throw error
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: badgeProductionsQueryKey }),
  })
}

export function useCompleteProduction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (productionId: string) => {
      const { error } = await supabase.rpc('complete_badge_production', {
        p_production_id: productionId,
      })
      if (error) throw error
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: badgeProductionsQueryKey }),
  })
}
