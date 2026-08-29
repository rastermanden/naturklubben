import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import type { MemberBadge } from './types'

export const memberBadgesQueryKey = ['member_badges'] as const

const SELECT =
  'id, badge_id, profile_id, nominated_by, reason, awarded_at, badges(id, slug, name, description, image_path, image_width, image_height, image_mime_type, crop_x, crop_y, crop_size, diameter_mm, bleed_mm, print_path, print_status, print_error, print_started_at, is_active, created_at, updated_at)'

async function fetchMemberBadges(): Promise<MemberBadge[]> {
  const { data, error } = await supabase
    .from('member_badges')
    .select(SELECT)
    .order('awarded_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as MemberBadge[]
}

/**
 * Alle tildelte badges på én gang. Klubben er lille nok til, at det er billigere
 * end en forespørgsel pr. medlem på medlemslisten -- og profilen og listen deler
 * så det samme cache-svar.
 */
export function useMemberBadges() {
  return useQuery({
    queryKey: memberBadgesQueryKey,
    queryFn: fetchMemberBadges,
  })
}

/** Grupperer tildelingerne pr. medlem, nyeste først. */
export function groupBadgesByMember(badges: MemberBadge[] | undefined) {
  const byMember = new Map<string, MemberBadge[]>()
  for (const badge of badges ?? []) {
    const existing = byMember.get(badge.profile_id)
    if (existing) existing.push(badge)
    else byMember.set(badge.profile_id, [badge])
  }
  return byMember
}
